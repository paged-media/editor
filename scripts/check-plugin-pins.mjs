#!/usr/bin/env node
// Plugin-canary drift check — the bundle half of the Decision-B
// package-boundary model.
//
// `check-protocol-version.sh` guards the ENGINE boundary (protocol.ts vs
// the installed @paged-media/canvas-wasm minor). This guards the PLUGIN
// boundary, which had no check at all and had quietly drifted on six of
// eight bundles by 2026-08-04:
//
//     data canary.1→3 · draw canary.1→5 · image canary.0→3
//     pdf 0.2.3→0.2.5 · sheet canary.1→3 · web canary.1→3
//
// The failure mode is silent and expensive. The editor consumes plugins as
// PUBLISHED npm canaries, so a feature can be built, tested and committed
// in a plugin repo and still be absent from the running editor — and every
// signal a developer looks at (the plugin's own suite, its registry rows,
// its manifest) says "shipped". The only place the truth shows is this pin.
// A previously-recorded single-plugin skew was read as a one-off slip; it
// was not, because nothing checked.
//
// This is deliberately a RELEASE-TIME gate, not part of `pnpm test`: while
// a plugin campaign is in flight the repo being ahead of the pin is the
// normal, correct intermediate state. Run it when publishing or when
// reconciling what the editor actually runs.
//
// Sibling repos are optional. In CI the editor is often checked out alone,
// and there is nothing to compare against — that reports SKIPPED and exits
// 0 rather than pretending to have verified something.
//
//   node scripts/check-plugin-pins.mjs              # fails on drift
//   node scripts/check-plugin-pins.mjs --warn-only  # reports, exits 0
//
// Invoked directly rather than through a package.json script, matching
// check-protocol-version.sh.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const strict = !process.argv.includes("--warn-only");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// Where a plugin bundle's package.json lives differs by repo: most use
// packages/<name>-bundle/, paged.image uses glue/. Probe both, and probe
// both workspace layouts — plugins/ (local, since 2026-08-03) and a flat
// sibling checkout (the CI layout). Same dual-probe the vite config uses
// for DUCKDB_DIST.
const REPO_ROOTS = [join(ROOT, "..", "plugins"), join(ROOT, "..")];

function repoVersions() {
  const found = new Map();
  for (const base of REPO_ROOTS) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSafe(base)) {
      if (!entry.startsWith("plugin-")) continue;
      for (const rel of bundleManifestPaths(join(base, entry))) {
        const pkg = readJsonSafe(rel);
        if (!pkg?.name?.startsWith("@paged-media/") || !pkg.version) continue;
        // First layout wins: plugins/ is the authoritative local checkout.
        if (!found.has(pkg.name)) found.set(pkg.name, { version: pkg.version, from: rel });
      }
    }
  }
  return found;
}

function readdirSafe(p) {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

function readJsonSafe(p) {
  try {
    return readJson(p);
  } catch {
    return null;
  }
}

function bundleManifestPaths(repoDir) {
  const out = [join(repoDir, "glue", "package.json")];
  const pkgsDir = join(repoDir, "packages");
  for (const d of readdirSafe(pkgsDir)) {
    if (d.endsWith("-bundle")) out.push(join(pkgsDir, d, "package.json"));
  }
  return out.filter(existsSync);
}

const canvasPkg = readJson(join(ROOT, "apps", "canvas", "package.json"));
const pins = { ...canvasPkg.dependencies, ...canvasPkg.devDependencies };
const repos = repoVersions();

// A local `link:`/`file:` override in the ROOT package.json's pnpm.overrides
// makes this checkout resolve straight to the sibling repo, so the pin is NOT
// what runs here — it is only what SHIPS. Reporting those as drift would be
// wrong in the more misleading direction: it would send someone chasing a
// skew their own editor does not have. Call them out separately instead, and
// keep them out of the failure count.
const overrides = readJsonSafe(join(ROOT, "package.json"))?.pnpm?.overrides ?? {};
const isLocallyLinked = (name) =>
  typeof overrides[name] === "string" && /^(link|file):/.test(overrides[name]);

if (repos.size === 0) {
  console.log(
    "SKIPPED — no sibling plugin repos found next to the editor, so there is\n" +
      "nothing to compare the pins against. This is expected in a CI checkout\n" +
      "of the editor alone; it is NOT evidence that the pins are current.",
  );
  process.exit(0);
}

const rows = [];
for (const [name, info] of [...repos].sort()) {
  const pin = pins[name];
  if (!pin) continue; // built but not consumed by the editor yet
  // Pins here are exact canaries, but tolerate a range prefix.
  const pinned = pin.replace(/^[\^~]/, "");
  const linked = isLocallyLinked(name);
  rows.push({
    name,
    pinned,
    repo: info.version,
    linked,
    drift: !linked && pinned !== info.version,
  });
}

const width = Math.max(...rows.map((r) => r.name.length), 8);
for (const r of rows) {
  const mark = r.linked ? "linked (local override)" : r.drift ? "DRIFT" : "ok";
  console.log(
    `${r.name.padEnd(width)}  pin ${r.pinned.padEnd(16)} repo ${r.repo.padEnd(16)} ${mark}`,
  );
}

const linkedRows = rows.filter((r) => r.linked);
if (linkedRows.length > 0) {
  console.log(
    `\n${linkedRows.length} bundle(s) are overridden to a local path, so THIS checkout runs\n` +
      `the repo, not the pin. That hides pin drift from you locally — the pin is\n` +
      `still what a fresh clone and the published app get.`,
  );
}

const drifted = rows.filter((r) => r.drift);
if (drifted.length === 0) {
  console.log(
    `\nOK — every consumed plugin pin either matches its repo version or is` +
      ` locally linked.`,
  );
  process.exit(0);
}

console.error(
  `\n${drifted.length} of ${rows.length} plugin pins are behind their repo:\n` +
    drifted.map((r) => `  ${r.name}  pinned ${r.pinned}, repo has ${r.repo}`).join("\n") +
    `\n\nThe editor runs the PINNED version, so work committed in those repos is\n` +
    `not in the app. Publish the canary and move the pin, or accept the skew\n` +
    `deliberately and re-run with --warn-only.`,
);
process.exit(strict ? 1 : 0);
