#!/usr/bin/env node
/**
 * Seam guard — a seam may not outlive the gap it names.
 *
 * The editor ships "visible but inert" seams by deliberate design
 * (2026-06-05): a control the engine cannot yet serve renders disabled
 * and says so, rather than being hidden. Done well that is honest, and
 * this codebase does it well — `soon` pills, ComingSoon cards, "Delete
 * page (select one first)", module headers that name a lost capability
 * instead of faking it.
 *
 * THE FAILURE MODE IS THE SEAM OUTLIVING ITS GAP. A capability lands
 * engine-side, nobody takes the seam down, and the UI now tells the user
 * a SHIPPED feature is missing. That is not a smaller lie than claiming
 * an unbuilt feature works — it is the same lie pointing the other way,
 * and it is harder to notice because everything still looks deliberate.
 *
 * Three were found by hand on 2026-08-22: Properties said "awaiting the
 * engine's overset signal" while that signal painted the out-port badge
 * two overlays away; the Data menu offered three `soon` seams whose
 * labels duplicated three LIVE toolbar pills; and `Duplicate page` said
 * "awaiting engine support" for an op the capability matrix records as
 * supported. Hand-finding is not a strategy.
 *
 * WHAT IT CHECKS. Every seam string in app/panel source must be
 * registered below with the wire capability it waits on. The run fails
 * when:
 *
 *   - a registered seam names an op the CAPABILITY MATRIX records as
 *     `supported` — the wait is over, take the seam down;
 *   - a seam string appears in the source and is not registered here —
 *     a seam that does not say what it waits for cannot be checked, and
 *     becomes permanent by default;
 *   - a registration names a seam string that no longer exists — dead
 *     entries rot the list into noise.
 *
 * WHY THE CAPABILITY MATRIX AND NOT THE .d.ts. Presence in the wire
 * types means the op can be SENT, not that it works.
 * `setConditionVisible` is in the d.ts and returns `notImplemented` —
 * the showcase measured it doing exactly that — so a d.ts-based check
 * would have demanded the removal of a seam that is telling the truth.
 * `apps/canvas/tests/e2e/harness/capabilities.ts` records what was
 * MEASURED, which is the question actually being asked.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANVAS = join(ROOT, "apps/canvas");
const MATRIX = join(CANVAS, "tests/e2e/harness/capabilities.ts");

/** seam text (substring, as it appears in a user-facing string)
 *  -> { op } the wire capability it waits on, or
 *     { reason } when it waits on something that is not a wire op. */
const SEAMS = [
  { text: "Update link — awaiting engine support", op: "updateLink" },
  { text: "Relink history — awaiting engine support", op: "relinkAsset" },
  { text: "Go to link — awaiting engine support", op: "revealLink" },
  { text: "New condition — awaiting engine support", op: "createCondition" },
  { text: "Filter — awaiting engine support", op: "setConditionFilter" },
  {
    text: "Toggle visibility — awaiting engine support",
    op: "setConditionVisible",
  },
  { text: "Generate index — awaiting engine support", op: "generateIndex" },
  { text: "Gap colour — awaiting engine support", op: "frameStrokeGapColor" },
  {
    text: "Clear override — awaiting engine support",
    op: "clearStyleOverride",
  },
  {
    text: "Redefine style from selection — awaiting engine support",
    op: "redefineStyle",
  },
  {
    text: "Lock aspect — awaiting engine support",
    reason:
      "waits on a constrain CONVENTION (which dimension leads, and how it interacts with the reference point), not on a wire op — there is nothing for the engine to ship that would resolve it",
  },
  {
    text: "Page — awaiting engine support",
    op: "alignToPage",
  },
  {
    text: "Margins — awaiting engine support",
    op: "alignToMargins",
  },
  {
    text: "${s.hint} — awaiting engine support",
    reason:
      "the Pathfinder panel's per-op hints: a TEMPLATE, so the seam text is per-row and the op it waits on differs by row. The individual ops are covered by the capability matrix through pathfinder-panel's own spec rather than by a string match here",
  },
  {
    text: "awaiting the engine",
    reason:
      "matches the Properties panel's overset chip, which was FIXED on 2026-08-22 — the string now survives only inside the comment explaining what it used to say. Registered so the substring match does not read that comment as a live seam",
  },
];

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".git", "dist", "tests"].includes(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ([".ts", ".tsx"].includes(extname(p))) out.push(p);
  }
  return out;
};

const read = (p) => readFileSync(p, "utf8");

/** Source lines that are not comments. A comment QUOTING a seam string
 *  (this campaign left several, explaining what the old seam said) must
 *  not read as a live seam. */
function codeOnly(src) {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

function die(msg) {
  console.error(`seam-guard: ${msg}`);
  process.exit(2);
}

// ── the measured capability matrix ──────────────────────────────────
let matrix;
try {
  matrix = read(MATRIX);
} catch {
  die(`cannot read the capability matrix at ${MATRIX}`);
}
const supported = new Set(
  [...matrix.matchAll(/\{\s*op:\s*"([^"]+)",\s*status:\s*"supported"/g)].map(
    (m) => m[1],
  ),
);
if (supported.size < 20) {
  die(
    `parsed only ${supported.size} supported ops from the capability matrix — ` +
      `the extractor is stale, and a stale extractor makes this gate pass by default`,
  );
}

// ── the seams in the source ─────────────────────────────────────────
const sources = walk(join(CANVAS, "src")).concat(walk(join(ROOT, "packages")));
const blob = sources.map((f) => codeOnly(read(f))).join("\n");

let failed = false;
const stale = [];
const inverted = [];

for (const seam of SEAMS) {
  if (!blob.includes(seam.text)) {
    stale.push(seam.text);
    continue;
  }
  if (seam.op && supported.has(seam.op)) {
    inverted.push(seam);
  }
}

// Any seam string in the source that nobody registered.
const unregistered = [
  ...new Set(
    [...blob.matchAll(/["'`]([^"'`\n]{0,120}awaiting[^"'`\n]{0,120})["'`]/gi)]
      .map((m) => m[1].trim())
      .filter((t) => !/awaiting the user'/.test(t))
      .filter((t) => !SEAMS.some((s) => t.includes(s.text) || s.text.includes(t))),
  ),
];

console.log(
  `── seam guard ──\n  ${SEAMS.length} registered seam(s) · ` +
    `${supported.size} measured-supported op(s)\n`,
);

if (inverted.length) {
  failed = true;
  console.error(
    `${inverted.length} seam(s) OUTLIVED their gap — the capability is measured ` +
      `SUPPORTED and the UI still says it is missing:\n`,
  );
  for (const s of inverted) {
    console.error(`  "${s.text}"\n      waits on ${s.op}, which the matrix records as supported`);
  }
  console.error("");
}

if (unregistered.length) {
  failed = true;
  console.error(
    `${unregistered.length} seam string(s) not registered in scripts/seam-guard.mjs. ` +
      `A seam that does not say what it waits for cannot be checked and becomes ` +
      `permanent by default:\n`,
  );
  for (const t of unregistered) console.error(`  "${t}"`);
  console.error("");
}

if (stale.length) {
  failed = true;
  console.error(
    `${stale.length} registration(s) name a seam that is no longer in the source — ` +
      `remove them so the list stays readable:\n`,
  );
  for (const t of stale) console.error(`  "${t}"`);
  console.error("");
}

if (failed) process.exit(1);
console.log("seam guard OK — every seam still names a gap that is still open.");
