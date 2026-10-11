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
//   node scripts/modules-sync.mjs <dist-dir> [--dry-run]
//
// Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID with R2 write access
// (not for --dry-run). A wasm that matches no package is an error: a module
// without a version has no immutable home.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";

export const MODULE_HOST = process.env.PAGED_MODULE_HOST ?? "https://modules.paged.media";
const BUCKET = process.env.PAGED_MODULE_BUCKET ?? "paged-modules";
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const sha = (alg, buf) => createHash(alg).update(buf).digest(alg === "sha384" ? "base64" : "hex");
const posix = (p) => p.split(sep).join("/");

function walk(dir, out = [], skipNodeModules = true) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (skipNodeModules && name === "node_modules") continue;
      walk(p, out, skipNodeModules);
    } else if (name.endsWith(".wasm")) out.push(p);
  }
  return out;
}

/** Every wasm inside the installed @paged-media packages, by sha256. */
function packageIndex() {
  const roots = new Set();
  for (const base of [join(APP, "node_modules", "@paged-media"), join(APP, "..", "..", "node_modules", "@paged-media")]) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      try {
        roots.add(realpathSync(join(base, name)));
      } catch {
        /* a dangling link */
      }
    }
  }
  const index = new Map();
  for (const root of roots) {
    const pkgFile = join(root, "package.json");
    if (!existsSync(pkgFile)) continue;
    const { name, version } = JSON.parse(readFileSync(pkgFile, "utf8"));
    // A package installed from npm is immutable per version. One linked from a
    // source checkout (`link:`, e.g. @paged-media/doc until its first publish)
    // is not — its bytes change under the same version — so its key carries
    // the content hash too.
    const published = posix(root).includes("/node_modules/.pnpm/");
    for (const file of walk(root)) {
      const hash = sha("sha256", readFileSync(file));
      const v = published ? version : `${version}+${hash.slice(0, 12)}`;
      if (!index.has(hash)) index.set(hash, { name, version: v, path: posix(relative(root, file)) });
    }
  }
  return index;
}

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
  const tmp = `${file}.br`;
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
  rmSync(tmp);
  return br.length;
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
if (failed) process.exit(1);
if (dry) process.exit(0);

// The output keeps a 302 where each module was, and a record of what it hosts.
const redirects = modules.map((m) => `${m.served} ${m.url} 302`).join("\n");
appendFileSync(join(dist, "_redirects"), `\n# Wasm modules are hosted at ${MODULE_HOST} (ADR 220).\n${redirects}\n`);
for (const m of modules) rmSync(join(dist, m.served));
writeFileSync(join(dist, "modules.json"), JSON.stringify({ host: MODULE_HOST, modules }, null, 1));
console.log(`modules: ${modules.length} hosted, removed from the deploy, redirected`);
