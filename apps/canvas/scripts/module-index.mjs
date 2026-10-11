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
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// The installed @paged-media packages as MODULES (ADR 220, ADR 222). Two
// readers share this file so they cannot disagree about a module's home:
//
//   - scripts/modules-sync.mjs, after a build: which package + version +
//     path a .wasm in the output is (matched by content), so it can be hosted
//     at <host>/<package>/<version>/<path> and redirected;
//   - vite.config.ts, at build time: the MODULE MANIFEST the editor's
//     module door answers from (src/plugin-modules.ts) — every plugin bundle
//     installed here, and the sha384 + host version of each wasm artifact it
//     declares in `capabilities.wasm`.
//
// A package installed from npm is immutable per version, so its host
// version is its npm version. One linked from a source checkout (`link:`,
// e.g. @paged-media/doc until its first publish) is not — its bytes change
// under the same version — so its host version carries the file's content
// hash: `<version>+<sha256 prefix>`.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MODULE_HOST = process.env.PAGED_MODULE_HOST ?? "https://modules.paged.media";

export const sha = (alg, buf) => createHash(alg).update(buf).digest(alg === "sha384" ? "base64" : "hex");
export const toPosix = (p) => p.split(sep).join("/");

/** Every `.wasm` under `dir` (absolute paths). */
export function walkWasm(dir, out = [], skipNodeModules = true) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (skipNodeModules && name === "node_modules") continue;
      walkWasm(p, out, skipNodeModules);
    } else if (name.endsWith(".wasm")) out.push(p);
  }
  return out;
}

/** The installed @paged-media packages: `{ name, version, root, published }`,
 *  one per real directory (pnpm links one store entry from many places). */
export function pagedPackages(app = APP) {
  const roots = new Set();
  for (const base of [join(app, "node_modules", "@paged-media"), join(app, "..", "..", "node_modules", "@paged-media")]) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      try {
        roots.add(realpathSync(join(base, name)));
      } catch {
        /* a dangling link */
      }
    }
  }
  const out = [];
  for (const root of roots) {
    const pkgFile = join(root, "package.json");
    if (!existsSync(pkgFile)) continue;
    const { name, version } = JSON.parse(readFileSync(pkgFile, "utf8"));
    out.push({ name, version, root, published: toPosix(root).includes("/node_modules/.pnpm/") });
  }
  return out;
}

/** The immutable host version of one file of `pkg`. */
export function hostVersion(pkg, bytes) {
  return pkg.published ? pkg.version : `${pkg.version}+${sha("sha256", bytes).slice(0, 12)}`;
}

/** Every wasm inside the installed @paged-media packages, by sha256 →
 *  `{ name, version, path }` (version = host version). */
export function packageIndex(app = APP) {
  const index = new Map();
  for (const pkg of pagedPackages(app)) {
    for (const file of walkWasm(pkg.root)) {
      const bytes = readFileSync(file);
      const hash = sha("sha256", bytes);
      if (!index.has(hash)) {
        index.set(hash, { name: pkg.name, version: hostVersion(pkg, bytes), path: toPosix(relative(pkg.root, file)) });
      }
    }
  }
  return index;
}

/**
 * The module manifest the editor's module door answers from:
 *
 *   {
 *     host: "https://modules.paged.media" | null,   // null: not hosted (dev, plain builds)
 *     packages: { "<package>": { version, files: { "<path in package>": { integrity, version } } } },
 *     plugins:  { "<manifest id>": { package: "<package>", base: "<manifest dir in package>" } },
 *   }
 *
 * Only the wasm artifacts a plugin DECLARES are listed (the door resolves
 * nothing else); a declared file the package does not ship is left out, so
 * the door answers null for it. With `dev`, each file also carries its
 * absolute path (`fs`), which the dev server serves under `/@fs/`.
 */
export function buildModuleManifest({ app = APP, host = null, dev = false } = {}) {
  const packages = {};
  const plugins = {};
  for (const pkg of pagedPackages(app)) {
    const manifestFile = join(pkg.root, "manifest.json");
    if (!existsSync(manifestFile)) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    } catch {
      continue;
    }
    const wasm = manifest?.capabilities?.wasm;
    if (typeof manifest?.id !== "string" || !Array.isArray(wasm)) continue;
    const base = toPosix(relative(pkg.root, dirname(manifestFile)));
    const files = {};
    for (const a of wasm) {
      if (typeof a?.path !== "string") continue;
      const path = posix.normalize(posix.join(base, a.path));
      if (path.startsWith("..")) continue;
      const file = join(pkg.root, ...path.split("/"));
      if (!existsSync(file)) continue;
      const bytes = readFileSync(file);
      files[path] = {
        integrity: `sha384-${sha("sha384", bytes)}`,
        version: hostVersion(pkg, bytes),
        ...(dev ? { fs: toPosix(file) } : {}),
      };
    }
    if (Object.keys(files).length === 0) continue;
    plugins[manifest.id] = { package: pkg.name, base };
    packages[pkg.name] = { version: pkg.version, files };
  }
  return { host, packages, plugins };
}
