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
//   parent → frame : { type: "paged:run", id, source }
//   frame  → parent : { type: "paged:ready" }                       (once the canvas is live)
//                     { type: "paged:result", id, output[], error } (after each run)
//
// Origin allowlist is the configured docs origin (VITE_DOCS_ORIGIN, default
// https://docs.paged.media) plus localhost in dev — a message from anywhere else
// is ignored, so an arbitrary site can't drive the editor.

import { useEffect } from "react";
import { type CanvasHandleLike } from "@paged-media/shell";

type ScriptClient = { executeScript(source: string): Promise<{ output: string[]; error: string | null }> };

function allowedOrigins(): string[] {
  const configured = (import.meta.env.VITE_DOCS_ORIGIN as string | undefined) || "https://docs.paged.media";
  const list = [configured];
  if (import.meta.env.DEV) list.push("http://localhost:3000", "http://127.0.0.1:3000");
  return list;
}

function canvasClient(): ScriptClient | null {
  const handle = (window as unknown as { __canvas?: CanvasHandleLike & { client?: ScriptClient } }).__canvas;
  return handle?.client ?? null;
}

export function IframeScriptBridge(): null {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("embed") !== "script") return;

    const allowed = allowedOrigins();
    const isAllowed = (origin: string) => allowed.includes(origin);

    // Tell the embedder we're live, once the canvas client is wired up. The
    // editor boots async (worker handshake), so poll briefly rather than assume.
    let readySent = false;
    const announce = () => {
      if (readySent || !canvasClient()) return;
      readySent = true;
      for (const origin of allowed) {
        try {
          window.parent.postMessage({ type: "paged:ready" }, origin);
        } catch {
          /* targetOrigin mismatch — harmless */
        }
      }
    };
    const poll = window.setInterval(() => {
      announce();
      if (readySent) window.clearInterval(poll);
    }, 150);

    const onMessage = async (event: MessageEvent) => {
      if (!isAllowed(event.origin)) return;
      const data = event.data as { type?: string; id?: number; source?: string };
      if (data?.type !== "paged:run" || typeof data.source !== "string") return;

      const reply = (payload: { output: string[]; error: string | null }) => {
        try {
          (event.source as WindowProxy | null)?.postMessage({ type: "paged:result", id: data.id, ...payload }, event.origin);
        } catch {
          /* source gone */
        }
      };

      const client = canvasClient();
      if (!client) {
        reply({ output: [], error: "editor is still loading — try again in a moment" });
        return;
      }
      try {
        const result = await client.executeScript(data.source);
        reply({ output: result.output ?? [], error: result.error ?? null });
      } catch (err) {
        reply({ output: [], error: err instanceof Error ? err.message : String(err) });
      }
    };

    window.addEventListener("message", onMessage);
    announce();
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
