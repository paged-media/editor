#!/usr/bin/env node
/**
 * Solo-profile guard — a profile may not name a surface that is not there.
 *
 * A solo profile (`apps/canvas/src/solo/profiles.ts`) is an ALLOW-LIST:
 * it names the host panels, host tools and plugin panels that a
 * single-plugin application keeps. That direction is deliberate — a
 * deny-list would leak every newly added host panel into every solo
 * profile — but it buys the opposite failure mode, and this gate exists
 * for exactly that:
 *
 *   **A panel or tool renamed host-side silently DROPS OUT of the
 *   profile.** Nothing breaks, nothing throws; the app simply boots one
 *   panel poorer, and the only way to notice is to have known it was
 *   there. That is the same shape as a fallback entry that stops
 *   matching, or a gate that measures nothing and passes.
 *
 * Written after the first draft of the draw profile named
 * `media.paged.draw.panel.layers`, which has never existed — draw's
 * layer surface is an ADR-023 binding PROVIDER feeding the host's panel,
 * not a panel of its own. A browser would have shown "This panel is
 * unavailable. It may belong to a plugin that failed to load." and the
 * cause would have looked like a bundle failure.
 *
 * Checks every id in every profile against the code that registers it:
 *   · host panels → the `BUILT_IN_PANELS` literal in main.tsx
 *   · host tools  → `packages/tools/src/built-in-tools.ts`
 *   · plugin panels → the bundle's own manifest, resolved through the
 *     canvas app's node_modules (NOT a store scan — the store holds
 *     every version any workspace member ever asked for)
 *   · menu top-levels → the canonical set MenuBar orders
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANVAS = join(ROOT, "apps/canvas");
const read = (p) => readFileSync(p, "utf8");

function die(msg) {
  console.error(`solo-profiles-guard: ${msg}`);
  process.exit(2);
}

// ── what exists ─────────────────────────────────────────────────────
function hostPanels() {
  const src = read(join(CANVAS, "src/main.tsx"));
  const start = src.indexOf("const BUILT_IN_PANELS");
  if (start < 0) die("BUILT_IN_PANELS not found in main.tsx — extractor is stale");
  const block = src.slice(start, src.indexOf("\n];", start));
  return new Set([...block.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]));
}

function hostTools() {
  const src = read(join(ROOT, "packages/tools/src/built-in-tools.ts"));
  return new Set(
    [...src.matchAll(/id:\s*"(paged\.tool\.[A-Za-z0-9.]+)"/g)].map((m) => m[1]),
  );
}

function pluginPanels(bundleNpmName) {
  const manifestPath = join(
    CANVAS,
    "node_modules",
    bundleNpmName,
    "manifest.json",
  );
  let manifest;
  try {
    manifest = JSON.parse(read(manifestPath));
  } catch {
    die(
      `cannot read ${bundleNpmName}'s manifest at ${manifestPath} — ` +
        `is the bundle installed?`,
    );
  }
  const panels = manifest.contributes?.panels ?? [];
  return new Set(panels.map((p) => (typeof p === "string" ? p : p.id)));
}

/** The top-level menus MenuBar knows how to order. Anything else sorts
 *  to the end alphabetically, which is legal but almost always a typo in
 *  a profile. */
const KNOWN_TOP_LEVELS = new Set([
  "File", "Edit", "Layout", "Type", "Object", "Data", "View", "Tools",
  "Window", "Help",
]);

// ── what the profiles claim ─────────────────────────────────────────
/** Parsed from the TS source rather than imported: this is a plain Node
 *  script and profiles.ts is TypeScript. The shapes are simple string
 *  arrays, so a regex over the named blocks is honest here — and the
 *  SENTINELS below fail the run if that stops being true. */
/** Source with comment lines removed.
 *
 *  The profile file EXPLAINS itself at length, and those explanations
 *  quote ids and tool names. Without this, a sentence like `"draw's
 *  tools plus navigation"` inside the `toolIds` array reads as an entry
 *  and the guard reports a tool that nobody declared. `seam-guard.mjs`
 *  solves the same problem the same way, for the same reason. */
function codeOnly(src) {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

function profiles() {
  const src = codeOnly(read(join(CANVAS, "src/solo/profiles.ts")));
  const out = [];
  for (const m of src.matchAll(/const (\w+_PROFILE): SoloProfile = \{([\s\S]*?)\n\};/g)) {
    const [, name, body] = m;
    const list = (key) => {
      const block = body.match(new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`));
      if (!block) return [];
      return [...block[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    };
    const one = (key) => body.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1] ?? null;
    const slotsBlock = body.match(/slots:\s*\{([\s\S]*?)\n {2}\}/)?.[1] ?? "";
    out.push({
      name,
      bundleId: one("bundleId"),
      panelIds: list("panelIds"),
      toolIds: list("toolIds"),
      menuTopLevels: list("menuTopLevels"),
      panelRailIds: list("panelRailIds"),
      slotIds: [...slotsBlock.matchAll(/"([^"]+)"/g)].map((x) => x[1]),
    });
  }
  return out;
}

/** manifest id → the npm package the canvas app resolves it from. */
const BUNDLE_PACKAGE = {
  "media.paged.draw": "@paged-media/draw",
  "media.paged.web": "@paged-media/web",
  "media.paged.sheet": "@paged-media/sheet",
  "media.paged.data": "@paged-media/data",
  "media.paged.image": "@paged-media/image",
  "media.paged.doc": "@paged-media/doc",
};

// ── the check ───────────────────────────────────────────────────────
const HOST_PANELS = hostPanels();
const HOST_TOOLS = hostTools();
const PROFILES = profiles();

// Fail-open sentinels: an extractor that quietly matches nothing would
// make every profile "valid".
for (const [what, got, floor] of [
  ["host panels", HOST_PANELS.size, 40],
  ["host tools", HOST_TOOLS.size, 20],
  ["profiles", PROFILES.length, 1],
]) {
  if (got < floor) {
    die(`found only ${got} ${what} (expected >= ${floor}) — an extractor lost its footing`);
  }
}

let failed = false;
console.log("── solo profiles ──\n");

for (const p of PROFILES) {
  const pkg = BUNDLE_PACKAGE[p.bundleId];
  if (!pkg) die(`${p.name}: unknown bundleId "${p.bundleId}"`);
  const PLUGIN_PANELS = pluginPanels(pkg);
  const known = new Set([...HOST_PANELS, ...PLUGIN_PANELS]);

  const problems = [];
  for (const id of p.panelIds) {
    if (!HOST_PANELS.has(id)) problems.push(`panelIds: "${id}" is not a host panel`);
  }
  for (const id of p.toolIds) {
    if (!HOST_TOOLS.has(id)) problems.push(`toolIds: "${id}" is not a built-in tool`);
  }
  for (const id of [...p.slotIds, ...p.panelRailIds]) {
    if (!known.has(id)) {
      problems.push(
        `"${id}" is neither a host panel nor a ${pkg} panel ` +
          `(slots / panelRail must resolve, or the user sees ` +
          `"This panel is unavailable")`,
      );
    }
  }
  for (const top of p.menuTopLevels) {
    if (!KNOWN_TOP_LEVELS.has(top)) {
      problems.push(`menuTopLevels: "${top}" is not a menu MenuBar orders`);
    }
  }

  const counts =
    `${p.panelIds.length} panels · ${p.toolIds.length} tools · ` +
    `${p.menuTopLevels.length} menus · ${p.slotIds.length} slot ids`;
  if (problems.length === 0) {
    console.log(`  ✓ ${p.name}  (${p.bundleId})  ${counts}`);
  } else {
    failed = true;
    console.error(`  ✘ ${p.name}  (${p.bundleId})`);
    for (const q of problems) console.error(`      ${q}`);
  }
}

console.log("");
if (failed) process.exit(1);
console.log(
  `solo profiles OK — ${PROFILES.length} profile(s), every id resolves against ` +
    `the code that registers it.`,
);
