#!/usr/bin/env node
// Self-test for the import-boundary ESLint rules (W0.14 / TASK A.4).
//
// The boundary zones in eslint.config.mjs are the architecture's load-bearing
// seams (worker-hang class, client-React-free, no deep-importing shell
// internals, reserved gesture-spine paths). A convention is only as good as
// its enforcement, and an enforcement rule is only trustworthy if it actually
// FIRES. This script proves it does — and, just as important, that it does NOT
// fire on the allowed cases (no false positives that would tempt someone to
// weaken the rule).
//
// Mechanism: we feed each fixture's source to ESLint's `lintText` under a
// SYNTHETIC file path (e.g. apps/canvas/src/worker/__fixture__.ts). ESLint
// resolves the flat-config zone globs against that path without the file
// needing to physically live there, so the real eslint.config.mjs is exercised
// end-to-end — no second, drifting copy of the rules. The fixture SOURCES live
// in test/eslint-boundaries/*.fixture.txt (a `.txt` extension + a config
// `ignores` entry keep them out of the normal `pnpm lint` run).
//
// Run: `pnpm lint:boundaries-selftest` (or node scripts/eslint-boundaries-selftest.mjs)
// Exits non-zero if any expectation is unmet — wire it into CI alongside lint.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ESLint } from "eslint";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const fixturesDir = resolve(repoRoot, "test", "eslint-boundaries");

const RULE = "no-restricted-imports";

/**
 * @typedef {Object} Case
 * @property {string} name        human label
 * @property {string} fixture     fixture file (under test/eslint-boundaries) OR null for inline
 * @property {string} [inline]    inline source instead of a fixture file
 * @property {string} filePath    synthetic path that selects the zone via config globs
 * @property {boolean} shouldFlag whether no-restricted-imports MUST fire
 */

/** @type {Case[]} */
const cases = [
  // --- zone (a): worker must not touch the shell barrel or react -----------
  {
    name: "zone a — worker importing @paged-media/shell barrel",
    fixture: "zone-a-worker-shell.fixture.txt",
    filePath: "apps/canvas/src/worker/__fixture__.ts",
    shouldFlag: true,
  },
  {
    name: "zone a — worker importing react",
    fixture: "zone-a-worker-react.fixture.txt",
    filePath: "apps/canvas/src/worker/__fixture__.ts",
    shouldFlag: true,
  },
  // --- zone (b): packages/client must stay React-free ----------------------
  {
    name: "zone b — packages/client importing react",
    fixture: "zone-b-client-react.fixture.txt",
    filePath: "packages/client/src/__fixture__.ts",
    shouldFlag: true,
  },
  // --- zone (c): no deep-importing shell internals -------------------------
  {
    name: "zone c — app deep-importing @paged-media/shell/components/ui/*",
    fixture: "zone-c-deep-shell-internals.fixture.txt",
    filePath: "apps/canvas/src/__fixture__.ts",
    shouldFlag: true,
  },
  // --- zone (d): gesture-spine deep paths are reserved ---------------------
  {
    name: "zone d — app deep-importing the gesture spine (disallowed)",
    fixture: "zone-d-gesture-spine.fixture.txt",
    filePath: "apps/canvas/src/__fixture__.ts",
    shouldFlag: true,
  },
  // --- positive controls: the ALLOWED cases must NOT be flagged ------------
  {
    name: "zone d — packages/tools deep-importing the gesture spine (allowed)",
    fixture: "zone-d-gesture-spine.fixture.txt",
    filePath: "packages/tools/src/__fixture__.ts",
    shouldFlag: false,
  },
  {
    name: "zone d — packages/client deep-importing the gesture spine (allowed)",
    inline: 'import { GestureSpine } from "@paged-media/client/sab/gesture";\nexport const ok = GestureSpine;\n',
    filePath: "packages/client/src/__fixture__.ts",
    shouldFlag: false,
  },
  {
    name: "control — worker importing @paged-media/client barrel (allowed)",
    inline: 'import { CameraBuffer } from "@paged-media/client";\nexport const ok = CameraBuffer;\n',
    filePath: "apps/canvas/src/worker/__fixture__.ts",
    shouldFlag: false,
  },
  {
    name: "control — app importing the @paged-media/shell barrel (allowed)",
    inline: 'import { PagedShell } from "@paged-media/shell";\nexport const ok = PagedShell;\n',
    filePath: "apps/canvas/src/__fixture__.ts",
    shouldFlag: false,
  },
];

const eslint = new ESLint({ cwd: repoRoot });

let failures = 0;
for (const c of cases) {
  const code =
    c.inline ?? readFileSync(resolve(fixturesDir, c.fixture), "utf8");
  const absPath = resolve(repoRoot, c.filePath);
  // `warnIgnored: false` — the synthetic path may sit under an ignore glob in
  // some zones; we still want the config resolved + linted, not skipped.
  const [result] = await eslint.lintText(code, {
    filePath: absPath,
    warnIgnored: false,
  });
  const restrictedMsgs = (result?.messages ?? []).filter(
    (m) => m.ruleId === RULE,
  );
  const flagged = restrictedMsgs.length > 0;

  if (flagged !== c.shouldFlag) {
    failures++;
    console.error(
      `FAIL: ${c.name}\n      expected ${RULE} to ${c.shouldFlag ? "FIRE" : "stay silent"}, ` +
        `but it ${flagged ? "fired" : "did not fire"}.`,
    );
    for (const m of result?.messages ?? []) {
      console.error(`        [${m.ruleId ?? "?"}] ${m.message}`);
    }
  } else {
    console.log(
      `ok:   ${c.name} — ${RULE} ${flagged ? "fired" : "stayed silent"} as expected`,
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} boundary self-test expectation(s) unmet.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} boundary self-test expectations met.`);
