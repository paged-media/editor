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

// SITE MODE (`?site=1`) — the editor as paged.media's own shell (website ADR
// 855). The marketing site embeds this app full-viewport and hands it the
// page the visitor is reading as a real `.paged` document: the site's static
// HTML is the crawler/phone tier, this is the same content open in the real
// editor. This module is the state both halves share: the bridge writes it
// (from the parent's messages), the Site panel reads it.

import { useSyncExternalStore } from "react";

export const SITE = (() => {
  try {
    return new URLSearchParams(window.location.search).get("site") === "1";
  } catch {
    return false;
  }
})();

/** What paged.media tells us about itself (its public/site/manifest.json). */
export interface SiteProduct {
  name: string;
  role: string;
  pitch: string;
  license: string;
  maturity: string;
  repo: string;
  proof: Array<[string, string]>;
  packages: Array<{ name: string; version: string | null }>;
  solo?: string | null;
}

export interface SiteRoute {
  title: string;
  pages: Array<{ id: string; title: string }>;
  product?: SiteProduct | null;
}

export interface SiteManifest {
  routes: Record<string, SiteRoute>;
  nav?: Array<{ route: string; title: string; group?: string }>;
  links?: Array<{ title: string; href: string }>;
  headline?: Record<string, number>;
}

interface SiteState {
  manifest: SiteManifest | null;
  route: string | null;
  page: number;
  pageCount: number;
  loading: string | null;
}

let state: SiteState = { manifest: null, route: null, page: 0, pageCount: 0, loading: null };
const listeners = new Set<() => void>();

export function setSiteState(patch: Partial<SiteState>): void {
  state = { ...state, ...patch };
  for (const l of [...listeners]) l();
}

export function getSiteState(): SiteState {
  return state;
}

export function useSiteState(): SiteState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Requests the panel makes of the parent page (the bridge posts them). */
type Outbound = { type: "paged:navigate"; route?: string; href?: string; read?: boolean };
let post: ((msg: Outbound) => void) | null = null;
export function setSitePoster(fn: ((msg: Outbound) => void) | null): void {
  post = fn;
}
export function siteNavigate(msg: Omit<Outbound, "type">): void {
  post?.({ type: "paged:navigate", ...msg });
}
