# ADR 002 — Shell substrate: custom Cockpit, replacing Dockview

**2026-06-07 · decision record · status: ACCEPTED (records a swap already shipped
in code).**

**Sources:** `packages/shell/src/cockpit/`;
`packages/shell/src/state/workflow-mode-context.tsx` (modes
`design|content|prepress|data|review|export`); the original architecture spec,
§"Docking Substrate" + its 2026-06-07 Status block; `grep dockview-react`
over the repository = 0 hits, absent from every `package.json`.

## The decision

**The editor shell is a custom fixed 6-mode Cockpit, not the Dockview docking
engine the architecture spec specified.** The original architecture spec built a whole
"Docking Substrate" around `DockviewSubstrate`, the "exactly one file imports
`dockview-react`" invariant, and float/pop-out/tab panels. Dockview was removed
entirely; zero dockview dependencies remain.

## Why (reconstructed rationale)

Not written down at swap time — **reconstructed** from the shipped shape:

- The six workflow modes (`design|content|prepress|data|review|export`) are
  **fixed, curated layouts**, not user-arrangeable free docks. A DTP cockpit
  wants a per-task panel set, not a windowing manager. A general docking engine
  was carrying weight (float/pop-out/tabs/persistence) the product did not use.
- Panels became **per-mode slots**, so the value Dockview added (arbitrary
  drag-to-dock) was exactly the value the product chose not to expose.

## What survived vs what changed

- **Survived intact (the discipline working):** the *substrate-isolation
  principle* — the Cockpit is the new single seam; the four registries; the five
  state contexts; the tsify single-source-of-truth contract; the
  `protocol.ts`-shrinks-to-a-re-export thesis (now a re-export barrel over the
  published `@paged-media/canvas-wasm` `.d.ts`). All proven in code. The swap is
  the substrate-isolation discipline *doing its job* — the substrate was swapped
  cheaply, which is exactly what isolating it was for.
- **Changed:** modes replace docks; per-mode slots replace free panels; the
  panel-gallery pass replaced the dockview group/theme machinery. Panels do not
  float or pop out, so the spec's AC #4 (float/pop-out) and AC #10 ("exactly one
  file imports `dockview-react`") are **unsatisfiable as written** — superseded,
  not failed.

## Consequences

- The original architecture spec's entire Docking Substrate section + ACs #4/#5/#10/
  #11–12 are historical; the doc carries an in-place Status block flagging this.
  The owed full section rewrite is the doc-maintenance task, not this ADR.
- `packages/shell/src/registries/semantic-group.ts` (the dockview-group-ID mapper) survives
  vestigially, barrel-exported; flagged for removal with the section rewrite.
- An internal backend design note's "the Dockview shell persists its layout"
  is a stray noun — the persistence *mechanism* (server stores an opaque
  editor-prefs JSON blob) is unaffected; only the substrate name changed.

## Amendment — 2026-10-02

Checked against the code at `28dc764`. The decision stands. The shell is the fixed cockpit
(`packages/shell/src/cockpit/CockpitLayout.tsx:20-26`), the workflow modes are the six-member
union at `packages/shell/src/state/workflow-mode-context.tsx:38-44`, and no `package.json`, no
lockfile entry and no import in the repository names Dockview. The library was deleted in commit
`b227bab` (2026-06-05). Four statements above need qualifying.

**1. "Dockview was removed entirely" holds for dependencies and code, not for text.** The word
still appears in 29 files, all of them comments or prose:

- `README.md:44` and `CLAUDE.md:41` list a "dockview docking substrate" among the contents of
  `packages/shell`; `CLAUDE.md:126` names a `dockview-theme-paged` bridge.
- `packages/shell/src/styles/theme.css:23` points at `dockview-theme.css`. No such file exists;
  `packages/shell/src/styles/` holds `globals.css` and `theme.css`.
- `packages/shell/src/PagedShell.tsx:1201-1203`, `:1254-1255`,
  `packages/shell/src/cockpit/cockpit-state-context.tsx:84` and
  `apps/canvas/src/cockpit/toolbars.tsx:207-208` describe a "legacy dockview" path beside the
  cockpit. There is none: `cockpitActive` is `Boolean(canvasComponent)`
  (`packages/shell/src/PagedShell.tsx:543`), and without a canvas component the shell renders
  a placeholder message (`:1216-1227`).

**2. `semantic-group.ts` is still there.** The second Consequences bullet flags it for removal.
It is exported (`packages/shell/src/registries/index.ts:41-44`,
`packages/shell/src/index.ts:204`, `:223`) and instantiated
(`packages/shell/src/state/registries-context.tsx:116`). Nothing reads the `semanticGroups`
registry, and the bundle loader's `registerSemanticGroup` case is empty
(`packages/shell/src/bundles/loader.ts:112-118`).

**3. Tabs and persistence exist in a reduced form.** The first rationale bullet lists
"float/pop-out/tabs/persistence" as weight the product did not use. Floating, pop-out and
re-docking are absent. Tabs and persistence are not:

- `packages/shell/src/cockpit/RightDock.tsx:20-25` — the right dock is a tab group, "The ONLY
  tabbed surface in the app; panels never float or re-dock elsewhere."
- `packages/shell/src/cockpit/cockpit-state-context.tsx:20-29` — every mode owns an ordered tab
  list, and any registered panel can be opened as an extra closable tab.
- `packages/shell/src/cockpit/cockpit-persistence.ts:20-24`, `:36-43`, `:96` — which tabs are
  open and which is active is stored per mode in one `localStorage` entry.

The third Consequences bullet speaks of a server that stores layout preferences. That backend
design is not part of this repository; the `localStorage` entry above is the only layout
persistence here. See [ADR 211](211-no-backend.md).

**4. "Fixed 6-mode" describes the full editor, not every build.** The modes are contributions
the application registers (`packages/shell/src/registries/mode.ts:66-82`); the full editor
registers six (`apps/canvas/src/cockpit-modes.ts:37-127`). Solo mode registers exactly one, under
the id `design` (`apps/canvas/src/solo/mode.ts:44-46`, `apps/canvas/src/main.tsx:1842`), and the
mode switcher is then not rendered (`packages/shell/src/PagedShell.tsx:1239`). See
[ADR 213](213-solo-mode.md).
