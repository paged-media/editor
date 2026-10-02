# ADR 207 — Unbacked UI ships as a visible, inert seam

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `packages/shell` (tool rail, menu bar, catalog leaves, cockpit kit),
  `packages/tools`, the panels under `apps/canvas/src`, and `scripts/seam-guard.mjs`

## Context

The built-in tool list is a transcription of the InDesign toolbox
(`packages/tools/src/built-in-tools.ts:20`), and the engine does not serve every entry. The
list says what it "used to be full of": a rail entry with neither a gesture nor a consumer,
"which accepts a click and then" silently does nothing. The comment calls that a bug,
because the user reads the dead control as a fault in their own input, and "strictly worse
than a visible stub" (`packages/tools/src/built-in-tools.ts:33-37`).

The opposite failure is recorded in the guard script. A capability lands in the engine,
nobody removes the seam, and the UI then tells the user that a shipped feature is missing.
Three such cases "were found by hand on 2026-08-22" (`scripts/seam-guard.mjs:12-23`).

## Decision

A control whose capability does not exist is rendered, disabled, and says so. It is neither
hidden nor left clickable. The guard script dates the rule to 2026-06-05
(`scripts/seam-guard.mjs:5-7`). Each surface has one form:

- **Tools.** `ToolStatus` is `"ready"` or `"planned"`; the type comment says there is
  "deliberately no third state". A planned tool is drawn dimmed in the rail, carries
  `data-tool-status="planned"`, and gets no activation command and no keybinding. Its
  `shortcut` is kept only as a reservation.
- **Catalog leaves.** `seam: true` renders the leaf disabled and neutral, with `placeholder`
  text in place of a value. The renderer sets the same flag when a binding provider answers
  `absent` for a property.
- **Menu items.** `disabled: true` on a menu contribution greys the item, shows a `soon`
  marker and never invokes. An item whose `when` predicate is false is greyed without the
  marker, so an unbuilt item and an inapplicable one stay distinguishable.
- **Product surfaces.** `ComingSoon` is the empty-state body for a stubbed surface.

`scripts/seam-guard.mjs` holds a list of seam strings, each with the wire operation it waits
on or a reason. It fails when a listed operation is recorded as `supported` in the measured
capability table, when a seam string in the source is not listed, and when a listed string
no longer occurs in the source. It runs in the `checks` CI job.

## Evidence

- `packages/shell/src/registries/tool.ts:58-78` — `ToolStatus` and the two-state rule
- `packages/tools/src/built-in-tools.ts:24-41` — every built-in tool is working or planned;
  `:109`, `:124`, `:133`, `:349`, `:421` are the five planned entries
- `packages/shell/src/chrome/ToolRail.tsx:52-57`, `:69-72` — the rail's treatment;
  `packages/shell/src/state/commands/registry-derived.ts:54-59` — no command, no keybinding
- `packages/shell/src/catalog/leaves.tsx:37-39`, `:91-96` — the `seam` prop;
  `packages/shell/src/catalog/render.tsx:110-125` — `absent` rendered as a seam
- `packages/shell/src/registries/menu.ts:60-63`, `packages/shell/src/chrome/MenuBar.tsx:228-234`,
  `apps/canvas/src/cockpit-menus.ts:31-41` — the menu seam, the two reasons to grey, the items
- `packages/shell/src/components/cockpit/kit.tsx:401-403` — `ComingSoon`
- `scripts/seam-guard.mjs:25-43`, `:57-100`, `:159-177` — the three failure cases, the list,
  the checks; `.github/workflows/tests.yml:163-167` — the CI step

## Alternatives considered

A clickable placeholder is the removed third state. Hiding the control is rejected for the
tool rail: the slot is kept "so the toolbox reads complete"
(`packages/shell/src/registries/tool.ts:66-68`). Checking seams against the engine's type
declarations is rejected in the guard's header: presence in the wire types means an operation
can be sent, not that it works (`scripts/seam-guard.mjs:37-43`).

## Consequences

A plugin's tool gets the same treatment as a built-in one. The reservation of a planned
tool's key is checked by a test over the live registries, not at registration
(`apps/canvas/tests/e2e/registry-invariants.spec.ts:95-111`); `ToolRegistry.register`
rejects only a duplicate id (`packages/shell/src/registries/tool.ts:158-163`).

The guard covers one form of seam. It finds seams by the word "awaiting" inside a quoted
string in non-comment lines of `apps/canvas/src` and `packages`
(`scripts/seam-guard.mjs:152-153`, `:172`). A planned tool, a `seam: true` leaf, a `disabled`
menu item or a `ComingSoon` card is not compared with the capability table unless its text
has that form.

The comparison is by operation name. Of the twelve names in the list, one
(`setConditionVisible`) has a row in `apps/canvas/tests/e2e/harness/capabilities.ts` at the
pinned commit. Three entries carry a reason instead of an operation and are not compared.

## Related

- [ADR 204](204-declarative-property-panels.md) — the catalog leaves that take `seam`
- [ADR 208](208-tools-are-data-plus-gesture-handler.md) — the tool contribution
- [ADR 215](215-measured-capability-table.md) — the table the guard reads
- [ADR 023](023-shared-panels-binding-providers.md) — `absent` from a binding provider
- [ADR 024](024-context-sensitivity-is-a-core-concept.md) — an item that does not apply here
