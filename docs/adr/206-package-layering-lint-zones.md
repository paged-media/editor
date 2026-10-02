# ADR 206 — Package layering is enforced by lint zones that have their own tests

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `eslint.config.mjs`, `scripts/eslint-boundaries-selftest.mjs`,
  `test/eslint-boundaries/`, and through them every package under `packages/` and `apps/`

## Context

The workspace is five packages and two apps that consume each other as TypeScript source.
The render worker (`apps/canvas/src/worker/`) and the React shell both import
`@paged-media/client`; the shell's entry point pulls in React.

The lint config records what went wrong and what the rules replaced. The layering and worker
rules "used to be convention-only", documented in `CLAUDE.md` and enforced by code review
(`eslint.config.mjs:3-4`). A worker that imports the shell's entry point loads React and
hangs at startup: "This was a real bug; it is now a lint error." (`eslint.config.mjs:13-15`,
also `CLAUDE.md:50-57`).

The self-test states its own reason: a rule is trustworthy only if it fires, and it must also
stay silent on the allowed cases, so that nobody is tempted to weaken it
(`scripts/eslint-boundaries-selftest.mjs:4-10`).

## Decision

Four import boundaries were made ESLint errors, and the rules themselves are tested.

- The config enables one rule for this purpose, `no-restricted-imports`, in four zones:
  (a) files under `apps/canvas/src/worker/` may import neither `react`, `react-dom` nor
  `@paged-media/shell`; (b) `packages/client` may not import `react` or `react-dom`;
  (c) code outside `packages/shell` may not import `@paged-media/shell/components/*` or
  `@paged-media/shell/src/*`; (d) three gesture-spine paths are reserved for `packages/tools`
  and `packages/client`.
- The config is boundaries-only. It runs the typescript-eslint parser and
  `js.configs.recommended` with `no-unused-vars` and `no-undef` switched off, and not the
  typescript-eslint `recommended` rule set, because that "would bury the boundary signal"
  (`eslint.config.mjs:5-10`).
- `scripts/eslint-boundaries-selftest.mjs` runs nine cases through the real config with
  `lintText` under synthetic file paths. Five must be flagged and four must not. The sources
  are five files in `test/eslint-boundaries/` (one used under two paths) and three inline.
- Both `pnpm lint` and the self-test run in the `checks` job of the test workflow.

## Evidence

- `eslint.config.mjs:1-28` — the header: boundaries not style, the four zones, the self-test
- `eslint.config.mjs:52-113` — the restricted names and patterns, with the messages shown
- `eslint.config.mjs:175-233` — the four per-glob overrides; the worker zone is declared last
- `scripts/eslint-boundaries-selftest.mjs:12-18`, `:44-104` — the mechanism and the nine cases
- `test/eslint-boundaries/zone-a-worker-shell.fixture.txt:1-6` — one fixture: a forbidden
  import and the synthetic path it is linted under
- `eslint.config.mjs:131-133` — the fixtures are excluded from the normal lint run
- `package.json:11-13`, `.github/workflows/tests.yml:115-121` — the scripts and the CI steps
- `packages/client/src/index.ts:63-66` — a consequence stated in code: the journal lives in
  `client` because it is the only package both the worker and the shell may import

## Alternatives considered

Convention plus code review is the earlier state, named in the config header. The full
typescript-eslint `recommended` set is rejected there too. Enabling the real `react-hooks`,
`import` and `react` plugins was not done: the three rule names that existing disable
comments refer to are registered as no-op stubs so those comments stay valid
(`eslint.config.mjs:34-48`, `:151-163`).

## Consequences

Code that both the worker and the UI need has to live in `packages/client`, and has to be
free of React. Other packages reach the shell's components through its entry point.

The zones are not a complete layering check. No rule states the dependency direction
between packages; that is carried only by each package's `package.json`. `packages/shell`
and `packages/ui` depend on each other (`packages/shell/package.json:30`,
`packages/ui/package.json:17`), while `CLAUDE.md:45-46` gives only `ui → shell`.

Zone (c) names two path families. The shell's `exports` map also offers `./state/*`,
`./tailwind.config` and two style sheets (`packages/shell/package.json:8-15`), which the rule
does not restrict; the app imports two of them (`apps/canvas/tailwind.config.ts:28`,
`apps/canvas/src/main.tsx:61`).

Because a later override replaces the rule's options, each zone restates the patterns it
keeps. The worker zone does not restate the gesture-spine patterns, so
`@paged-media/client/sab/gesture` is not restricted there. No source file in the repository
imports any of the three reserved gesture-spine paths; the allowance in zone (d) is exercised
only by the self-test.

## Related

- [ADR 202](202-render-worker-owns-the-canvas.md) — the worker whose imports zone (a) guards
- [ADR 203](203-shell-is-a-registry-host.md) — the shell whose internals zone (c) guards
- [ADR 205](205-client-packaged-as-write-sdk.md) — the React-free client package
- [ADR 216](216-test-tiers.md) — the `checks` job and the other structural guards
