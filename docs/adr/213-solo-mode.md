# ADR 213 — Solo mode is a filter over the same app

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `apps/canvas/src/solo/`, the solo wiring in `apps/canvas/src/main.tsx`, `packages/shell/src/state/chrome-storage-scope.ts`, `scripts/solo-profiles-guard.mjs`

## Context

A plugin can be offered as an application of its own: the drawing plugin as an illustration
program, the document plugin as a word processor. Commit `97333d0` (2026-08-25) introduced
this for six plugins under the name solo mode.

The header of `apps/canvas/src/solo/profiles.ts` records the assumption that was dropped. It
had been expected that such an application needs a document model of its own: one artboard
or one canvas in place of a run of pages. A scoping note of 2026-08-25, which the comment
names, found that a blank document created at 2000 by 2000 points already has one page of
that size, accepts inserts and renders. The comment concludes that a one-page document is an
artboard, and that the constraint "lived in the DEFAULTS and the FURNITURE"
(`profiles.ts:22-29`). The commit message adds that the plugin contract does not change: the
host declares the profile, and the plugin does not know it is hosted solo.

## Decision

`?solo=<name>` starts the ordinary editor with one plugin bundle activated and an allow-list
of host surfaces. A profile is configuration, resolved once at module scope before React
renders. There is no second entry point, no second build and no second document model.

- A `SoloProfile` names one bundle id, a title, a document size, the host panels, tools and
  top-level menus it keeps, the cockpit slots, the rail entries and the palette suggestions.
- Six profiles exist: `paged.draw`, `paged.image`, `paged.sheet`, `paged.doc`, `paged.web`
  and `paged.data`. An absent, empty or unknown name resolves to `null`, and the ordinary
  editor starts.
- `main.tsx` filters `BUILT_IN_PANELS`, `BUILT_IN_TOOLS`, `PANEL_RAIL` and the host menu
  items by the profile. Panels named by the profile's slots and rail survive, the tools in
  `ALWAYS_IN_PALETTE` are always kept, and a menu disappears when none of its items remains.
- Only the profile's bundle is passed to `loadGuarded`; the other seven are never activated.
- The profile registers one workflow mode under the existing id `design`. The mode switcher
  is not rendered for a single mode.
- The shell creates one blank document of the profile's size at start, when none is open.
- `setChromeStorageScope` appends `.solo.<bundle id>` to the `localStorage` keys of the
  cockpit layout and the workflow mode, before their first read.

## Evidence

- `apps/canvas/src/solo/profiles.ts:18-45` — what solo is and is not; allow-list and not deny-list
- `apps/canvas/src/solo/profiles.ts:49-79`, `:466-502` — the profile shape, the six profiles, total resolution
- `apps/canvas/src/main.tsx:1884-1947`, `:1755-1760`, `:1839-1849` — resolution at module scope, the storage scope, the filters, the props handed to `PagedShell`
- `apps/canvas/src/main.tsx:1302-1341` — one bundle activated; "NOT a download win", because the eight imports are static
- `apps/canvas/src/solo/mode.ts:26-37`, `:44-58` — the single mode and why its id is `design`
- `packages/shell/src/PagedShell.tsx:457-479` — the document created at start
- `scripts/solo-profiles-guard.mjs:2-32`, `.github/workflows/tests.yml:173-180` — the id check and its CI step

## Alternatives considered

A separate document model per product: dropped for the reason given in Context. A deny-list:
rejected in the comment, because every new host panel would then appear in every profile
without anyone deciding so (`profiles.ts:34-39`).

Profiles for the PDF and IDML format bundles: not offered. Between them they contribute one
importer and one exporter and no command, panel, tool or edit context (`profiles.ts:475-482`).

## Consequences

A plugin needs no code to be hosted solo. Its own panels, tools and menus arrive with the
bundle; the profile lists only host surfaces.

The allow-list has the opposite failure: a renamed host panel or tool drops out of a profile
without an error. `scripts/solo-profiles-guard.mjs` resolves every id against the code that
registers it and runs in the `checks` job. Where a bundle's manifest cannot be read it checks
the host ids only and prints which profiles went unchecked; the script states that this is
the case for `@paged-media/doc` in that job (`scripts/solo-profiles-guard.mjs:63-79`).

Solo saves no download: all eight bundle modules are imported statically and evaluated, and
only the `activate()` of the other seven is skipped. The mode id `design` is reused because
`WorkflowMode` is a closed union; the id is also a storage key, which is why the storage
scope exists (`packages/shell/src/state/chrome-storage-scope.ts:16-40`).
`apps/canvas/tests/journey/focused/solo-mode.journey.spec.ts` starts every profile and
checks its page size, its own panels and its menus.

Two comments do not match the code. `profiles.ts:42-44` says `profiles.spec.ts` resolves the
ids; no such file exists, and the check is the guard script. `profiles.ts:54` says
`File ▸ New` creates a document of the profile's size; the command is registered without a
default size (`packages/shell/src/PagedShell.tsx:857-862`) and falls back to Letter
(`packages/shell/src/state/commands/file-commands.ts:91`), so only the start document has it.

## Related

- [ADR 201](201-plugins-as-pinned-packages.md) — why all bundles are compiled in
- [ADR 203](203-shell-is-a-registry-host.md) — the registries the filtered lists are handed to
- [ADR 002](002-cockpit-over-dockview.md) — the fixed workflow modes whose id solo reuses
- [ADR 216](216-test-tiers.md) — the `checks` job and the journey tier
