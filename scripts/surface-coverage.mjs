#!/usr/bin/env node
/**
 * Surface-coverage gate — every panel, tool, keybinding and menu item
 * the app REGISTERS must be exercised by a spec, or carry a written
 * reason why not.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT THE @feat GATE.
 *
 *   `@feat:` tags map specs to REGISTRY ROWS — capabilities of the
 *   product ("layers.ops", "stories-text"). That gate answers "is this
 *   capability tested somewhere". It cannot answer "does the Scissors
 *   tool in the rail do anything", because a registry row is satisfied
 *   by any one of the several surfaces that expose it.
 *
 *   This gate works the other way round: it enumerates the CONCRETE
 *   SURFACE a user touches — the ids registered in `BUILT_IN_PANELS`,
 *   `BUILT_IN_TOOLS`, the keybinding table and the menu tables — and
 *   asks whether a spec names each one. A tool with a real gesture that
 *   no spec has ever selected is exactly the shape of the defect the
 *   tool rail already shipped once: 15 of 31 rail entries accepted a
 *   click and silently did nothing, which is worse than an empty slot
 *   because the user reads the dead affordance as a fault in their own
 *   input. Nothing would have caught that but a gate that counts slots.
 *
 * WHAT "COVERED" MEANS HERE, HONESTLY.
 *
 *   Covered = the id string appears in some file under `tests/`. That is
 *   a weak proxy for "tested" and is deliberately weak: most specs drive
 *   the UI or the wire rather than the command layer (only 7 call sites
 *   use `runCommand("<id>")`), so a stricter rule would report false
 *   gaps everywhere and be ignored — which is the failure mode of every
 *   coverage gate nobody trusts. What this DOES catch, reliably, is the
 *   surface nothing has ever heard of.
 *
 *   The consequence to keep in mind: a green run here is not evidence a
 *   tool WORKS, only that some spec has met it. Depth is the @feat gate's
 *   `coverage_level` axis, not this one.
 *
 * THE RATCHET RUNS BOTH WAYS.
 *
 *   An uncovered id must be listed in ACKNOWLEDGED with a reason. An
 *   ACKNOWLEDGED id that has since gained a spec FAILS the run, so the
 *   list cannot rot into a permanent excuse — same rule the render-effect
 *   sweep uses for its KNOWN findings.
 *
 * FAIL-OPEN IS THE REAL RISK. A regex that silently stops matching would
 * turn this into a gate that always passes. Every extractor therefore
 * asserts a floor on what it found (see SENTINELS), and the run dies if
 * an extractor comes back suspiciously empty.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANVAS = join(ROOT, "apps/canvas");

/** Uncovered ids that are allowed to stay uncovered, each with why.
 *  Reasons must be specific — "TODO" tells the next reader nothing. */
const ACKNOWLEDGED = new Map([
  [
    "paged.sample.hello",
    "the catalog's own demo command, registered to prove the contribution " +
      "path works; it is not product surface and has no user-facing behaviour to assert.",
  ],
  [
    "paged.story-inspector",
    "Content mode's right inspector is a ComingSoon card end to end " +
      "(mode-inspectors.tsx) — 'Story status coming soon'. There is no behaviour " +
      "to test until the stories collection and the collaboration backend land.",
  ],
  [
    "paged.review-inspector",
    "Review mode's right inspector is a ComingSoon card ('Approvals coming soon'). " +
      "Review mode is stub by design; see the plan's out-of-scope note.",
  ],
]);

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ([".ts", ".tsx"].includes(extname(p))) out.push(p);
  }
  return out;
};

const read = (p) => readFileSync(p, "utf8");

// ── the surface, extracted from the code that registers it ──────────

/** Panels: the `BUILT_IN_PANELS` array literal in main.tsx. */
function panels() {
  const src = read(join(CANVAS, "src/main.tsx"));
  const start = src.indexOf("const BUILT_IN_PANELS");
  if (start < 0) die("BUILT_IN_PANELS not found in main.tsx — the extractor is stale");
  const block = src.slice(start, src.indexOf("\n];", start));
  return [...block.matchAll(/id:\s*"([^"]+)",\s*\n\s*title:\s*"([^"]+)"/g)].map((m) => ({
    kind: "panel",
    id: m[1],
    label: m[2],
  }));
}

/** Tools: `built-in-tools.ts`. `status: "planned"` entries are excluded —
 *  they are dimmed, aria-disabled and refuse activation by construction,
 *  so "no spec selects them" is the correct state, not a gap. */
function tools() {
  const src = read(join(ROOT, "packages/tools/src/built-in-tools.ts"));
  const found = [];
  for (const m of src.matchAll(
    /\{\s*id:\s*"(paged\.tool\.[A-Za-z0-9.]+)",\s*\n\s*title:\s*"([^"]+)"([\s\S]{0,500}?)\n {2}\},/g,
  )) {
    if (/status:\s*"planned"/.test(m[3])) continue;
    found.push({ kind: "tool", id: m[1], label: m[2] });
  }
  return found;
}

/** Command ids behind keybindings and menu items, resolved through the
 *  `export const FOO = "paged.…"` constants those tables reference. */
function commandTables(sourceFiles) {
  const blob = sourceFiles.map(read).join("\n");
  const consts = new Map(
    [...blob.matchAll(/export const ([A-Z_0-9]+)\s*=\s*"(paged\.[^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  const resolve = (raw) => consts.get(raw) ?? raw.replace(/"/g, "");

  const keys = [...blob.matchAll(/key:\s*"([^"]+)",\s*command:\s*([A-Z_0-9]+|"[^"]+")/g)].map(
    (m) => ({ kind: "keybinding", id: resolve(m[2]), label: m[1] }),
  );
  const menu = [
    ...blob.matchAll(/path:\s*"([^"]+)",\s*\n?\s*command:\s*([A-Z_0-9]+|"[^"]+")/g),
  ].map((m) => ({ kind: "menu item", id: resolve(m[2]), label: m[1] }));

  return { keys, menu, constCount: consts.size };
}

/** PLUGIN-INJECTED SURFACE.
 *
 *  Plugins do not edit the host; they hand it contributions through
 *  `host.contribute.*`. The installed bundles ship a `manifest.json`
 *  declaring exactly what each one injects, so the manifests — not a
 *  hand-kept list here — are the source of truth for that surface.
 *  Reading them from `node_modules` also means this gate measures what
 *  the app ACTUALLY LOADS (the published canaries), not what the plugin
 *  repos happen to have on disk.
 *
 *  There are twelve MANIFEST contribution types:
 *    bindingProvider command editContext exporter importer keybinding
 *    objectType overlay panel sceneLayer schemaPanel tool
 *
 *  `menu` is NOT among them and that is not a gap: `contribute.menu()`
 *  (contract 0.2.33) is a RUNTIME call made during activate, not a
 *  manifest declaration, so a menu entry cannot be counted by reading
 *  manifests the way everything above is. This gate therefore stays
 *  silent about plugin menu items rather than reporting zero — see the
 *  note printed at the end of the run.
 */
function pluginSurface() {
  // Resolve through the CANVAS APP's own node_modules, not by scanning
  // the pnpm store. The store holds every version any workspace member
  // ever asked for — there are four `@paged-media+draw@…` directories in
  // it right now — and picking whichever one enumerates first measured a
  // bundle the app does not load (it read draw's manifest as 8 tools
  // where the resolved one declares 19). The app's symlink is the only
  // path that answers "what does this build actually inject".
  const BUNDLES_LOADED = [
    "draw", "web", "sheet", "data", "image", "doc", "pdf", "publish",
  ];
  const items = [];
  const bundles = [];
  for (const pkg of BUNDLES_LOADED) {
    const manifestPath = join(CANVAS, "node_modules/@paged-media", pkg, "manifest.json");
    let manifest;
    try {
      manifest = JSON.parse(read(manifestPath));
    } catch {
      // Not a dependency of the canvas app (plugin-slide is an empty
      // repo; doc may be link:-overridden pre-publish). Absent is not a
      // gap — it contributes nothing because it is not there.
      continue;
    }
    const c = manifest.contributes ?? manifest;
    const counts = {};
    for (const [type, value] of Object.entries(c)) {
      if (!Array.isArray(value)) continue;
      counts[type] = value.length;
      for (const entry of value) {
        // Three shapes in the manifests: a bare id string (panels,
        // commands), an object with `id` (tools), and an object keyed by
        // `type` (editContexts / objectTypes / partTypes, whose identity
        // IS the content type they claim — "webFrame", "sheet").
        const id = typeof entry === "string" ? entry : (entry?.id ?? entry?.type);
        if (typeof id === "string") items.push({ kind: `plugin ${type}`, id, label: pkg, type, pkg });
      }
    }
    bundles.push({ pkg, counts });
  }
  return { items, bundles };
}

// ── run ─────────────────────────────────────────────────────────────

function die(msg) {
  console.error(`surface-coverage: ${msg}`);
  process.exit(2);
}

const sourceFiles = walk(join(CANVAS, "src")).concat(walk(join(ROOT, "packages")));
const testFiles = walk(join(CANVAS, "tests"));
const testBlob = testFiles.map(read).join("\n");

const P = panels();
const T = tools();
const { keys: K, menu: M, constCount } = commandTables(sourceFiles);
const { items: PLUG, bundles: BUNDLES } = pluginSurface();

// SENTINELS — a silently-empty extractor makes this gate always pass.
const SENTINELS = [
  ["panels", P.length, 40],
  ["live tools", T.length, 15],
  ["keybindings", K.length, 20],
  ["menu items", M.length, 20],
  ["command constants", constCount, 20],
  ["spec files", testFiles.length, 100],
];
for (const [what, got, floor] of SENTINELS) {
  if (got < floor) die(`found only ${got} ${what} (expected >= ${floor}) — an extractor lost its footing`);
}

// Dedupe by id per kind; a command bound to both cmd+ and ctrl+ is one thing.
const surface = [];
const seen = new Set();
for (const item of [...P, ...T, ...K, ...M, ...PLUG]) {
  const key = `${item.kind} ${item.id}`;
  if (seen.has(key)) continue;
  seen.add(key);
  surface.push(item);
}

const uncovered = surface.filter((s) => !testBlob.includes(s.id));
const unacknowledged = uncovered.filter((s) => !ACKNOWLEDGED.has(s.id));
const acknowledgedIds = new Set(
  surface.filter((s) => ACKNOWLEDGED.has(s.id)).map((s) => s.id),
);
const nowCovered = [...ACKNOWLEDGED.keys()].filter(
  (id) => acknowledgedIds.has(id) && testBlob.includes(id),
);
const stale = [...ACKNOWLEDGED.keys()].filter((id) => !surface.some((s) => s.id === id));

const byKind = (kind) => {
  const all = surface.filter((s) => s.kind === kind);
  const miss = all.filter((s) => !testBlob.includes(s.id));
  return `${all.length - miss.length}/${all.length}`;
};

console.log("── host surface ──");
console.log(`  panels       ${byKind("panel")}`);
console.log(`  tools (live) ${byKind("tool")}`);
console.log(`  keybindings  ${byKind("keybinding")}`);
console.log(`  menu items   ${byKind("menu item")}`);

// Plugin surface, reported per CONTRIBUTION TYPE. A type with 0/N is the
// interesting number: it means no spec has ever touched anything a plugin
// injected through that door, so the door itself is unproven.
const pluginKinds = [...new Set(PLUG.map((p) => p.kind))].sort();
if (pluginKinds.length) {
  console.log("\n── plugin-injected surface (from the loaded bundles' manifests) ──");
  for (const k of pluginKinds) {
    console.log(`  ${k.padEnd(22)} ${byKind(k)}`);
  }
  console.log("\n  per bundle:");
  for (const b of BUNDLES.sort((x, y) => x.pkg.localeCompare(y.pkg))) {
    const mine = PLUG.filter((p) => p.pkg === b.pkg);
    const cov = mine.filter((p) => testBlob.includes(p.id)).length;
    const decl = Object.entries(b.counts)
      .map(([t, n]) => `${t} ${n}`)
      .join(", ");
    console.log(`    ${b.pkg.padEnd(9)} ${String(cov).padStart(3)}/${String(mine.length).padEnd(3)}  ${decl}`);
  }
}
console.log(`\n  ${surface.length} surface ids from ${testFiles.length} spec files\n`);

// The injection PATHS themselves. A contribution type that no loaded
// bundle uses cannot be proven by this gate at all — say so rather than
// let its absence read as coverage.
const CONTRIBUTION_TYPES = [
  "bindingProvider", "command", "editContext", "exporter", "importer",
  "keybinding", "objectType", "overlay", "panel", "sceneLayer",
  "schemaPanel", "tool",
];
// Manifest keys are plural (`commands`), the contract's methods are
// singular (`contribute.command`). Normalise before comparing, or every
// type reads as unused and the note below becomes a confident lie.
const singular = (t) => (t.endsWith("s") ? t.slice(0, -1) : t);
const used = new Set(PLUG.map((p) => singular(p.type)));
const unused = CONTRIBUTION_TYPES.filter((t) => !used.has(t));
if (unused.length) {
  console.log(
    `  NOTE — ${unused.length} contribution type(s) no loaded bundle declares in its manifest, ` +
      `so this gate cannot speak to them: ${unused.join(", ")}.`,
  );
  console.log(
    "  (`menu` is a RUNTIME contribution — `contribute.menu()`, contract 0.2.33 — " +
      "not a manifest field, so no manifest-reading gate can count it. Its absence " +
      "from the list above is a limit of this measurement, NOT a missing feature.)\n",
  );
}

let failed = false;

// ── the ratchet ─────────────────────────────────────────────────────
//
// Every ceiling is 0, because the campaign that added this gate closed
// the whole gap: 362 surface ids, all named. That is the strongest form
// of the rule — new surface arrives with a spec that names it, or it
// does not arrive.
//
// The ceilings stay as a MAP rather than a blanket `=== 0` for two
// reasons. They record the shape of the surface, so a kind that vanishes
// is caught (see the "no longer a surface kind" check below). And they
// leave a deliberate, reviewable place to raise a number if some future
// surface genuinely cannot be tested yet — better a ceiling of 2 with a
// commit message explaining it than a disabled gate.
//
// It fails BOTH ways. Over the ceiling is the obvious direction. Under
// it matters just as much: a ceiling left above reality silently
// readmits everything between the real count and the number, which is
// the same fail-open shape as a dry-run that prints nothing and exits 0.
// This caught itself twice while the campaign ran, when specs landed and
// the numbers dropped underneath the ceilings still in the file.

const CEILING = new Map([
  ["panel", 0],
  ["tool", 0],
  ["keybinding", 0],
  ["menu item", 0],
  ["plugin commands", 0],
  ["plugin tools", 0],
  ["plugin panels", 0],
  ["plugin importers", 0],
  ["plugin exporters", 0],
  ["plugin editContexts", 0],
  ["plugin objectTypes", 0],
  ["plugin partTypes", 0],
]);

const kinds = [...new Set(surface.map((x) => x.kind))].sort();
for (const kind of kinds) {
  const miss = unacknowledged.filter((x) => x.kind === kind);
  const ceiling = CEILING.get(kind);
  if (ceiling === undefined) {
    failed = true;
    console.error(`kind "${kind}" has no CEILING entry — add one (uncovered: ${miss.length}).`);
    continue;
  }
  if (miss.length > ceiling) {
    failed = true;
    console.error(
      `\n${kind}: ${miss.length} uncovered, ceiling ${ceiling}. Write a spec that names it, or ` +
        `raise the ceiling DELIBERATELY and say why in the commit message:`,
    );
    for (const x of miss) console.error(`    ${x.id.padEnd(46)} ${x.label}`);
  } else if (miss.length < ceiling) {
    failed = true;
    console.error(
      `\n${kind}: ${miss.length} uncovered but the ceiling still says ${ceiling}. Lower it — a ` +
        `ceiling above reality readmits a regression underneath it unnoticed.`,
    );
  }
}
for (const kind of CEILING.keys()) {
  if (!kinds.includes(kind)) {
    failed = true;
    console.error(`CEILING has "${kind}", no longer a surface kind — remove it.`);
  }
}

if (nowCovered.length) {
  failed = true;
  console.error(
    `${nowCovered.length} ACKNOWLEDGED id(s) now HAVE a spec — delete their entries so the ` +
      `list cannot rot into a permanent excuse:\n`,
  );
  for (const id of nowCovered) console.error(`  ${id}`);
  console.error("");
}

if (stale.length) {
  failed = true;
  console.error(
    `${stale.length} ACKNOWLEDGED id(s) are not in the surface at all — renamed or deleted. ` +
      `Remove them:\n`,
  );
  for (const id of stale) console.error(`  ${id}`);
  console.error("");
}

for (const [id, reason] of ACKNOWLEDGED) {
  if (reason.length < 80) {
    failed = true;
    console.error(`ACKNOWLEDGED["${id}"] reason is too short to be useful — say what and why.`);
  }
}

if (failed) process.exit(1);
console.log(`surface coverage OK — ${ACKNOWLEDGED.size} acknowledged gap(s), each with a reason.`);
