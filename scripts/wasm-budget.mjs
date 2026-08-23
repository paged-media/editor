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

// The APP-WIDE wasm budget: 100 MB for the whole editor including every
// plugin (maintainer decision, 2026-08-19).
//
// Why this script exists at all: until now every wasm ceiling in the
// platform was PER THING — plugin-sdk's `WASM_BUDGETS.maxArtifactBytes`
// caps one artifact, plugin-cli's gate validates one manifest, each
// plugin's `build-wasm.sh` weighs its own output. Nothing anywhere
// measured the sum. Eight bundles could each pass their own gate and the
// app could still ship a quarter of a gigabyte of WebAssembly, and no
// check in any repo would have noticed. That is the number a user
// downloads, so that is the number worth governing.
//
// What it measures: every `.wasm` the canvas app can resolve through its
// own `node_modules`, deduplicated BY REAL PATH. The dedupe is
// load-bearing — pnpm gives each workspace package its own
// `node_modules/@paged-media/canvas-wasm` symlink into one store entry,
// so a naive walk counts the same 19.9 MiB engine five times and reports
// ~286 MiB for an app that ships far less. Distinct files are what the
// bundler emits and what the browser downloads.
//
// Usage:  node scripts/wasm-budget.mjs [--json]
// Exit 1 when over budget; prints the full inventory either way.

import { readdirSync, statSync, realpathSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "apps/canvas");

/** The app-wide ceiling. 100 MB decimal, as a download is quoted. */
export const APP_WASM_BUDGET_BYTES = 100 * 1000 * 1000;

/** Every `.wasm` under `dir`, following symlinks, depth-limited. */
function wasmFilesUnder(dir, depth = 0, out = []) {
  if (depth > 8) return out;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    let st;
    try {
      st = statSync(p); // statSync follows symlinks; pnpm links everything
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // Don't descend into a nested node_modules: those copies are
      // reached through their owning package's own entry instead, and
      // descending doubles the walk for no new distinct files.
      if (e.name === "node_modules") continue;
      wasmFilesUnder(p, depth + 1, out);
    } else if (e.name.endsWith(".wasm")) {
      out.push(p);
    }
  }
  return out;
}

export function collect() {
  const scope = join(APP, "node_modules/@paged-media");
  let pkgs;
  try {
    pkgs = readdirSync(scope);
  } catch {
    throw new Error(
      `no ${relative(ROOT, scope)} — run \`pnpm install\` before the wasm budget check`,
    );
  }

  // realpath -> {bytes, owners[]}. One physical artifact, however many
  // packages link to it, is one download.
  const byReal = new Map();
  for (const pkg of pkgs.sort()) {
    for (const f of wasmFilesUnder(join(scope, pkg))) {
      let real;
      try {
        real = realpathSync(f);
      } catch {
        continue;
      }
      const entry = byReal.get(real) ?? {
        bytes: statSync(real).size,
        owners: [],
      };
      if (!entry.owners.includes(pkg)) entry.owners.push(pkg);
      byReal.set(real, entry);
    }
  }

  const artifacts = [...byReal.entries()]
    .map(([real, v]) => ({
      file: real.replace(/^.*\/node_modules\//, ""),
      bytes: v.bytes,
      owners: v.owners,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const total = artifacts.reduce((s, a) => s + a.bytes, 0);
  return { artifacts, total, budget: APP_WASM_BUDGET_BYTES };
}

const mb = (n) => (n / 1_000_000).toFixed(1);

/** `--json-out <path>` — write the measurement artifact as a SIDE EFFECT and
 *  still exit on the budget the way the gate always did.
 *
 *  Deliberately not `--json | tee file`: a pipe replaces this process's exit
 *  code with tee's, which would turn the budget gate into a gate that always
 *  passes. One invocation, gate on exit, file written on the way past. */
function jsonOutPath() {
  const i = process.argv.indexOf("--json-out");
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function main() {
  const json = process.argv.includes("--json");
  const outPath = jsonOutPath();
  const { artifacts, total, budget } = collect();

  if (outPath) {
    // The measurement shape, not the inventory shape: one total plus one row
    // per artifact, each carrying the budget it is measured against. Per-file
    // detail stays in the CI log; only these aggregates are meant to be
    // trended.
    const doc = {
      contract: 1,
      source: "editor",
      lane: "wasm-budget",
      commit: process.env.GITHUB_SHA ?? "unknown",
      branch: process.env.GITHUB_REF_NAME ?? "main",
      ...(process.env.GITHUB_RUN_ID ? { run_id: String(process.env.GITHUB_RUN_ID) } : {}),
      finished_at: new Date().toISOString(),
      environment: { os: process.env.RUNNER_OS ?? process.platform, arch: process.arch },
      // AGGREGATES ONLY, and one of them deliberately.
      //
      // A row per artifact would key the series on a FILE PATH — an
      // effectively open set that churns whenever a dependency is renamed,
      // and paths in a committed trend file are noise at best. The count of
      // artifacts is the useful summary; the per-file inventory stays in the
      // CI log above, where you read it while triaging.
      measurements: [
        {
          metric: "wasm.app_total_bytes",
          subject: "app",
          value: total,
          unit: "bytes",
          status: "ok",
          budget,
        },
        {
          metric: "wasm.artifact_count",
          subject: "app",
          value: artifacts.length,
          unit: "count",
          status: "ok",
        },
      ],
    };
    writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  }

  if (json) {
    console.log(JSON.stringify({ artifacts, total, budget }, null, 2));
  } else {
    console.log("app-wide wasm inventory (distinct artifacts):\n");
    for (const a of artifacts) {
      console.log(
        `  ${mb(a.bytes).padStart(7)} MB  ${a.file}` +
          (a.owners.length > 1 ? `  [shared by ${a.owners.length}]` : ""),
      );
    }
    console.log(
      `\n  ${mb(total).padStart(7)} MB  TOTAL across ${artifacts.length} artifact(s)` +
        `\n  ${mb(budget).padStart(7)} MB  budget (whole app, all plugins)`,
    );
  }

  if (total > budget) {
    console.error(
      `\n::error::app-wide wasm budget exceeded: ${mb(total)} MB > ${mb(budget)} MB.\n` +
        `The cap covers the editor AND every plugin together — the number a user downloads.\n` +
        `Shrink an artifact (wasm-opt -Oz, drop a vendored engine) rather than raising this;\n` +
        `raising it is a maintainer decision and belongs in a commit that says why.`,
    );
    process.exit(1);
  }
  console.log(`\nwasm budget OK — ${mb(budget - total)} MB headroom.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
