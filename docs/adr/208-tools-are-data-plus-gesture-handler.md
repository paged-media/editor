# ADR 208 — Tools are data plus a gesture handler

- **Status:** Accepted. Recorded retroactively on 2026-10-02 from the code at `28dc764`.
- **Scope:** `packages/shell/src/registries/tool.ts`, `packages/shell/src/tools/`,
  `packages/tools`, `apps/canvas/src/ui/useGestureSpine.ts`

## Context

The tool rail shows the editor's own tools and the tools that plugin bundles contribute, in
the same slots. The registry comment says the rail "renders whatever is registered" and that
bundles contribute tools "through the identical `register` path the built-ins use"
(`packages/shell/src/registries/tool.ts:34-36`).

The handler contract separates a momentary replacement of a tool (Hand while Space is held)
from a real tool change, so that an in-flight gesture survives the first
(`packages/shell/src/tools/gesture-handler.ts:37-46`). The same file states how a handler
may act on the document and attributes that rule to an invariant of a design note that was
not in the repository at this commit (`:28-32`); it is invariant 9 of
[the client SDK design note](../design/client-sdk.md). The repository does not record why.

## Decision

A tool is a `ToolContribution`: plain data plus an optional `gesture` factory. A handler
draws its own preview and writes to the document only through the client.

- The data is id, title, icon, shortcut, flyout group, section, order, cursor, options,
  `when` and `status`. `gesture` is optional: a tool can be registered before its handler.
- `GestureSpine` holds at most one mounted `GestureHandler`. When the effective tool
  changes it calls `onDeactivate(reason)` on the outgoing handler, then `onActivate` on the
  incoming one. `reason` is `"switch"` or `"suspend"`.
- The contract comment allows two write paths, `client.mutate(Mutation)` and the worker
  gesture calls (`beginGesture`, `updateGesture`, `commitGesture`), and nothing else.
- The built-in tool set is its own package, `packages/tools`. The app passes it to
  `PagedShell` as a prop, and the shell registers each entry with `ToolRegistry.register`,
  the call a bundle's tool also ends in.
- The pen and pencil handlers take their geometry from `@paged-media/draw/geometry`, the
  published package of the drawing plugin.

## Evidence

- `packages/shell/src/registries/tool.ts:25-37`, `:80-123` — a tool is data; `ToolContribution`
- `packages/shell/src/tools/gesture-handler.ts:28-32`, `:111-132` — the write rule and the
  `GestureHandler` interface
- `packages/shell/src/tools/gesture-spine.ts:28-34`, `:54-64` — one mounted handler;
  deactivate, then activate; `apps/canvas/src/ui/useGestureSpine.ts:85-88` — the app drives it
- `packages/tools/src/index.ts:20-27`, `packages/shell/src/PagedShell.tsx:524-539`,
  `apps/canvas/src/main.tsx:1841` — the built-in set, passed as a prop and registered
- `plugin-sdk: packages/plugin-sdk/src/host-impl.ts:1246` — a bundle's tool, same registry call
- `packages/tools/src/handlers/pencil-tool.ts:48`, `packages/tools/src/handlers/pen-tool.ts:56-64`
  — the geometry imports
- `packages/client/src/client.ts:381-399`, `:1071-1172` — `mutate` and the gesture calls
- `apps/canvas/src/plugin-api-compat.ts:75-79`, `:130-137` — type assertions that the plugin
  contract's tool and handler types fit the shell's

## Alternatives considered

The pencil's path simplification was first written in the editor and then moved to the
drawing plugin's geometry package (`packages/tools/src/handlers/pencil-tool.ts:30-32`). A
built-in Type on a Path entry was retired so that the plugin's tool owns the slot
(`packages/tools/src/built-in-tools.ts:154-160`).

## Consequences

A plugin's tool and a built-in one are the same kind of object and can share a rail slot;
the pen slot's anchor tools come from the drawing plugin
(`packages/tools/src/built-in-tools.ts:172-178`).

The write rule is a convention. `onActivate` hands the handler the whole `PagedEditor`, and
no type or lint rule narrows what it may call. At the pinned commit the handlers in
`packages/tools/src/handlers` change the document only through `mutate` and the gesture
calls; their other client calls are reads, a snapshot request and a selection update.

Not every tool runs through the spine. Selection and the Type tool's click are routed by
`legacyKey` through an older pointer path (`apps/canvas/src/ui/ViewportCanvas.tsx:508-520`);
the field is marked transitional (`packages/shell/src/registries/tool.ts:119-122`). Hand and
Zoom are routed by id (`apps/canvas/src/panels/canvas-panel.tsx:70-71`).

Comments and code disagree in places. `packages/shell/src/tools/gesture-handler.ts:23-26`
says the spine and the handlers will land in `apps/canvas`; they are in `packages/shell` and
`packages/tools`. `GestureHandler.renderOverlay` is declared and nothing in this repository
calls it; the handlers publish previews through `paged.overlaySignals.setToolPreview`.
`packages/tools` is described as a future npm package (`packages/tools/src/index.ts:26-27`)
and is `private`.

## Related

- [ADR 203](203-shell-is-a-registry-host.md) — the registries, of which `ToolRegistry` is one
- [ADR 207](207-honest-seams.md), [ADR 209](209-command-is-the-action-primitive.md) —
  `status: "planned"`; tool activation as a derived command
- https://github.com/paged-media/core/blob/main/docs/adr/114-interaction-lives-in-the-engine.md
  — the gesture protocol on the engine side
