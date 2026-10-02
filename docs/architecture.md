# Architecture

How the editor is built: a browser application for page layout that drives the paged
engine across a package boundary and hosts the first-party plugins. This page describes
the code at commit `28dc764`; the reasons are in the ADRs under [`adr/`](adr/README.md).
Where the repository's `README.md` or `CLAUDE.md` differ, this page follows the code.

## Workspace

A pnpm workspace (`apps/*`, `packages/*`): TypeScript, React 18, Vite, Tailwind. There is
no Rust here. The engine and the plugins arrive as npm packages that carry their own wasm.

| Path | Package | What it owns |
|---|---|---|
| `packages/client` | `@paged-media/client` | `CanvasClient` (the main-thread handle on the render worker), re-exports of the engine's wire types (`src/protocol.ts`), the two shared-memory buffers (`src/sab/`), the journal buffer (`src/journal/`). No React. The only manifest that is not private. |
| `packages/catalog` | `@paged-media/catalog` | Types and registry for declarative panel compositions: `Binding`, `CompositionNode`, `CatalogRegistry`. |
| `packages/shell` | `@paged-media/shell` | `PagedShell`, the React state contexts, twelve registries, the cockpit layout and chrome, canvas overlays, the composition renderer and its leaves, the actions recorder, the demo automation layer, icons and design tokens. |
| `packages/ui` | `@paged-media/ui` | Input primitives (`NumberInput`, `LengthInput`, `ScrubField`, `BoundsInput`, `ColorPicker`), the colour mixer and wheel, a code editor widget. |
| `packages/tools` | `@paged-media/tools` | The built-in tool list (`BUILT_IN_TOOLS`) and its gesture handlers. |
| `apps/canvas` | `paged-canvas` | The application: composition root (`src/main.tsx`), render worker (`src/worker/`), viewport (`src/ui/`), panels (`src/panels/`), plugin host backends (`src/plugin-*.ts`), solo profiles, the playground, and every Playwright test (`tests/`). |
| `apps/devtools` | `paged-devtools` | A separate scene inspector over `@paged-media/introspect-wasm`; it imports nothing from the other packages. |

The packages are consumed as TypeScript source (`"main": "./src/index.ts"`); only
`packages/client` has a `build` script and a `publishConfig`
([ADR 205](adr/205-client-packaged-as-write-sdk.md)). Dependency direction, from the
manifests and imports: `canvas → tools → shell → catalog → client →
@paged-media/canvas-wasm`; `canvas` also imports `shell`, `ui`, `catalog` and `client`.

- `shell` and `ui` depend on each other: the shell's catalog leaves use ui's inputs, and
  ui uses the shell's `Icon`, `useCanvasClient` and `useScrubGesture`.
- No file under `packages/` imports `@paged-media/plugin-api` or `plugin-sdk`; only
  `apps/canvas` does. `packages/tools` imports path geometry from `@paged-media/draw`.
- `client` is not the only importer of the engine package: the worker loads the wasm.

Four import boundaries are ESLint errors with their own self-test: worker code may import
neither React nor the shell; `packages/client` may not import React; nothing outside the
shell deep-imports its internals; the gesture-spine deep paths are reserved for `tools` and
`client` ([ADR 206](adr/206-package-layering-lint-zones.md)). So code that both the worker
and the React side need, such as the journal, lives in `client`.

## The engine boundary

The engine is the Rust workspace in the `core` repository. The editor takes it only as the
published package `@paged-media/canvas-wasm`, pinned exactly (`0.64.0`) in the manifests of
`packages/client` and `apps/canvas` ([ADR 200](adr/200-engine-as-npm-wasm-packages.md)).

- Every wire type in `packages/client/src/protocol.ts` is a re-export from the package's
  generated declarations; the file's header forbids hand-written types there.
- `PROTOCOL_VERSION` is parsed from the minor of the installed package's version
  ([core ADR 006](https://github.com/paged-media/core/blob/main/docs/adr/006-protocol-coupled-versioning.md)).
- At start-up the worker compares the wasm's `protocolVersion` and shared-memory layouts
  with the TypeScript side and posts a `protocolMismatch` warning on any difference
  (`apps/canvas/src/worker/worker.ts:264-300`). The client treats it as fatal and rejects
  every pending and later request (`packages/client/src/client.ts:1525-1527`).

## The worker and the canvas

```
main thread                                      render worker (apps/canvas/src/worker)
───────────                                      ─────────────
React, PagedShell, panels, overlays (DOM/SVG)    engine wasm: CanvasWorker
CanvasClient                                     WorkerRenderer (render loop)
   │  envelope {seq, protocol, kind, payload} ─►  handleMessage(json) -> json     reply by seq
   │  camera buffer, 32 bytes, shared         ─►  read every 16 ms tick
   │  gesture buffer, 32 bytes, shared        ─►  drained every 8 ms -> updateGestureRaw
   │  document, font, ICC bytes (transferred) ─►  loadDocumentDirect(bytes)
   └  <canvas>.transferControlToOffscreen()   ─►  WebGPU surface, or 2D context
```

`CanvasAppRoot` in `main.tsx` constructs the worker with Vite's `?worker` import and hands
it to `CanvasClient` as a `workerFactory`. `ViewportCanvas`
(`apps/canvas/src/ui/ViewportCanvas.tsx:315-316`) transfers the `<canvas>` to the worker
once. From then on the main thread draws no document pixels: it writes the camera, forwards
input, and draws overlays (selection chrome, handles, snap lines, caret) as DOM and SVG.
See [ADR 202](adr/202-render-worker-owns-the-canvas.md); the engine's side is
[core ADR 115](https://github.com/paged-media/core/blob/main/docs/adr/115-worker-boundary-transports.md).

- All incoming messages go through one queue and one asynchronous pump, because GPU
  initialisation awaits and a second message would re-enter the wasm (`worker.ts:321-386`).
- `attachRenderer` tries `initGpu` first and falls back to a 2D context; a canvas that has
  handed out a 2D context cannot take WebGPU (`worker.ts:606-620`).
- `WorkerRenderer.tick` (`apps/canvas/src/worker/render.ts`) runs on `setTimeout(16)` and
  redraws only when the camera generation changed or a page was marked dirty. The GPU path
  calls the engine's `presentFrame`. The CPU path asks the engine for one PNG tile per
  visible page (256 px wide by default), caches it and blits it under the camera transform.
- Page positions are computed in TypeScript (`apps/canvas/src/ui/layout.ts`, shared by
  both threads): pages are stacked vertically; spreads are not laid side by side.

## Input: pointer, gestures, text

The application decides what a pointer event means; the engine does the geometry
([core ADR 114](https://github.com/paged-media/core/blob/main/docs/adr/114-interaction-lives-in-the-engine.md)):

- A click sends `hitTest` and receives the element, or the story offset for text.
- A drag is `client.beginGesture`, deltas written to the gesture buffer, then
  `commitGesture` or `cancelGesture`. The worker applies the latest delta on its 8 ms drain
  and posts snap lines back as an unsolicited `gestureSnapLines` message for an overlay.
- Typing is `insertText` and `deleteRange` mutations. Left and right move the caret
  locally; up, down, Home and End ask the engine (`apps/canvas/src/ui/useTextEditing.ts`).

Two dispatch paths exist side by side. A tool that carries a `gesture` factory is mounted
by the `GestureSpine` (`packages/shell/src/tools/gesture-spine.ts`), one handler at a time.
Selection and text clicks run through older pointer code inside `ViewportCanvas`, selected
by a tool's `legacyKey`; Hand and Zoom are routed by `apps/canvas/src/panels/canvas-panel.tsx`.
A handler may draw a preview on the overlay but changes the document only through
`client.mutate` or the gesture calls ([ADR 208](adr/208-tools-are-data-plus-gesture-handler.md)).

## The shell and its registries

`<PagedShell>` composes the state providers, registers what the application passes in, and
renders the chrome: header with menu bar, context toolbar, tool rail, cockpit layout, panel
rail, mode switcher, command palette, PDF export dialog. It knows no concrete panel, tool
or mode; `apps/canvas` passes them as props (`panels`, `overlays`, `tools`, `modes`,
`panelRail`, `canvasComponent`). See [ADR 203](adr/203-shell-is-a-registry-host.md).

`ShellRegistries` (`packages/shell/src/state/registries-context.tsx`) holds twelve
registries: panels, modes, commands, semantic groups, keybindings, menus, overlays, tools,
edit contexts, object types, importers, exporters. Plugin bundles register into the same ones.

- **Commands.** Menu items, keybindings and palette entries resolve to a command, and
  `CommandRegistry.invoke` is the one place a handler is called; `observe()` on it feeds the
  actions recorder and the journal ([ADR 209](adr/209-command-is-the-action-primitive.md)).
- **Layout.** A fixed three-column cockpit (`packages/shell/src/cockpit/CockpitLayout.tsx`):
  one left panel, the canvas column, a right dock of tabs. A workflow mode is a view over
  registered panels; `apps/canvas/src/cockpit-modes.ts` declares six. No docking library
  is a dependency ([ADR 002](adr/002-cockpit-over-dockview.md)).
- **Edit contexts.** A double-click on a matching element enters a scoped editing mode that
  restricts the tool set, emphasises a set of panels, shows a breadcrumb and pops on Escape
  ([ADR 024](adr/024-context-sensitivity-is-a-core-concept.md)).
- **Conventions.** A control with no engine capability behind it is rendered disabled and
  says so ([ADR 207](adr/207-honest-seams.md)); colours and spacing come from one token
  file, `packages/shell/src/styles/theme.css` ([ADR 210](adr/210-design-token-bridge.md)).

## Panels and state

The application keeps no document model of its own and uses no state library. React holds
the document handle the engine returned (page ids and sizes, statistics), page snapshots,
application state (camera, tool stack, mode, theme) and a mirror of the selection, which
the worker owns: the selection is written to the worker first, the mirror from its answer.

Panels read the engine through shell hooks that refetch on `mutationApplied`, `undoApplied`
and `redoApplied`: `useCollection<T>(name)` and `useDocumentMeta()` for document collections
([core ADR 008](https://github.com/paged-media/core/blob/main/docs/adr/008-read-surfaces-first-class-wire-collections.md)),
and the binding hook (`packages/shell/src/catalog/binding-hook.ts`) for properties of the
selection, written back as `setElementProperty` mutations.

`BUILT_IN_PANELS` in `main.tsx` registers 73 panels. Thirteen `*.composition.ts` files
describe panel content as data: a tree of catalogue nodes with bindings, walked by one
renderer over thirteen primitive leaves (`packages/shell/src/catalog/built-in.ts`). A
binding is a literal or one property path of the selection; anything richer is a React
component. The same renderer draws panels that a plugin describes as data
([ADR 204](adr/204-declarative-property-panels.md)). While a plugin's edit context is
active, the binding hook asks that plugin's provider first and falls through to the engine
when it declines ([ADR 023](adr/023-shared-panels-binding-providers.md)).

## Plugin hosting

`main.tsx` imports eight bundles statically (`draw`, `web`, `data`, `sheet`, `image`,
`publish`, `pdf`, `doc`), each pinned to an exact version in `apps/canvas/package.json`,
and `PluginBundles` activates them once, in that order, through plugin-sdk's `loadBundle`.
Bundles run as modules of the application on the main thread; no bundle is discovered or
loaded from a URL at run time ([ADR 201](adr/201-plugins-as-pinned-packages.md)).

- The host adapter is plugin-sdk's. The application supplies an editor handle and the
  backends only it can provide (`sharedHostOptions`, `main.tsx:1251-1267`): file picker and
  saver, blob store, clipboard, text-caret reader, worker backend, consent and secret
  stores with their dialogs, the native-document door, a font asset source, a diagnostics
  sink, the schema-panel renderer, and the data-provider and binding-provider registries.
  `apps/canvas/src/plugin-api-compat.ts` asserts at type level that the editor's types
  still fit the published contract.
- Each load is wrapped by `apps/canvas/src/plugin-load-guard.ts`: a bundle that throws
  during activation is reported to the journal and the Problems panel, and the rest load.
- The worker backend resolves a bundle's declared module path only from a table the editor
  ships; the table has one entry, the image plugin's decode worker.
- One bundle is not consumed as a pinned package: the root `package.json` overrides
  `@paged-media/doc` with a `link:` to a sibling checkout of plugin-doc, which `tests.yml` and
  `showcase-nightly.yml` check out and build first (`.github/actions/plugin-doc-from-source/action.yml`);
  `playground.yml` and `demo-capture.yml` do not.
- `scripts/wasm-budget.mjs` fails when the distinct `.wasm` files the application can
  resolve sum to more than 100 MB
  ([plugin-sdk ADR 308](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/308-plugin-wasm.md)).

`?solo=<profile>` boots the same application with one bundle activated and an allow-listed
subset of host panels, tools and menus (six profiles, `apps/canvas/src/solo/profiles.ts`).
The other bundles are still imported; only their `activate()` is skipped
([ADR 213](adr/213-solo-mode.md)).

## Opening, saving and exporting

There is no server component in this repository; documents are local files
([ADR 211](adr/211-no-backend.md)).

- **Open.** The "Open…" command and the drag-drop handler first ask
  `registries.importers.resolve(name, mime)` (extension, then MIME type, first registered
  wins); a matching importer receives the bytes and decides what the file becomes
  ([plugin-sdk ADR 017](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/017-importer-exporter-door-shape.md)).
  With no importer, `loadDocumentFile` (`packages/shell/src/state/document-loader.ts`)
  sends the bytes to the engine with a default font, sets the document handle and requests
  one snapshot per page. A `.paged` file takes this path; the engine decides how to read it
  ([core ADR 118](https://github.com/paged-media/core/blob/main/docs/adr/118-paged-file-is-a-valid-idml-package.md)).
  An importer that opens a whole document calls `host.nativeDocument.open`, whose backend
  runs the same `loadDocumentFile`. File ▸ New asks the engine for a blank document.
- **Save.** `savePaged` (`main.tsx:1600-1638`) takes the `.paged` container from
  `client.exportPaged()` and writes it to the file handle that the Open command's File
  System Access picker stored, when there is one; otherwise it downloads it. A failure
  goes to the Problems panel. There is no autosave; a `beforeunload` prompt is installed
  while the document is dirty.
- **Export.** IDML through `client.exportIdml()` ("Save As IDML…"); PDF through
  `client.exportPdf`, a begin, page-by-page, finish session driven by `ExportPdfDialog`;
  page images through `client.requestSnapshot`. The export mode's Outputs panel also lists
  every exporter in the exporter registry and delivers its bytes as a download.

Where things are stored: the document is in the engine, in the worker's memory, until it is
saved. Chrome state (theme, workflow mode, right-dock tabs, palette recents, recorded
actions, PDF export options) is in `localStorage`. Plugin binary state is in OPFS, one
directory per plugin (`apps/canvas/src/plugin-blob-store.ts`). Credentials a plugin asks
the host to hold are in IndexedDB, wrapped with a key derived from a user passphrase, or in
memory when none is set (`apps/canvas/src/plugin-secret-store.ts`); plugins get no read
method. The journal is two in-memory ring buffers, one per thread, exported on request.

## Hosting and automation

The build is a static site that must be served cross-origin isolated, because the shared
buffers need it. `apps/canvas/public/_headers` and the dev server set
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`;
`main.tsx` checks isolation at boot. A `Content-Security-Policy` of
`connect-src 'self' blob: data:` is set in `_headers` and injected into the built HTML.

The shell publishes one automation handle, `window.__canvas`, in non-production builds and
in the `demo` build (`pnpm --filter paged-canvas build:demo`); Playwright drives the editor
through it. In the same builds it backs `editor.*` and `demo.*` script globals, a
playground controller (`?script=<id>`) and an origin-checked `postMessage` bridge
(`?embed=script`). `paged.*` scripts run in the engine's interpreter in the worker, through
`client.executeScript` ([ADR 212](adr/212-one-automation-surface.md)). The workflow
`playground.yml` is triggered on every push to `main` to build and deploy the demo build.

## Build and test

`pnpm install`, then `pnpm --filter paged-canvas dev` for the Vite dev server,
`pnpm typecheck` (the canvas app) and `pnpm build` (`tsc -b && vite build` per app). All
browser tests are Playwright projects in `apps/canvas/playwright.config.ts`, run against
the dev server with one worker ([ADR 216](adr/216-test-tiers.md)).

- **`chromium`**: every spec under `tests/` except `journey/**` and `showcase/**`: the panel
  and behaviour specs in `tests/*.spec.ts`, the plugin-surface specs, the demo capture spec,
  and the operation suite in `tests/e2e/`, where each operation is wrapped in one invariant:
  the model changed, pixels changed only inside the declared region, undo restores both
  ([ADR 214](adr/214-operation-sandwich.md), [`reference/testing.md`](reference/testing.md)).
  `tests/e2e/harness/capabilities.ts` is a checked-in, measured table of engine operations
  ([ADR 215](adr/215-measured-capability-table.md)).
- **`journeys`**: 80 `*.journey.spec.ts` files in `tests/journey/`, 44 of them under
  `plugins/`: real pointer and keyboard input, then an assertion on the editing context.
- **`journeys-gpu`**, **`showcase`**, **`demo-capture`**: run in real Chrome for a WebGPU
  adapter. The showcase builds one large reference document through the editor
  ([ADR 217](adr/217-showcase-reference-document.md)); `showcase-nightly.yml` runs it on macOS.
- **Fidelity** (`tests/fidelity.spec.ts`): page renders against reference PDFs from a
  fixture corpus that is not part of this repository; CI drops it.

`.github/workflows/tests.yml` runs on pushes to `main` and on path-filtered pull requests.
Its `checks` job runs the lint, the boundary self-test and nine script guards from
`scripts/`. Its `playwright` job typechecks the app and the test tree, then runs `chromium`
and `journeys` on Linux in three shards; fixtures need a `core` checkout and the corpus.
