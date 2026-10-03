# ADR 204 — Property panels are declarative compositions over a curated catalogue

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `packages/catalog`, `packages/shell/src/catalog/`, `apps/canvas/src/panels/*.composition.ts`

## Context

A property panel shows values of the current selection and writes edits back to the engine.
The same kind of panel is needed three times: for the editor's own panels, for panels a
plugin describes as data, and, according to the package header, for "an external producer"
of compositions (`packages/catalog/src/index.ts:22-26`).

The recorded reasons are about auditability. The registry is the "single auditable definition" of
what UI is allowed to exist, and new entries "land in code review, never emitted inline by
documents or agents" (`packages/catalog/src/registry.ts:22-25`). The prop schema is kept
shallow so that it does not drift toward what the comment calls "JSON React"
(`packages/catalog/src/types.ts:199-206`). For plugin panels the gate on a row is "a LOOKUP,
not an expression language": a plugin that needs a comparison computes the boolean itself
and publishes the result (`packages/shell/src/catalog/schema-gate.ts:23-30`).

For the full rationale of the small binding language the comments point to design notes
that were not in the repository at this commit. The repository does not record why.

## Decision

A property panel is a tree of `CompositionNode` data. Each node names a catalogue entry by
id, gives literal props and gives bindings; one renderer walks the tree. A binding is
deliberately one of two kinds, and anything richer is written as a React component.

- `Binding` is `literal` or `selectionProperty`, the latter with a `scope` (`element` or
  `content`) and one engine `PropertyPath`.
- `selectionProperty:<path>` is the only write a binding can emit. The other `WriteSpec` tags
  (`geometry`, `collection`, `zOrder`, `selection`, `camera`) are declarations for
  hand-written leaves and cannot come from a composition.
- `useBindings` resolves every binding. It reads the properties of the selection from the
  engine, collapses a multi-selection to one value or to "mixed", and commits through
  `client.mutate({ op: "setElementProperty", … })`.
- The catalogue is a registry in which a duplicate id throws. The shell registers thirteen
  entries, all leaves: eight inputs, a readout, a list, two layout leaves and a label. An
  unknown id renders a visible "unknown catalog entry" text.
- A plugin's schema panel is rendered by the same walker over the same leaves. Each schema
  row is mapped onto a `CompositionNode` in which "the widget id IS the catalog id". A row's
  `visible` and `enabled` gates are `boolean` or `{bind, negate?}` and are resolved by
  looking up one value the plugin published.

## Evidence

- `packages/catalog/src/types.ts:36-61`, `:160-193`, `:244-254` — `Binding`, `WriteSpec`, `CompositionNode`
- `packages/catalog/src/registry.ts:43-60` — the registry; duplicate ids throw
- `packages/shell/src/catalog/built-in.ts:43-56`, `:299-303` — the thirteen ids and their registration
- `packages/shell/src/catalog/render.tsx:75-136` — the walker: lookup, unknown entry, leaf props
- `packages/shell/src/catalog/binding-hook.ts:126-140`, `:533-563` — `useBindings`; the commit
- `packages/shell/src/catalog/schema-panel-renderer.tsx:20-43`, `packages/shell/src/catalog/schema-gate.ts:34-42` — schema rows onto catalogue nodes; `resolveGate`
- `apps/canvas/src/panels/character.composition.ts:88-118`, `apps/canvas/src/panels/character-panel.tsx:228-238` — a composition and the panel that mounts it

## Alternatives considered

- **A richer binding or expression language.** Rejected in the type comment ("Anything richer
  is an expert leaf, not a richer binding language", `packages/catalog/src/types.ts:41-42`)
  and in `schema-gate.ts`, where `negate` is "the only transform".
- **JSON Schema for props.** Not used: its "expressiveness is not needed yet"
  (`packages/catalog/src/types.ts:201-202`).

## Consequences

A field can be bound only if the engine has a `PropertyPath` for it; a new panel field is
therefore an engine change first. Because the compositions' `selectionProperty` bindings
resolve through one hook, routing that hook through the binding providers retargeted the
composition panels without changing any of them (`packages/shell/src/catalog/binding-hook.ts:29-36`,
[ADR 023](023-shared-panels-binding-providers.md)).

Not every panel is a composition. `apps/canvas/src/panels/` holds thirteen
`*.composition.ts` files; the other panels there are hand-written components, and a
composition panel can mix both (the Character panel renders its family select and OpenType
row beside the composition).

The implementation is behind its own comments in four places. `coerce` is declared on a
binding and forwarded by the schema renderer, but no code reads it. The registry holds no
entry of kind `composition`; compositions are passed to the renderer directly. The type
comment says each leaf has a lint-enforced sibling `*.bindings.ts`; no such file and no such
lint rule exist. A commit on a multi-selection sends one mutation per element, so it is
undone once per element (`packages/shell/src/catalog/binding-hook.ts:546-549`).

## Related

- [ADR 023](023-shared-panels-binding-providers.md), [ADR 203](203-shell-is-a-registry-host.md), [ADR 207](207-honest-seams.md) — binding providers; the shell that hosts the renderer; the `seam` prop on a node
- [ADR 312](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/312-panels-as-data.md) — the plugin side of schema panels
- [ADR 008](https://github.com/paged-media/core/blob/main/docs/adr/008-read-surfaces-first-class-wire-collections.md) — the engine's read surfaces
- `../reference/panels.md`, `../design/panel-catalog.md`, `../design/client-sdk.md` — the panel inventory; the design notes the code comments cite
