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
// D-03 — the page's network wall (`connect-src`), computed in ONE place
// (ADR 218). Pure and dependency-free: vite.config.ts builds the dev header,
// the injected `<meta>` and the shipped `_headers` from it, the consent
// dialog asks it whether a consented origin is actually reachable, and
// scripts/network-policy.test.mjs tests it under node.
//
// The floor admits same-origin and local bytes only. A deployment may admit
// EXACT data origins at build time (`PAGED_DATA_ORIGINS`, comma or space
// separated): a remote data source on such an origin is then reachable once
// the user also consents to it in the editor (the plugin's own gate). A header
// CSP cannot follow runtime grants — it is fixed when the page loads — so an
// origin the user consents to but the deployment did not list stays
// unreachable, and the consent dialog says so.

/** Same-origin + local bytes — the editor's own network surface. */
export const CONNECT_SRC_FLOOR = "connect-src 'self' blob: data:";

/** The environment variable a build reads its admitted data origins from. */
export const DATA_ORIGINS_ENV = "PAGED_DATA_ORIGINS";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Parse a configured origin list. Each entry must be an exact origin:
 *  `https://host[:port]` (or `http://` on a loopback host, for local
 *  development) — no path, no query, no wildcard, no bare scheme. Anything
 *  else throws: a typo must fail the build, not silently widen or drop the
 *  wall. Duplicates are removed; order is kept. */
export function parseDataOrigins(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "") return [];
  const out: string[] = [];
  for (const entry of raw.split(/[\s,]+/).filter(Boolean)) {
    if (entry.includes("*")) {
      throw new Error(`${DATA_ORIGINS_ENV}: "${entry}" — wildcards are not allowed; list exact origins`);
    }
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(`${DATA_ORIGINS_ENV}: "${entry}" is not an origin (expected https://host[:port])`);
    }
    const secure = url.protocol === "https:";
    const localDev = url.protocol === "http:" && LOOPBACK.has(url.hostname);
    if (!secure && !localDev) {
      throw new Error(`${DATA_ORIGINS_ENV}: "${entry}" — only https:// origins (http:// on loopback)`);
    }
    if (url.username || url.password) {
      throw new Error(`${DATA_ORIGINS_ENV}: "${entry}" carries credentials`);
    }
    const bare = entry.replace(/\/+$/, "");
    if (bare !== url.origin) {
      throw new Error(`${DATA_ORIGINS_ENV}: "${entry}" is not an exact origin (did you mean ${url.origin}?)`);
    }
    if (!out.includes(url.origin)) out.push(url.origin);
  }
  return out;
}

/** The `connect-src` directive for a set of admitted data origins. */
export function connectSrc(origins: readonly string[]): string {
  return origins.length ? `${CONNECT_SRC_FLOOR} ${origins.join(" ")}` : CONNECT_SRC_FLOOR;
}

/** Replace the `Content-Security-Policy:` line of a `_headers` file. Throws
 *  when the file has none (the wall must never go missing in a rewrite). */
export function rewriteHeadersCsp(headers: string, policy: string): string {
  const re = /^(\s*Content-Security-Policy:\s*).*$/m;
  if (!re.test(headers)) {
    throw new Error("_headers has no Content-Security-Policy line to rewrite");
  }
  return headers.replace(re, `$1${policy}`);
}

/** Whether the page's wall admits a consented origin. */
export function wallAdmits(origin: string, admitted: readonly string[], self?: string): boolean {
  return (self !== undefined && origin === self) || admitted.includes(origin);
}
