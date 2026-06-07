// Flat ESLint config — ARCHITECTURE BOUNDARIES, not style.
//
// This repo's package layering + worker rules used to be convention-only
// (documented in CLAUDE.md, enforced by code review). This config turns the
// load-bearing ones into lint errors. It is deliberately LEAN: we run the
// typescript-eslint PARSER (so `no-restricted-imports` sees real import
// syntax) but NOT the opinionated `recommended` ruleset — prettier owns
// style, and flooding the existing tree with `no-explicit-any`/`no-unused-vars`
// churn would bury the boundary signal. Add stylistic rules elsewhere if ever
// wanted; here we only guard the seams.
//
// Zones (see CLAUDE.md "Hard rules" + the W0.14 audit):
//   (a) apps/canvas/src/worker/**  — NO @paged-media/shell, NO react.
//       A worker that pulls the shell barrel loads React and HANGS at
//       startup. This was a real bug; it is now a lint error.
//   (b) packages/client/**         — React-free. client is the wasm/SAB
//       boundary; its barrel is imported by the worker, so any react edge
//       reintroduces the hang class.
//   (c) any non-shell code         — must not DEEP-import shell internals
//       (`@paged-media/shell/components/ui/*`); go through the barrel.
//   (d) gesture-spine deep paths   — only packages/tools + packages/client
//       may deep-import the gesture spine / sab gesture primitives. Everyone
//       else consumes the `GestureSpine` re-export from the shell barrel.
//
// The zones are encoded as per-glob overrides (flat config = an array of
// configs, each scoped by `files`). A self-test under
// `scripts/eslint-boundaries-selftest.mjs` + `test/eslint-boundaries/`
// proves the rules actually fire.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

// --- forward-compat plugin-rule stubs ------------------------------------
//
// The existing tree carries inline `eslint-disable` directives for rules from
// plugins we deliberately DON'T enable here (this config is boundaries-only;
// `react-hooks/exhaustive-deps` & friends are style/correctness rules that
// would flood the tree and fight the lean mandate). Without the plugins
// registered, ESLint hard-errors on those directives ("Definition for rule X
// was not found"). Rather than strip ~40 files of meaningful disable comments
// (churn the audit warns against) or pull in heavyweight plugins, we register
// the referenced rule NAMES as no-op stubs: the directives stay valid and
// forward-compatible for when the real plugins land, while staying off today.
const noopRule = { meta: { schema: [] }, create: () => ({}) };
const stubPlugin = (...ruleNames) => ({
  rules: Object.fromEntries(ruleNames.map((n) => [n, noopRule])),
});

// --- shared restricted-import targets ------------------------------------

// The shell barrel + React, forbidden inside worker code (zone a).
const WORKER_FORBIDDEN = [
  {
    name: "react",
    message:
      "Worker code must not import React. The shell barrel pulls React in and a " +
      "worker that loads it HANGS at startup (real bug). Deep-import SAB/protocol " +
      "primitives from @paged-media/client instead.",
  },
  {
    name: "react-dom",
    message: "Worker code must not import react-dom (see the react restriction).",
  },
];

const WORKER_FORBIDDEN_PATTERNS = [
  {
    group: ["@paged-media/shell", "@paged-media/shell/*"],
    message:
      "Worker code must NEVER route through @paged-media/shell — the barrel loads " +
      "React and the worker hangs at startup. Deep-import the primitive you need " +
      "from @paged-media/client (its barrel is React-free).",
  },
];

// React, forbidden inside packages/client (zone b).
const CLIENT_FORBIDDEN = [
  {
    name: "react",
    message:
      "@paged-media/client must stay React-free — it is the wasm/SAB boundary and " +
      "is imported by the worker. A React edge here reintroduces the worker-hang class.",
  },
  {
    name: "react-dom",
    message: "@paged-media/client must stay React-free (see the react restriction).",
  },
];

// Deep imports of shell internals, forbidden everywhere outside the shell (zone c).
const SHELL_INTERNALS_PATTERNS = [
  {
    group: ["@paged-media/shell/components/*", "@paged-media/shell/src/*"],
    message:
      "Do not deep-import shell internals (components/ui/*, src/*). Import the public " +
      "symbol from the @paged-media/shell barrel; the internals are not a stable API.",
  },
];

// Gesture-spine deep paths, reserved for packages/tools + packages/client (zone d).
const GESTURE_SPINE_PATTERNS = [
  {
    group: [
      "@paged-media/shell/tools/gesture-spine",
      "@paged-media/shell/src/tools/gesture-spine",
      "@paged-media/client/sab/gesture",
    ],
    message:
      "The gesture-spine deep paths are reserved for packages/tools + packages/client. " +
      "Everyone else uses the GestureSpine re-export from the @paged-media/shell barrel.",
  },
];

export default tseslint.config(
  // 0. Ignore generated / vendored / build output. Keep this first so the
  //    globs apply repo-wide before any linted config object.
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.vite/**",
      "**/playwright-report/**",
      "**/test-results/**",
      // The boundary self-test fixtures are INTENTIONALLY-bad imports; the
      // self-test runs eslint against them directly with its own inline config.
      "test/eslint-boundaries/**",
      // wasm-bindgen / generated d.ts shims, if any land in-tree.
      "**/*.d.ts",
    ],
  },

  // 1. Base layer — the typescript-eslint PARSER on every TS/TSX file, plus
  //    the minimal JS recommended safety net. No stylistic/`any`/unused rules:
  //    boundaries only, prettier owns the rest. The stub plugins keep the
  //    tree's existing disable directives valid (see noopRule above).
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    extends: [js.configs.recommended, tseslint.configs.base],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      import: stubPlugin("no-relative-parent-imports"),
      "react-hooks": stubPlugin("exhaustive-deps"),
      react: stubPlugin("no-array-index-key"),
    },
    // The stub rules above never report, so ESLint would flag EVERY existing
    // disable directive as "unused". That's an artifact of the stubs, not a
    // real finding — the directives are forward-compat for when the real
    // plugins land. Suppress the unused-directive report so the boundary
    // signal isn't buried. (Re-enable once the real plugins are wired.)
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      // `js.configs.recommended` flags `no-unused-vars`; tseslint's base does
      // not re-map it, and it would flood the existing tree. Off here — the
      // per-package tsconfig `noUnusedLocals` already covers it at typecheck.
      "no-unused-vars": "off",
      // We use the typescript-eslint parser; the base no-undef is noisy with
      // TS types/globals and is better handled by tsc. Off to stay lean.
      "no-undef": "off",
    },
  },

  // 2. ZONE (c) — repo-wide: no deep-imports of shell internals, and the
  //    gesture-spine deep paths are reserved (overridden looser in zone d for
  //    the two allowed packages).
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["packages/shell/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...SHELL_INTERNALS_PATTERNS, ...GESTURE_SPINE_PATTERNS] },
      ],
    },
  },

  // 3. ZONE (d) — packages/tools + packages/client MAY use the gesture-spine
  //    deep paths. Re-state the restriction WITHOUT the gesture-spine patterns
  //    so only the shell-internals guard remains for these two packages.
  {
    files: ["packages/tools/**/*.{ts,tsx}", "packages/client/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...SHELL_INTERNALS_PATTERNS] },
      ],
    },
  },

  // 4. ZONE (b) — packages/client must stay React-free. Layer the React ban
  //    on top of the shell-internals guard already set in zone 3.
  {
    files: ["packages/client/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...CLIENT_FORBIDDEN],
          patterns: [...SHELL_INTERNALS_PATTERNS],
        },
      ],
    },
  },

  // 5. ZONE (a) — worker code: no shell barrel, no React. Most restrictive;
  //    declared last so it wins for files under apps/canvas/src/worker/.
  {
    files: ["apps/canvas/src/worker/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.worker },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...WORKER_FORBIDDEN],
          patterns: [...WORKER_FORBIDDEN_PATTERNS, ...SHELL_INTERNALS_PATTERNS],
        },
      ],
    },
  },
);
