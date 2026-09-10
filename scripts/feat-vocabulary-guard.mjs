#!/usr/bin/env node
/**
 * @feat vocabulary guard — a spec may only claim a capability that exists.
 *
 * WHAT A `@feat:` TAG IS FOR, AND HOW IT FAILS.
 *
 *   A tag in a test title (`@feat:layers.ops`) is how a spec claims a row
 *   in the capability registry (paged-media/state). The join reads the
 *   tag, finds the row, and the row counts as covered. An id that matches
 *   NO row does not fail anything: it becomes an `unknown-id` drift entry
 *   in a report generated in another repo, and the test covers nothing at
 *   all. The spec still passes. Nobody finds out.
 *
 *   Measured 2026-09-09: twenty distinct ids in this tree resolved to
 *   nothing. Fourteen were in `tests/plugin-surface/draw.spec.ts` — the
 *   only tier in the whole system that asserts capability x surface
 *   reachability, invisible to the registry since the day it was written.
 *   Most were near-misses of a row that already existed
 *   (`plugin-draw.blend` for `plugin-draw.blends`, `plugin-draw.repeat`
 *   for `plugin-draw.repeats`, `stories-text.frame.insert` for
 *   `frames-paths.frame.insert`). A reviewer cannot catch that; a list
 *   can. The registry had already recorded the same shape once, in
 *   `editor-shell.document-title`'s note: "tagged
 *   @feat:editor-shell.cockpit, an id that never existed".
 *
 * WHY THE VOCABULARY IS VENDORED.
 *
 *   Both repos are private, so neither CI can read the other without a
 *   token, and a token-gated check degrades to a skip — a gate that
 *   passes by not looking. `scripts/feat-vocabulary.json` is published by
 *   state's `scripts/sync-feat-vocabulary.mjs`, and that script's
 *   `--check` mode is what keeps the copy honest. This gate is then
 *   offline and hard.
 *
 * WHAT THIS DOES NOT CHECK. That the id is the RIGHT one. `@feat:layers.ops`
 * on a test about swatches resolves fine and is a lie this cannot see. It
 * catches the id that means nothing, which is the failure that hides.
 *
 * FAIL-OPEN IS THE REAL RISK — a regex that stops matching, or a
 * vocabulary file that arrives empty, would make this pass forever. Both
 * are floored below and the run dies if either comes back thin.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TESTS = join(ROOT, "apps", "canvas", "tests");
const VOCAB = join(ROOT, "scripts", "feat-vocabulary.json");

/** Anti-fail-open floors. The tree carried 302 distinct tags and the
 *  registry 578 ids on 2026-09-09; a run that finds a fraction of either
 *  has broken its extractor, not cleaned the tree. */
const MIN_TAGS = 250;
const MIN_VOCAB = 500;

/**
 * Ids deliberately claimed against no registry row, each with the reason.
 * The ratchet runs BOTH ways: an entry here that has since gained a row
 * FAILS, so the list cannot rot into a permanent excuse.
 *
 * It is empty, and that is the point — every id in this tree names a real
 * capability. Adding an entry is a decision to be explained, not a way
 * past a red run: the alternatives are to fix the tag, or to add the row
 * in state/registry/features and re-publish the vocabulary.
 */
const ACKNOWLEDGED = Object.freeze({});

const TAG = /@feat:([A-Za-z0-9_.-]+)/g;

/** The coverage-depth vocabulary, which is closed. An invalid `@level:`
 *  fails nothing today: state's converter drops it with a warning into a
 *  CI log nobody reads, and the spec then reports NO depth at all — so a
 *  test written to prove an edge case contributes untyped coverage to
 *  the very axis it was written for. One had been sitting in the tree as
 *  `@level:unhappy` since it was written. */
const LEVELS = new Set(["smoke", "happy", "edge", "gesture"]);
const LEVEL_TAG = /@level:([A-Za-z0-9_-]+)/g;

/** Titles that announce the test passes by proving something is BROKEN.
 *
 *  A `@feat:` tag is a COVERAGE claim, so tagging one of these tells the
 *  registry the capability is covered — on the strength of a test that
 *  demonstrates it is not. Four were doing exactly that, and the one
 *  outside the plugin-surface tier showed up as drift the first time the
 *  editor lane published after 2026-08-22: green evidence for
 *  `layers.item-assignment` on `editor.script`, a stage the row marks
 *  `planned` for precisely that reason.
 *
 *  The other three sat in `plugin-surface/`, which had never been
 *  ingested — so their over-claim was invisible rather than absent, and
 *  would have arrived the moment that tier started counting.
 *
 *  When the defect is fixed the assertions flip; that is when the tag
 *  comes back, and the two edits belong in the same commit. */
const DEFECT_MARKERS = [/KNOWN DEFECT/i, /characteris[a-z]*ion of a defect/i];

function specFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__screenshots__") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...specFiles(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

function main() {
  let vocabulary;
  try {
    vocabulary = JSON.parse(readFileSync(VOCAB, "utf8"));
  } catch (err) {
    console.error(
      `[feat-vocabulary] FAIL: cannot read ${relative(ROOT, VOCAB)} (${err.message}).\n` +
        `  It is published from the state repo:\n` +
        `    node scripts/sync-feat-vocabulary.mjs --editor ${ROOT}`,
    );
    process.exit(1);
  }
  const known = new Set(vocabulary.ids ?? []);
  if (known.size < MIN_VOCAB) {
    console.error(
      `[feat-vocabulary] FAIL: the vendored vocabulary carries ${known.size} ids ` +
        `(floor ${MIN_VOCAB}). A short list would pass this gate by knowing nothing.`,
    );
    process.exit(1);
  }

  /** id → sorted list of "<file>:<line>" that claim it. */
  const claims = new Map();
  for (const file of specFiles(TESTS)) {
    const rel = relative(ROOT, file);
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(TAG)) {
          const at = claims.get(m[1]) ?? [];
          at.push(`${rel}:${i + 1}`);
          claims.set(m[1], at);
        }
      });
  }
  if (claims.size < MIN_TAGS) {
    console.error(
      `[feat-vocabulary] FAIL: only ${claims.size} distinct @feat ids found under ` +
        `apps/canvas/tests (floor ${MIN_TAGS}). The extractor is broken, not the tree.`,
    );
    process.exit(1);
  }

  // Coverage levels, scanned in the same pass over the same files.
  const badLevels = new Map();
  for (const file of specFiles(TESTS)) {
    const rel = relative(ROOT, file);
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(LEVEL_TAG)) {
          if (!LEVELS.has(m[1])) badLevels.set(`${rel}:${i + 1}`, m[1]);
        }
      });
  }
  for (const [at, level] of badLevels) {
    console.error(`[feat-vocabulary] BAD LEVEL  @level:${level}  ${at}`);
  }

  // A defect characterisation may not claim the feature it refutes.
  const overclaims = [];
  for (const file of specFiles(TESTS)) {
    const rel = relative(ROOT, file);
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (!DEFECT_MARKERS.some((re) => re.test(line))) return;
        const claimed = [...line.matchAll(TAG)].map((m) => m[1]);
        if (claimed.length) overclaims.push(`${rel}:${i + 1} claims ${claimed.join(", ")}`);
      });
  }
  for (const o of overclaims) {
    console.error(`[feat-vocabulary] DEFECT CLAIMS A FEATURE  ${o}`);
  }

  const unknown = [...claims.keys()].filter((id) => !known.has(id)).sort();
  const unexplained = unknown.filter((id) => !(id in ACKNOWLEDGED));
  const rotted = Object.keys(ACKNOWLEDGED).filter((id) => known.has(id)).sort();

  for (const id of unexplained) {
    console.error(`[feat-vocabulary] UNKNOWN  ${id}`);
    for (const at of claims.get(id).slice(0, 4)) console.error(`               ${at}`);
  }
  for (const id of rotted) {
    console.error(
      `[feat-vocabulary] STALE ACKNOWLEDGED  ${id} — the registry now has this row; ` +
        `drop the entry.`,
    );
  }

  const vendoredAt = String(vocabulary.generated_from?.commit ?? "?").slice(0, 8);
  console.log(
    `[feat-vocabulary] ${claims.size} distinct ids claimed across ` +
      `${new Set([...claims.values()].flat().map((s) => s.split(":")[0])).size} spec files; ` +
      `vocabulary ${known.size} ids @ state ${vendoredAt}` +
      (unknown.length ? `; ${unknown.length} unknown` : ""),
  );

  if (overclaims.length) {
    console.error(
      `\n[feat-vocabulary] FAIL — a test that passes by proving a capability ` +
        `BROKEN must not carry a @feat: tag: the tag is a coverage claim, and ` +
        `the registry would read the defect as evidence of the feature. Drop ` +
        `the tag; put it back in the commit that flips the assertions.`,
    );
    process.exit(1);
  }
  if (badLevels.size) {
    console.error(
      `\n[feat-vocabulary] FAIL — @level: is a closed set ` +
        `(${[...LEVELS].join(" | ")}). An invalid one is dropped by the ` +
        `ingest with a warning, and the spec then carries no depth at all.`,
    );
    process.exit(1);
  }
  if (unexplained.length || rotted.length) {
    console.error(
      `\n[feat-vocabulary] FAIL — an id that names no row covers nothing.\n` +
        `  Fix the tag, or add the row in state/registry/features and re-publish:\n` +
        `    node scripts/sync-feat-vocabulary.mjs --editor ${ROOT}`,
    );
    process.exit(1);
  }
  console.log("[feat-vocabulary] OK");
}

main();
