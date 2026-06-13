// K-3 / S-07 / I-02 — the editor's `WorkerBackend` over the real `Worker`
// API, backing `host.workers`. Lets a bundle (paged.image's decode pool,
// paged.data's DuckDB worker) spawn an off-main-thread worker for the
// bundle's OWN compute.
//
// The SDK door (plugin-sdk `host-impl.ts`) owns everything trust-shaped:
// the capability gate (an undeclared `capabilities.workers` rejects), the
// worker-count cap (`min(declared.max, hardwareConcurrency, 8)`), the
// `SharedArrayBuffer` byte budget (the per-bundle ceiling, gated on
// `sharedMemory` + `crossOriginIsolated` — both already live here via the
// dev/prod COOP/COEP headers), the teardown tracking, and the no-backend
// honest path. This module owns only the raw IO the SDK cannot: resolving
// a bundle's DECLARED, bundle-relative module path to a real served URL
// and constructing the `Worker`.
//
// DECLARED-ONLY, like the wasm artifacts: a bundle never spawns an
// arbitrary URL. Each first-party bundle that declares `capabilities.
// workers` registers a RESOLVER (a `pluginId` → bundle-relative-path → URL
// function) — built with Vite's `new Worker(new URL(..., import.meta.url))`
// / `?worker&url` affordance so the worker chunk is bundled and served (the
// same `/@fs/`-allowed sibling-plugin path the wasm artifacts resolve
// through). An undeclared plugin id or an unknown module path REJECTS
// honestly — the bundle can only spawn a module the editor knows it ships.
//
// Trust line (v1, in-process): the worker gets NO ambient authority — the
// editor hands it no engine/DOM/network handle; it is a plain ES-module
// worker the bundle's own glue drives over `postMessage`. Honesty +
// accident-prevention, not a security boundary (the isolate migration is
// the real boundary).

import type { SpawnedWorker, WorkerBackend } from "@paged-media/plugin-sdk";

/**
 * Resolves a bundle's DECLARED, bundle-relative module path to a URL the
 * dev/prod server serves. One per worker-declaring bundle; built with
 * Vite's `new URL("./relative", import.meta.url)` so the worker module is
 * a bundled, served asset. Returning `null` for an unknown path is the
 * honest "this bundle doesn't ship that module" answer (the declared-only
 * contract — the editor never invents a URL).
 */
export type BundleWorkerModuleResolver = (
  module: string,
) => string | URL | null;

/**
 * Build the editor's `WorkerBackend` from a per-plugin resolver registry.
 * `resolvers[pluginId](module)` produces the served URL for one of that
 * bundle's declared module paths; an unregistered plugin or an unresolved
 * path REJECTS (the declared-only gate, surfaced as a spawn rejection the
 * SDK door propagates). The constructed `Worker` is an ES-module worker
 * with no ambient host authority.
 */
export function createEditorWorkerBackend(resolvers: {
  [pluginId: string]: BundleWorkerModuleResolver;
}): WorkerBackend {
  return {
    async spawn(pluginId, module, name): Promise<SpawnedWorker> {
      const resolver = resolvers[pluginId];
      if (!resolver) {
        throw new Error(
          `WorkerBackend: ${pluginId} has no registered worker-module ` +
            `resolver — only bundles the editor wires for workers can spawn ` +
            `(declared-only).`,
        );
      }
      const url = resolver(module);
      if (!url) {
        throw new Error(
          `WorkerBackend: ${pluginId} ships no worker module "${module}" — ` +
            `only a declared, bundle-relative module path resolves ` +
            `(declared-only; a bundle can't spawn an arbitrary URL).`,
        );
      }
      // An ES-module worker. The `name` aids devtools; the worker carries
      // no host handle (no engine/DOM/network) — it talks only to the
      // bundle's glue over postMessage.
      const worker = new Worker(url, {
        type: "module",
        name: name ?? `${pluginId}:${module}`,
      });
      // Fan-out so multiple onMessage subscribers each get the message
      // (the SDK adapter wraps these in tracked Disposables).
      const handlers = new Set<(m: unknown) => void>();
      const onMsg = (ev: MessageEvent) => {
        for (const h of handlers) h(ev.data);
      };
      worker.addEventListener("message", onMsg);
      // A worker error surfaces as a message-less event; log via console
      // (the SDK has no error channel on SpawnedWorker — a thrown decode
      // is reported by the bundle's own protocol over post/onMessage).
      const onErr = (ev: ErrorEvent) => {
        console.error(
          `[${pluginId}] worker "${module}" error:`,
          ev.message || ev.error || ev,
        );
      };
      worker.addEventListener("error", onErr);

      let terminated = false;
      const spawned: SpawnedWorker = {
        post(message, transfer) {
          if (terminated) return;
          // `postMessage(msg, transfer)` — the transfer list moves
          // ownership of the listed transferables (e.g. an ArrayBuffer).
          if (transfer && transfer.length) worker.postMessage(message, transfer);
          else worker.postMessage(message);
        },
        onMessage(handler) {
          if (terminated) return { dispose() {} };
          handlers.add(handler);
          return {
            dispose() {
              handlers.delete(handler);
            },
          };
        },
        terminate() {
          if (terminated) return;
          terminated = true;
          handlers.clear();
          worker.removeEventListener("message", onMsg);
          worker.removeEventListener("error", onErr);
          worker.terminate();
        },
      };
      return spawned;
    },
  };
}
