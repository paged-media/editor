#!/usr/bin/env node
/**
 * Applicability guard — one vocabulary for "this doesn't apply here".
 *
 * The 2026-08-22 audit found context-sensitivity was not a gap but FOUR
 * rules, one per surface, each defensible alone and incoherent together:
 * the tool rail dimmed and stayed clickable, the context toolbar replaced
 * itself with prose, the Window menu greyed, and the menu bar did nothing.
 *
 * Nothing produced that. It is what four independent, reasonable
 * decisions look like after a year, and no review catches it because each
 * one is right on its own — there was no single thing for them to
 * disagree with.
 *
 * So there is one now (`packages/shell/src/chrome/applicability.ts`), and
 * this checks the surfaces use it.
 *
 * WHAT IT CHECKS, and the limits of that. A surface that renders a
 * context-dependent state must import the shared module. This is a
 * STRUCTURAL check, not a visual one: it cannot tell whether a surface
 * picked the right state, only that it is speaking the shared vocabulary
 * instead of inventing a fifth. Getting the state wrong is a bug a spec
 * catches; not participating at all is the drift this catches, and the
 * two failure modes are different.
 *
 * The registry below is deliberately small and hand-kept. A blanket "any
 * file mentioning editContext" rule would sweep in the controller, the
 * registries and the tests, and a guard that cries wolf gets deleted.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Surfaces that render a "does this apply here" state to a user. */
const SURFACES = [
  {
    file: "packages/shell/src/chrome/ToolRail.tsx",
    why: "dims tools outside the active context's toolIds and keeps them clickable — the treatment the others adopt",
    participates: true,
  },
  {
    file: "packages/shell/src/chrome/ContextToolbar.tsx",
    why: "replaces its left segment while a context is active",
    // NOT YET. Its segment is prose, and prose is a third voice saying
    // what the breadcrumb (identity + Esc) and the rail (which tools
    // apply) already say better. Converting it is Phase F3 and is
    // deliberately not smuggled in here — the guard's job is to make the
    // gap visible, not to be satisfied by a token import.
    participates: false,
    reason:
      "prose segment; scheduled for F3 — it duplicates the breadcrumb and the rail in a third vocabulary",
  },
  {
    file: "packages/shell/src/chrome/MenuBar.tsx",
    why: "greys items whose `when` is false, and badges `soon` for items that do not exist",
    // MenuBar already draws the exact distinction the module encodes —
    // `disabled` (absent) vs a false `when` (elsewhere) — in its own
    // words. It is the SOURCE of the vocabulary rather than a consumer of
    // it, which is why it does not import.
    participates: false,
    reason:
      "already distinguishes `soon` from `when:false` deliberately; the module encodes ITS rule, so importing would be circular",
  },
];

const read = (p) => readFileSync(join(ROOT, p), "utf8");

let failed = false;
const lines = [];

for (const s of SURFACES) {
  let src;
  try {
    src = read(s.file);
  } catch {
    failed = true;
    console.error(
      `applicability-guard: ${s.file} is registered here and does not exist — ` +
        `it was renamed or deleted, and the registry did not follow`,
    );
    continue;
  }
  const imports = src.includes('from "./applicability"');
  if (s.participates && !imports) {
    failed = true;
    console.error(
      `${s.file} renders a context-dependent state and does NOT use the shared ` +
        `vocabulary (packages/shell/src/chrome/applicability.ts).\n` +
        `  It ${s.why}.\n` +
        `  Import \`applicabilityOf\` and emit \`data-applies\`, or move it to ` +
        `participates:false with a reason.`,
    );
  }
  if (!s.participates && imports) {
    failed = true;
    console.error(
      `${s.file} now uses the shared vocabulary — flip it to participates:true ` +
        `and delete the reason ("${s.reason}"), so the exemption list stays a ` +
        `list of real exemptions.`,
    );
  }
  lines.push(
    `  ${s.participates ? "✓" : "·"} ${s.file.replace("packages/shell/src/chrome/", "")}` +
      (s.participates ? "" : `  — ${s.reason}`),
  );
}

const missingReason = SURFACES.filter((s) => !s.participates && !s.reason);
if (missingReason.length) {
  failed = true;
  console.error(
    `${missingReason.length} exempt surface(s) carry no reason. An exemption ` +
      `nobody justified becomes permanent by default.`,
  );
}

console.log("── applicability vocabulary ──");
for (const l of lines) console.log(l);
console.log("");

if (failed) process.exit(1);
console.log(
  `applicability OK — ${SURFACES.filter((s) => s.participates).length} of ` +
    `${SURFACES.length} surfaces on the shared vocabulary, the rest exempt with reasons.`,
);
