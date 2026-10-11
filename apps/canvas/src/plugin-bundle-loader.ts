/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// Code-split plugin bundles (ADR 222).
//
// Every bundle's JavaScript is a dynamic `import()`, so it is its own chunk
// and stays out of the entry. Two activation lanes:
//
//   · "boot"     — fetched in parallel right after the shell mounts and
//                  activated in the declared order. Document loads wait for
//                  this lane (`bootBundlesSettled`), so a document whose
//                  container parts a bundle restores is never opened before
//                  that bundle listens.
//   · "onDemand" — never fetched at boot. The host registers a placeholder
//                  importer for the file types the bundle claims; the first
//                  import activates the bundle and hands the file to the real
//                  importer. Only bundles whose WHOLE surface is an importer
//                  qualify (see the ADR for why the others do not).
//
// Pure apart from the injected `activate`, so the ordering, the StrictMode
// disposal race and the placeholder hand-over are unit-testable in node
// (`scripts/journal.test.mjs`).

import { errorIdent } from "@paged-media/client/journal";

import type {
  BundleLike,
  GuardDeps,
  LoadedBundleLike,
} from "./plugin-load-guard";

export type BundleLane = "boot" | "onDemand";

/** A placeholder importer for an on-demand bundle. Restated from the host
 *  manifest's importer id plus the file types the bundle's importer claims:
 *  the manifest names the importer but not its extensions. */
export interface LazyImporterSpec {
  id: string;
  title: string;
  extensions: readonly string[];
  mimeTypes?: readonly string[];
}

export interface BundleEntry<B extends BundleLike> {
  /** The bundle's manifest id, known BEFORE the chunk is fetched (solo
   *  filtering and on-demand lookup need it). Checked against the loaded
   *  manifest. */
  id: string;
  lane: BundleLane;
  load: () => Promise<B>;
  importers?: readonly LazyImporterSpec[];
}

/** The importer registry surface this module needs (shell `ImporterRegistry`). */
export interface ImporterRegistryLike {
  register(contribution: {
    id: string;
    title: string;
    extensions: readonly string[];
    mimeTypes?: readonly string[];
    import(file: {
      name: string;
      bytes: Uint8Array;
      mimeType: string;
    }): void | Promise<void>;
  }): { dispose(): void };
  resolve(
    fileName: string,
    mimeType?: string,
  ): {
    import(file: {
      name: string;
      bytes: Uint8Array;
      mimeType: string;
    }): void | Promise<void>;
  } | null;
}

export interface ActivatorDeps<B extends BundleLike, L extends LoadedBundleLike> {
  entries: readonly BundleEntry<B>[];
  /** The guarded loader (`createGuardedLoader`) — returns null on a throw. */
  activate: (bundle: B) => L | null;
  record: GuardDeps<B, L>["record"];
  publishProblem: GuardDeps<B, L>["publishProblem"];
  /** Present for the on-demand lane. */
  importers?: ImporterRegistryLike;
  now?: () => number;
}

export interface BundleActivator<L extends LoadedBundleLike> {
  /** Fetch + activate every "boot" entry (fetches in parallel, activates in
   *  declared order). Resolves when each has activated or failed. */
  boot(): Promise<void>;
  /** Fetch + activate one entry by manifest id, whatever its lane.
   *  Memoized; null when unknown, disposed or failed. */
  ensure(id: string): Promise<L | null>;
  /** Manifest ids currently active. */
  active(): string[];
  dispose(): void;
}

export function createBundleActivator<
  B extends BundleLike,
  L extends LoadedBundleLike,
>(deps: ActivatorDeps<B, L>): BundleActivator<L> {
  const now = deps.now ?? (() => performance.now());
  const byId = new Map(deps.entries.map((e) => [e.id, e]));
  const fetched = new Map<string, Promise<B | null>>();
  const activated = new Map<string, Promise<L | null>>();
  const live = new Map<string, L>();
  const placeholders = new Map<string, { dispose(): void }[]>();
  let disposed = false;

  const fail = (id: string, err: unknown, t0: number) => {
    deps.record({
      code: "plugin.activate",
      severity: "error",
      durMs: now() - t0,
      data: { ok: false, plugin: id, error: errorIdent(err) },
    });
    deps.publishProblem(id, "activation", [
      {
        severity: "error",
        message: `${id} failed to load: ${String(err)}`,
        source: "loadBundle",
      },
    ]);
  };

  const fetchEntry = (entry: BundleEntry<B>): Promise<B | null> => {
    let p = fetched.get(entry.id);
    if (!p) {
      const t0 = now();
      p = entry.load().then(
        (bundle) => {
          if (bundle.manifest.id !== entry.id) {
            fail(
              entry.id,
              new Error(
                `bundle table names ${entry.id} but the chunk ships ${bundle.manifest.id}`,
              ),
              t0,
            );
            return null;
          }
          return bundle;
        },
        (err: unknown) => {
          fail(entry.id, err, t0);
          return null;
        },
      );
      fetched.set(entry.id, p);
    }
    return p;
  };

  const activateFetched = (entry: BundleEntry<B>, bundle: B | null): L | null => {
    if (!bundle || disposed) return null;
    // An on-demand bundle's placeholders hold its importer ids; the real
    // contributions take them over here (the registry refuses duplicates).
    stepAside(entry.id);
    const handle = deps.activate(bundle);
    if (handle) live.set(entry.id, handle);
    else registerPlaceholders(entry);
    return handle;
  };

  const ensure = (id: string): Promise<L | null> => {
    const entry = byId.get(id);
    if (!entry || disposed) return Promise.resolve(null);
    let p = activated.get(id);
    if (!p) {
      p = fetchEntry(entry).then((b) => {
        // A chunk that failed to arrive may arrive next time (a network
        // blip): forget it so the next trigger fetches again.
        if (!b) {
          fetched.delete(id);
          activated.delete(id);
        }
        return activateFetched(entry, b);
      });
      activated.set(id, p);
    }
    return p;
  };

  const registerPlaceholders = (entry: BundleEntry<B>) => {
    const registry = deps.importers;
    if (!registry || !entry.importers?.length || disposed) return;
    const handles = entry.importers.map((spec) =>
      registry.register({
        ...spec,
        import: async (file) => {
          // ensure() swaps the placeholders for the real importers
          // (activateFetched); a failed activation puts them back.
          const loaded = await ensure(entry.id);
          const real = loaded ? registry.resolve(file.name, file.mimeType) : null;
          if (!real) {
            throw new Error(`${entry.id} could not be loaded to import ${file.name}`);
          }
          return real.import(file);
        },
      }),
    );
    placeholders.set(entry.id, handles);
  };
  const stepAside = (id: string) => {
    for (const h of placeholders.get(id) ?? []) h.dispose();
    placeholders.delete(id);
  };

  for (const entry of deps.entries) {
    if (entry.lane === "onDemand") registerPlaceholders(entry);
  }

  return {
    async boot() {
      const bootEntries = deps.entries.filter((e) => e.lane === "boot");
      // Fetch everything at once; activate strictly in the declared order so
      // registration order (menus, palette, provider rendezvous) is the one
      // the static imports produced.
      const pending = bootEntries.map((e) => fetchEntry(e));
      for (let i = 0; i < bootEntries.length; i++) {
        const entry = bootEntries[i]!;
        if (!activated.has(entry.id)) {
          activated.set(
            entry.id,
            pending[i]!.then((b) => activateFetched(entry, b)),
          );
        }
        await activated.get(entry.id);
      }
    },
    ensure,
    active: () => [...live.keys()],
    dispose() {
      disposed = true;
      for (const hs of placeholders.values()) for (const h of hs) h.dispose();
      placeholders.clear();
      for (const l of live.values()) l.dispose();
      live.clear();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Boot readiness — module scope, so the document-load gate and the test
// affordance see the same promise across StrictMode remounts.
// ─────────────────────────────────────────────────────────────────────

let resolveBoot: () => void = () => {};
let bootSettled = false;
const bootPromise = new Promise<void>((r) => {
  resolveBoot = r;
});

/** Called by the live activator once every boot bundle activated or failed. */
export function markBootBundlesSettled(): void {
  bootSettled = true;
  resolveBoot();
}

export function bootBundlesAreSettled(): boolean {
  return bootSettled;
}

/** A document load waits for the boot lane — bounded, so a chunk that never
 *  arrives (offline mid-boot) delays an open instead of blocking it forever.
 *  The failed bundle is already on the Problems panel by then. */
export function bootBundlesSettled(timeoutMs = 20_000): Promise<void> {
  if (bootSettled) return Promise.resolve();
  return Promise.race([
    bootPromise,
    new Promise<void>((r) => setTimeout(r, timeoutMs)),
  ]);
}
