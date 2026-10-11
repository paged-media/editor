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

// Site bridge (`?site=1`, website ADR 855) — paged.media drives this editor
// over postMessage. The parent page owns routing and history; the editor owns
// the document. Origin-checked both ways: only paged.media (and its Pages
// previews, and localhost in dev) may open documents here.
//
//   parent → frame : { type: "paged:open", bytes, name, fonts:[{family, style, bytes}], page, route }
//                    { type: "paged:site", manifest }
//                    { type: "paged:goto", page }
//   frame  → parent : { type: "paged:ready", protocol: 1 }
//                    { type: "paged:opened", route, pageCount }
//                    { type: "paged:page", route, page }          (the page the visitor is on)
//                    { type: "paged:navigate", route? | href? | read? }
//                    { type: "paged:error", message }
//
// Fonts are registered BEFORE the document opens: a .paged names its faces,
// it does not carry them, and a document opened first would be laid out in
// the fallback face.

import { useEffect } from "react";
import { pagesBackend } from "../plugin-pages";
import { SITE, getSiteState, setSitePoster, setSiteState, type SiteManifest } from "./site-state";

type OpenResult = { opened: true; pageIds: string[] } | { opened: false; reason: "declined" };
type FontClient = { registerFont(family: string, bytes: Uint8Array, style?: string | null): Promise<void> };

const ORIGIN_RULES: RegExp[] = [
  /^https:\/\/(www\.)?paged\.media$/,
  /^https:\/\/([a-z0-9-]+\.)?paged-website\.pages\.dev$/,
];

export function siteOriginAllowed(origin: string): boolean {
  if (ORIGIN_RULES.some((r) => r.test(origin))) return true;
  const extra = (import.meta.env.VITE_SITE_ORIGINS as string | undefined)?.split(",").map((s) => s.trim()) ?? [];
  if (extra.includes(origin)) return true;
  return import.meta.env.DEV && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function client(): FontClient | undefined {
  return (window as unknown as { __canvas?: { client?: FontClient } }).__canvas?.client;
}

export function SiteBridge({
  openDocument,
}: {
  openDocument: (bytes: Uint8Array, name: string) => Promise<OpenResult>;
}): null {
  useEffect(() => {
    if (!SITE || window.parent === window) return;
    let parentOrigin: string | null = null;
    let pageIds: string[] = [];
    const registered = new Set<string>();

    const send = (msg: Record<string, unknown>) => {
      if (parentOrigin) window.parent.postMessage(msg, parentOrigin);
    };
    setSitePoster((msg) => send(msg));

    // Announce readiness to the parent once the engine client is up. The
    // parent's origin is unknown until it speaks, so the first `ready` goes to
    // every allowed production origin and the parent answers with `paged:site`.
    const poll = window.setInterval(() => {
      if (!client()) return;
      window.clearInterval(poll);
      for (const o of ["https://paged.media", "https://www.paged.media"]) {
        try {
          window.parent.postMessage({ type: "paged:ready", protocol: 1 }, o);
        } catch {
          /* not this one */
        }
      }
      // A preview or local parent is reached through the referrer.
      try {
        const ref = document.referrer ? new URL(document.referrer).origin : null;
        if (ref && siteOriginAllowed(ref)) window.parent.postMessage({ type: "paged:ready", protocol: 1 }, ref);
      } catch {
        /* no referrer */
      }
    }, 120);

    const stopPage = pagesBackend.onDidChangeActivePage((pageId) => {
      const page = pageId ? pageIds.indexOf(pageId) : -1;
      if (page < 0) return;
      setSiteState({ page });
      send({ type: "paged:page", route: getSiteState().route, page });
    });

    const onMessage = async (event: MessageEvent) => {
      if (!siteOriginAllowed(event.origin)) return;
      parentOrigin = event.origin;
      const data = event.data as { type?: string } & Record<string, unknown>;
      try {
        if (data?.type === "paged:site") {
          setSiteState({ manifest: data.manifest as SiteManifest });
        } else if (data?.type === "paged:goto") {
          const id = pageIds[Number(data.page) || 0];
          if (id) pagesBackend.goToPage(id, "width");
        } else if (data?.type === "paged:open") {
          const route = String(data.route ?? "");
          const name = String(data.name ?? "paged.media");
          setSiteState({ loading: route });
          const c = client();
          if (!c) throw new Error("the editor is still starting");
          const fonts = (data.fonts as Array<{ family: string; style: string | null; bytes: ArrayBuffer }>) ?? [];
          for (const f of fonts) {
            const key = `${f.family}|${f.style ?? ""}`;
            if (registered.has(key)) continue;
            await c.registerFont(f.family, new Uint8Array(f.bytes), f.style);
            registered.add(key);
          }
          const result = await openDocument(new Uint8Array(data.bytes as ArrayBuffer), name);
          if (!result.opened) {
            // The visitor kept their edits: stay, and tell the parent so its URL
            // goes back to the page that is actually open.
            setSiteState({ loading: null });
            send({ type: "paged:page", route: getSiteState().route, page: getSiteState().page, declined: true });
            return;
          }
          pageIds = result.pageIds;
          const page = Math.min(Math.max(0, Number(data.page) || 0), pageIds.length - 1);
          setSiteState({ route, page, pageCount: pageIds.length, loading: null });
          // Let the canvas lay the document out before moving the camera.
          window.setTimeout(() => pagesBackend.goToPage(pageIds[page], "width"), 60);
          send({ type: "paged:opened", route, pageCount: pageIds.length });
        }
      } catch (e) {
        setSiteState({ loading: null });
        send({ type: "paged:error", message: e instanceof Error ? e.message : String(e) });
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.clearInterval(poll);
      stopPage();
      setSitePoster(null);
      window.removeEventListener("message", onMessage);
    };
  }, [openDocument]);
  return null;
}
