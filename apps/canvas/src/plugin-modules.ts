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

// ADR 223 — the editor's `ModulesBackend`, behind plugin-sdk's `host.modules`
// door (plugin-sdk ADR 326): a bundle asks the HOST where one of its declared
// wasm artifacts lives, and the editor answers from the MODULE MANIFEST the
// build generated (scripts/module-index.mjs → `virtual:paged-modules`):
//
//   - a deployed build (PAGED_MODULES_HOSTED=1) answers the module host,
//     `https://modules.paged.media/<package>/<version>/<path>` — the deploy's
//     modules-sync makes sure every listed module is there (ADR 220);
//   - the dev server answers the installed file under `/@fs/`, so dev runs the
//     same door with the same integrity;
//   - any other build answers null, and the bundle loads its own copy.
//
// Every answer carries the bytes' sha384 (Subresource Integrity), measured
// from the installed package at build time. The SDK door owns the capability
// gate: this backend is only ever asked about an artifact the bundle
// DECLARED, and it answers only for packages and paths in the manifest —
// never a URL a bundle typed.
//
// The pinned plugin-sdk may predate the door; `loadBundle` ignores options it
// does not know, so `modules` rides along inert until the pin moves. Hence the
// local types below: they are structurally the SDK's `ModulesBackend`.

/** One declared artifact of an installed plugin package. */
export interface ModuleFile {
  /** `sha384-…` of the installed bytes. */
  integrity: string;
  /** The immutable host version (npm version; `+<hash>` for a linked package). */
  version: string;
  /** Dev only: the absolute path the dev server serves under `/@fs/`. */
  fs?: string;
}

/** What the build knows about the plugin packages' wasm (scripts/module-index.mjs). */
export interface ModuleManifest {
  /** The module host this build is deployed against, or null (not hosted). */
  host: string | null;
  packages: Record<string, { version: string; files: Record<string, ModuleFile> }>;
  plugins: Record<string, { package: string; base: string }>;
}

/** The artifact fields the backend reads (plugin-api `WasmArtifact`). */
export interface ModuleArtifact {
  name: string;
  path: string;
}

/** Structurally plugin-sdk's `ModulesBackend` (0.2.51+). */
export interface EditorModulesBackend {
  url(pluginId: string, artifact: ModuleArtifact): { url: string; integrity: string } | null;
}

/** `base` + a bundle-relative path, normalised; null when it escapes. */
function pathInPackage(base: string, path: string): string | null {
  const out: string[] = [];
  for (const seg of `${base}/${path}`.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join("/");
}

/**
 * The editor's module backend over a build's module manifest. `origin` is
 * the page origin, for the dev `/@fs/` URLs (absolute, as the door requires).
 */
export function createEditorModulesBackend(
  manifest: ModuleManifest,
  origin: string,
): EditorModulesBackend {
  return {
    url(pluginId, artifact) {
      const plugin = manifest.plugins[pluginId];
      if (!plugin) return null;
      const pkg = manifest.packages[plugin.package];
      const path = pathInPackage(plugin.base, artifact.path);
      const file = path === null ? undefined : pkg?.files[path];
      if (!file || path === null) return null;
      if (manifest.host) {
        const host = manifest.host.replace(/\/+$/, "");
        return { url: `${host}/${plugin.package}/${file.version}/${path}`, integrity: file.integrity };
      }
      if (file.fs) {
        return { url: new URL(`/@fs${file.fs.startsWith("/") ? "" : "/"}${file.fs}`, origin).href, integrity: file.integrity };
      }
      return null;
    },
  };
}
