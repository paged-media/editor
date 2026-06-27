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

// Iframe scripting bridge (demo build) — lets an embedding page (the docs
// scripting playground at docs.paged.media) run paged.* source against this
// live editor over postMessage. Mounted only when the URL carries `?embed=script`.
//
// Protocol (origin-checked both ways):
//   parent → frame : { type: "paged:run", id, source, reseed? }
//   frame  → parent : { type: "paged:ready" }                       (canvas live + seeded doc)
//                     { type: "paged:result", id, output[], error } (after each run)
//
// On boot we open a blank document (the `file.new` command) so a script has
// something to act on — otherwise paged.* calls fail with "no document loaded".
//
// Seeded playgrounds: `?embed=script&seed=<name>` runs a named PURE-paged.*
// prelude (see ./seeds) after `file.new` and before `paged:ready`, so a script
// starts from real, addressable content with a frame selected. When a seed is
// configured, each `paged:run` re-blanks + re-seeds first (unless `reseed:false`)
// so a mutating snippet starts clean every time instead of stacking. No seed ⇒
// the bridge behaves exactly as before (a blank doc, no reseed).
//
// Origin allowlist is the configured docs origin (VITE_DOCS_ORIGIN, default
// https://docs.paged.media) plus localhost in dev — a message from anywhere else
// is ignored, so an arbitrary site can't drive the editor.

import { useEffect } from "react";
import { type CanvasHandleLike } from "@paged-media/shell";
import { seedPrelude } from "./seeds";

type ScriptClient = { executeScript(source: string): Promise<{ output: string[]; error: string | null }> };
type Handle = CanvasHandleLike & { client?: ScriptClient };

function allowedOrigins(): string[] {
  const configured = (import.meta.env.VITE_DOCS_ORIGIN as string | undefined) || "https://docs.paged.media";
  const list = [configured];
  if (import.meta.env.DEV) list.push("http://localhost:3000", "http://127.0.0.1:3000");
  return list;
}

function handle(): Handle | undefined {
  return (window as unknown as { __canvas?: Handle }).__canvas;
}

export function IframeScriptBridge(): null {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("embed") !== "script") return;

    const allowed = allowedOrigins();
    const isAllowed = (origin: string) => allowed.includes(origin);

    // A named seed prelude (pure paged.* source) configured via ?seed=<name>.
    const seedSource = seedPrelude(params.get("seed"));

    // Open a blank document so scripts have a page to act on, mirroring how the
    // command registry is invoked elsewhere (invoke ?? execute ?? run).
    const newDocument = async () => {
      const c = handle()?.registries?.commands as
        | { invoke?: (id: string) => unknown; execute?: (id: string) => unknown; run?: (id: string) => unknown }
        | undefined;
      const fn = c?.invoke ?? c?.execute ?? c?.run;
      if (fn) {
        try {
          // The registered id is namespaced `paged.file.new` (not `file.new`).
          await Promise.resolve(fn.call(c, "paged.file.new"));
        } catch {
          /* a starter doc is best-effort — the bridge still works without one */
        }
      }
    };

    // Blank the document, then run the configured seed prelude (if any). The
    // seed is pure paged.* so it runs through the same executeScript path the
    // user's snippet does — what seeds, ships and is what CI validates.
    const resetAndSeed = async () => {
      await newDocument();
      if (!seedSource) return;
      try {
        await handle()?.client?.executeScript(seedSource);
      } catch {
        /* a seed is best-effort — the playground still runs without it */
      }
    };

    let readySent = false;
    let booting = false;
    const postReady = () => {
      readySent = true;
      for (const origin of allowed) {
        try {
          window.parent.postMessage({ type: "paged:ready" }, origin);
        } catch {
          /* targetOrigin mismatch — harmless */
        }
      }
    };

    // The editor boots async (worker handshake); poll until the canvas client is
    // wired, then open a blank doc and announce readiness exactly once.
    const poll = window.setInterval(() => {
      if (readySent || booting || !handle()?.client) return;
      booting = true;
      void (async () => {
        await resetAndSeed();
        postReady();
        window.clearInterval(poll);
      })();
    }, 150);

    const onMessage = async (event: MessageEvent) => {
      if (!isAllowed(event.origin)) return;
      const data = event.data as { type?: string; id?: number; source?: string; reseed?: boolean };
      if (data?.type !== "paged:run" || typeof data.source !== "string") return;

      const reply = (payload: { output: string[]; error: string | null }) => {
        try {
          (event.source as WindowProxy | null)?.postMessage({ type: "paged:result", id: data.id, ...payload }, event.origin);
        } catch {
          /* source gone */
        }
      };

      const client = handle()?.client;
      if (!client) {
        reply({ output: [], error: "editor is still loading — try again in a moment" });
        return;
      }
      try {
        // When a seed is configured, re-blank + re-seed before each run so a
        // mutating snippet starts from identical content (Reset semantics),
        // unless the embedder explicitly opts out with reseed:false.
        if (seedSource && data.reseed !== false) {
          await resetAndSeed();
        }
        const result = await client.executeScript(data.source);
        reply({ output: result.output ?? [], error: result.error ?? null });
      } catch (err) {
        reply({ output: [], error: err instanceof Error ? err.message : String(err) });
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
