# ADR 203 — The shell is an app-agnostic registry host: the app declares, the shell renders

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `packages/shell` (`PagedShell.tsx`, `registries/`, `state/`, `catalog/`), `apps/canvas/src/main.tsx`, `apps/canvas/src/cockpit-modes.ts`, `apps/canvas/src/plugin-api-compat.ts`

## Context

The editor is split into a shell package and an application. The application's own panels
and tools and the contributions of plugin bundles (ADR 201) have to end up in one chrome.

The shell's comments name the rule: "Apps register, shell renders"
(`packages/shell/src/registries/mode.ts:26`), and keeping application code outside
`PagedShell` "preserves the shell's app-agnostic surface"
(`packages/shell/src/PagedShell.tsx:28-29`). For the shape itself the shell's barrel points
at an architecture document that is not in this repository
(`packages/shell/src/index.ts:20-23`). The repository does not record why.

One reason is recorded: why the shell mirrors plugin contract types and does not import
them. The shell "is one layer below `apps/canvas` in the consumer chain and does NOT depend
on `@paged-media/plugin-api`", and with the application asserting the fit, "a contract change
fails the editor's typecheck at the seam" (`packages/shell/src/catalog/schema-panel-types.ts:23-31`).

## Decision

`@paged-media/shell` owns the registries, the React state contexts and the chrome. What the
chrome shows is registered into it; `apps/canvas` is the composition root that declares the
product and hosts the plugins.

- `ShellRegistries` holds twelve registries: panels, modes, commands, semantic groups,
  keybindings, menus, overlays, tools, edit contexts, object types, importers, exporters.
- `PagedShell` takes the engine client, panels, overlays, tools, modes, the panel rail and
  the canvas viewport component as props. Inside the shell, panels, overlays, tools and modes
  are registered from these props only; the shell registers commands, keybindings and menu
  entries for its own chrome.
- `apps/canvas/src/main.tsx` declares the built-in panels and the overlay list, passes
  `BUILT_IN_TOOLS` from `@paged-media/tools`, takes the six modes from `cockpit-modes.ts`
  ("The shell renders, this file declares"), and constructs the engine client.
- Only `apps/canvas` imports the plugin contract packages. It builds the backend of each
  host door (file picker and saver, widgets, asset source, blob store, clipboard, text caret,
  workers, data providers, consent, secrets, native document) and passes them to every
  `loadBundle` call.
- Where the shell implements a plugin door it declares a structural mirror of the contract
  type, kept a superset by adding optional members only. `plugin-api-compat.ts` asserts the
  fit in the application's typecheck: handle types as `Real extends Contract`, contribution
  types as `Contract extends Real`.
- The application keeps no document model. Panels read collections, bound properties and
  document meta from the engine through the shell hooks `useCollection`, `useBindings` and
  `useDocumentMeta`, and fetch again after every mutation, undo and redo. What React holds
  about the document (the `DocumentHandle`, page thumbnails, the selection and its geometry)
  is copied from engine replies; a selection change goes to the worker first.

## Evidence

- `packages/shell/src/state/registries-context.tsx:61-83` — the twelve registries
- `packages/shell/src/PagedShell.tsx:157-215`, `:498-539`, `:700-708` — the props and their registration
- `packages/shell/package.json:20-44` — dependencies: `client`, `catalog`, `ui`; no plugin contract package
- `apps/canvas/src/main.tsx:1837-1864`, `:265-299`, `apps/canvas/src/cockpit-modes.ts:20-24` — the mount; what the application declares
- `apps/canvas/src/main.tsx:1086-1267` — the host door backends and `sharedHostOptions`
- `packages/shell/src/catalog/schema-panel-types.ts:20-41`, `packages/shell/src/catalog/binding-providers.tsx:48-56`, `apps/canvas/src/plugin-api-compat.ts:20-36` — mirror, superset rule, direction of the assertions
- `packages/shell/src/catalog/use-collection.ts:64-100`, `packages/shell/src/state/document-context.tsx:41-69` — collection reads; the document state React holds
- `apps/canvas/src/main.tsx:1686-1696` — selection written to the worker first

## Alternatives considered

- **Importing the contract types into the shell.** Rejected in the two mirror comments.
- **A second loader inside the shell** that runs a bundle kernel in a Web Worker
  (`packages/shell/src/bundles/`). Still exported; the application does not use it.
- **A string form for visibility predicates.** Typed but not implemented: it "resolves to the
  always-false predicate" (`packages/shell/src/registries/types.ts:42-46`).

## Consequences

Bundles contribute tools "through the identical `register` path the built-ins use"
(`packages/shell/src/registries/tool.ts:35-36`). A panel field can be live only if the engine
exposes a collection or property for it (ADR 204). The engine does not track the active
page; the application tells the client (`apps/canvas/src/main.tsx:1477-1496`).

The shell is not free of product knowledge. `WorkflowMode` is a closed union of six mode
ids (`packages/shell/src/state/workflow-mode-context.tsx:38-44`), and the overlay
implementations the application lists are exported by the shell. `shell` and `ui` depend on
each other. The composition root is one file of 1,957 lines. Comments lag the code: the
registries provider still speaks of "the four registry instances"
(`packages/shell/src/state/registries-context.tsx:88`), and `README.md` and `CLAUDE.md`
describe a docking substrate that is no longer a dependency (ADR 002).

## Related

- [ADR 002](002-cockpit-over-dockview.md), [ADR 023](023-shared-panels-binding-providers.md), [ADR 024](024-context-sensitivity-is-a-core-concept.md) — the cockpit layout; binding providers; edit contexts
- [ADR 201](201-plugins-as-pinned-packages.md), [ADR 204](204-declarative-property-panels.md), [ADR 208](208-tools-are-data-plus-gesture-handler.md), [ADR 209](209-command-is-the-action-primitive.md) — the bundles; the panel catalogue; the tool and command registries
- [ADR 008](https://github.com/paged-media/core/blob/main/docs/adr/008-read-surfaces-first-class-wire-collections.md), [ADR 301](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/301-host-adapter-lives-in-plugin-sdk.md), [ADR 017](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/017-importer-exporter-door-shape.md) — the collections the panels read; the adapter the backends are passed to; the importer and exporter door
