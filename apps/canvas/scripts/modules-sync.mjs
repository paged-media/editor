#!/usr/bin/env node
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

// Wasm modules are hosted, not deployed (ADR 220). After a build, every
// `.wasm` in the output is identified by CONTENT — matched byte-for-byte
// against the wasm files inside the installed @paged-media packages — so its
// module-host key is `<package>/<version>/<path in the package>`, immutable
// per published version. Each one is uploaded to the module host
// (modules.paged.media, R2 bucket `paged-modules`) brotli-compressed, unless
// it is already there; then it is REMOVED from the output and a same-origin
// 302 takes its place in `_redirects`. The plugins keep fetching the URLs they
// always did (Vite `?url`, plugin-data's `bin/`); the browser follows the
// redirect, decodes brotli on the fly and caches the module for a year, shared
// across every site that loads the same version.
//
// The module door (ADR 223) answers a plugin's DECLARED wasm with its
// module-host URL straight away, emitted by this build or not; so every
// module in the build's module manifest (scripts/module-index.mjs) is made
// sure of too, uploaded from the installed package when it is missing.
// Package discovery, host versions and the manifest live in module-index.mjs,
// shared with vite.config.ts so the two cannot disagree about a module's key.
//
//   node scripts/modules-sync.mjs <dist-dir> [--dry-run]
//
// Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID with R2 write access
// (not for --dry-run). A wasm that matches no package is an error: a module
// without a version has no immutable home.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

import { APP, MODULE_HOST, buildModuleManifest, packageIndex, sha, toPosix as posix, walkWasm as walk } from "./module-index.mjs";

export { MODULE_HOST };
const BUCKET = process.env.PAGED_MODULE_BUCKET ?? "paged-modules";

async function present(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

function upload(key, file) {
  const raw = readFileSync(file);
  const br = brotliCompressSync(raw, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 10, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
  });
  // In a temp dir: the file may be inside the package store (a declared
  // module this build did not emit).
  const dir = mkdtempSync(join(tmpdir(), "paged-modules-"));
  const tmp = join(dir, "module.wasm.br");
  writeFileSync(tmp, br);
  execFileSync(
    "npx",
    [
      "-y", "wrangler@3", "r2", "object", "put", `${BUCKET}/${key}`,
      "--file", tmp,
      "--content-type", "application/wasm",
      "--content-encoding", "br",
      "--cache-control", "public, max-age=31536000, immutable",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  rmSync(dir, { recursive: true, force: true });
  return br.length;
}

/** The installed root of package `name` (realpath), or null. */
function rootOf(name) {
  for (const base of [join(APP, "node_modules"), join(APP, "..", "..", "node_modules")]) {
    const p = join(base, ...name.split("/"));
    if (existsSync(join(p, "package.json"))) return p;
  }
  return null;
}

const dist = resolve(process.argv[2] ?? "dist-demo");
const dry = process.argv.includes("--dry-run");
const index = packageIndex();
const modules = [];
let failed = false;

for (const file of walk(dist, [], false)) {
  const raw = readFileSync(file);
  const hit = index.get(sha("sha256", raw));
  const served = "/" + posix(relative(dist, file));
  if (!hit) {
    console.error(`::error::${served} matches no installed @paged-media package — a module needs a version to be hosted`);
    failed = true;
    continue;
  }
  const key = `${hit.name}/${hit.version}/${hit.path}`;
  const url = `${MODULE_HOST}/${key}`;
  let note = "already hosted";
  if (!(await present(url))) {
    if (dry) note = "would upload";
    else note = `uploaded (${(upload(key, file) / 1048576).toFixed(1)} MiB brotli)`;
  }
  modules.push({ served, url, package: hit.name, version: hit.version, path: hit.path, bytes: raw.length, sha384: `sha384-${sha("sha384", raw)}` });
  console.log(`${served} → ${url} · ${(raw.length / 1048576).toFixed(1)} MiB · ${note}`);
}
// The module door (ADR 223) answers every DECLARED plugin artifact in the
// build's module manifest with its module-host URL, whether or not this build
// emitted the file. Each of them must be hosted too, from the installed
// package, or a bundle that adopted the door would be pointed at a 404.
const emitted = new Set(modules.map((m) => m.url));
const declared = buildModuleManifest({ app: APP, host: MODULE_HOST });
for (const [pkgName, pkg] of Object.entries(declared.packages)) {
  const root = rootOf(pkgName);
  for (const [path, file] of Object.entries(pkg.files)) {
    const key = `${pkgName}/${file.version}/${path}`;
    const url = `${MODULE_HOST}/${key}`;
    if (emitted.has(url)) continue;
    let note = "already hosted";
    if (!(await present(url))) {
      if (dry) note = "would upload";
      else if (!root) {
        console.error(`::error::${url} is declared but ${pkgName} is not installed`);
        failed = true;
        continue;
      } else note = `uploaded (${(upload(key, join(root, ...path.split("/"))) / 1048576).toFixed(1)} MiB brotli)`;
    }
    console.log(`(declared) ${url} · ${note}`);
  }
}
if (failed) process.exit(1);
if (dry) process.exit(0);

// The output keeps a 302 where each module was, and a record of what it hosts.
const redirects = modules.map((m) => `${m.served} ${m.url} 302`).join("\n");
appendFileSync(join(dist, "_redirects"), `\n# Wasm modules are hosted at ${MODULE_HOST} (ADR 220).\n${redirects}\n`);
for (const m of modules) rmSync(join(dist, m.served));
writeFileSync(join(dist, "modules.json"), JSON.stringify({ host: MODULE_HOST, modules }, null, 1));
console.log(`modules: ${modules.length} hosted, removed from the deploy, redirected`);
