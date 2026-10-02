# Documentation

What this folder holds.

- [`concept.md`](concept.md): why the editor exists, what it is for, and what it will never do.
- [`architecture.md`](architecture.md): how it is built. The packages and their layering,
  the worker and canvas path, the shell and its registries, how plugins are hosted, how
  documents are opened and saved, and how it is built and tested.
- [`status.md`](status.md): what ships today, the limits of what ships, and what is not built.
- [`adr/`](adr/README.md): the decision records of this repository, 002, 023, 024 and 200–217.
- [`design/client-sdk.md`](design/client-sdk.md): the concept paper for the editor's client
  layer (`packages/client`, `catalog`, `shell`): the split between a framework-agnostic
  client and a React shell, the contribution model, the catalogue and its bindings.
  Source comments cite it as `sdk.md`.
- [`design/toolbar.md`](design/toolbar.md): the concept paper for the tool rail: a tool as
  a contribution, the gesture-handler contract, the tool stack, flyout groups, cursors.
  Source comments cite it as "Concept 1".
- [`design/panel-catalog.md`](design/panel-catalog.md): the panel inventory of a full
  page-layout editor, and what that inventory demands of the binding vocabulary.
- [`reference/panels.md`](reference/panels.md): per panel, what it binds to and what its
  target state is, with the engine gaps that stand between the two. Its status marks are a
  snapshot of 2026-06-05.
- [`reference/testing.md`](reference/testing.md): the end-to-end operation suite under
  `apps/canvas/tests/e2e/`: the operation sandwich, the capability matrix, the domain
  suites, the corpus mode, and how to add a test for a new operation.
- [`reference/engine-findings.md`](reference/engine-findings.md): engine defects that the
  operation suite surfaced, each with symptom, cause and dated status.
- [`reference/gestures.md`](reference/gestures.md): the test plan for canvas gestures. It
  is the source of the test ids (`DR-05`, `INV-1`, `E2E-07`, …) that the gesture suites cite.

## Decisions in other repositories that bind this one

These records live in other public paged-media repositories. The code here rests on each of
them. The last column says what the decision means for the editor.

| ADR | Repository | Decision | What it means here |
|---|---|---|---|
| [005](https://github.com/paged-media/core/blob/main/docs/adr/005-wire-recipe.md) | core | The wire recipe: every operation self-describing and invertible | Every write is an engine `Mutation` sent through `CanvasClient.mutate`; the client has no method per mutation. Undo and redo are `client.undo()` and `client.redo()`, and the editor keeps no undo stack of its own. The operation suite asserts that undo restores model and pixels. |
| [006](https://github.com/paged-media/core/blob/main/docs/adr/006-protocol-coupled-versioning.md) | core | Protocol-coupled package versioning (`0.<protocol>.<patch>`) | `packages/client/src/protocol.ts` reads `PROTOCOL_VERSION` from the minor of the installed `@paged-media/canvas-wasm` version and throws on any other version shape. `@paged-media/client` carries the same minor. |
| [008](https://github.com/paged-media/core/blob/main/docs/adr/008-read-surfaces-first-class-wire-collections.md) | core | Read surfaces as first-class wire collections | Panels do not parse the document. They read typed collections with `useCollection` and `useDocumentMeta` (`packages/shell/src/catalog/use-collection.ts`) and refetch after every mutation, undo and redo. |
| [013](https://github.com/paged-media/core/blob/main/docs/adr/013-in-frame-scenelayer.md) | core | In-frame plugin rendering via `SceneLayer` | Plugin content inside a frame is drawn by the engine, not by the editor: `PagedEditor.sceneLayers` forwards a plugin's layer to `client.submitSceneLayer` (`packages/shell/src/state/paged-editor.tsx`). |
| [019](https://github.com/paged-media/core/blob/main/docs/adr/019-capability-catalog-one-contract.md) | core | Capability catalog: one generated contract, projected to every surface | `packages/client/api-catalog.json` is generated from the client's source and lists, as `wireKinds`, the engine message kinds this surface reaches; CI fails when it is stale. The showcase ledger reads the engine's property-path table from a `core` checkout. |
| [109](https://github.com/paged-media/core/blob/main/docs/adr/109-engine-does-no-io.md) | core | The engine does no I/O and ships no assets; the host registers fonts and profiles | The editor is that host. It fetches a default font and passes it with every load (`packages/shell/src/state/document-loader.ts`, `CanvasClientOptions.defaultFontProvider`), and registers colour profiles from the Colour Settings panel. |
| [113](https://github.com/paged-media/core/blob/main/docs/adr/113-one-typed-door.md) | core | One typed door drives every surface: wasm, CLI, session and scripts | The worker forwards envelopes to `CanvasWorker.handleMessage` (`apps/canvas/src/worker/worker.ts:545`); one kind, `requestMeasureText`, is answered by a dedicated engine method. A script is one more envelope, `executeScript`. |
| [114](https://github.com/paged-media/core/blob/main/docs/adr/114-interaction-lives-in-the-engine.md) | core | Interaction lives in the engine: hit testing, selection, gestures, snapping | The application finds the page under the pointer, classifies the event and calls `hitTest`, `beginGesture`, `commitGesture` or `caretNav`. Element hits, snapping and line metrics are engine answers; snap lines arrive as a message and an overlay draws them. |
| [115](https://github.com/paged-media/core/blob/main/docs/adr/115-worker-boundary-transports.md) | core | The worker boundary uses three transports | The host side of all three is split between `packages/client` (the JSON envelope with `seq`, the two 32-byte shared buffers in `src/sab/`, transferred bytes for document loads) and the worker script `apps/canvas/src/worker/worker.ts`, which makes the calls into the engine and checks its copy of the buffer layouts against the engine's at start-up. |
| [118](https://github.com/paged-media/core/blob/main/docs/adr/118-paged-file-is-a-valid-idml-package.md) | core | A `.paged` file is a ZIP that stays a valid IDML package | `.paged` needs no importer and no second load path: the same bytes go through `client.loadDocument`. Save is `client.exportPaged()`. |
| [010](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/010-raw-mutate-gate-capability-enforcement.md) | plugin-sdk | The raw-mutate gate and the in-process capability enforcement line | Capability checks on plugin calls are made by the plugin-sdk host that `loadBundle` builds. The editor's backends in `apps/canvas/src/plugin-*.ts` are written on that assumption; the headers of the consent, secret, clipboard and blob-store backends say the SDK door owns the capability gate. |
| [012](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/012-k1-modal-session-undo-coalescing.md) | plugin-sdk | Modal sessions: the seamless-undo coalescing boundary | While an edit context declares undo ownership, the undo and redo chords and the Edit menu call the context's `onUndo` and `onRedo` and leave the document history alone (`packages/shell/src/state/edit-context-controller.tsx`, `apps/canvas/src/main.tsx`). |
| [017](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/017-importer-exporter-door-shape.md) | plugin-sdk | Importer and exporter door shape: resolve by extension, load into the engine | The shell holds the two registries (`packages/shell/src/registries/document-io.ts`). "Open…" and drag and drop resolve an importer before the default load; the Outputs panel of the export mode lists the exporters (`apps/canvas/src/panels/cockpit/export-views.tsx`). |
| [301](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/301-host-adapter-lives-in-plugin-sdk.md) | plugin-sdk | The host adapter lives in plugin-sdk, not in the editor | The editor does not implement the plugin host. `apps/canvas/src/main.tsx` passes an editor handle and a set of backends to plugin-sdk's `loadBundle`. |
| [304](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/304-bundle-lifecycle.md) | plugin-sdk | Bundle lifecycle: one synchronous activate, structural teardown, guarded activation | One `loadBundle` call per bundle at start-up, and `dispose()` on each handle at unmount. The editor also wraps each call in its own guard (`apps/canvas/src/plugin-load-guard.ts`). |
| [308](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/308-plugin-wasm.md) | plugin-sdk | Plugin wasm is a declared capability, loaded by the bundle, under one app-wide size budget | The budget is enforced here: `scripts/wasm-budget.mjs` sums the distinct `.wasm` files under the application's `node_modules/@paged-media` and fails above 100 MB. |
| [310](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/310-one-write-door.md) | plugin-sdk | One write door: `document.mutate`, engine-owned history, failures as outcomes | Plugin writes and the editor's own writes reach the engine through the same `CanvasClient`, so they share one undo history. `mutate` does not throw on a refused mutation; the reply says so. |
| [312](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/312-panels-as-data.md) | plugin-sdk | Panels cross the boundary as data: a schema plus bindings, no expression language | The editor supplies the renderer: `SchemaPanelRenderer` in `packages/shell/src/catalog/` draws a plugin's schema with the same catalogue leaves as the editor's own panels. |
| [318](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/318-host-spawned-workers.md) | plugin-sdk | Workers are spawned by the host on a declared capability | `apps/canvas/src/plugin-worker.ts` resolves a declared module path from a table the editor ships. The table has one entry, the image plugin's decode worker. |
| [319](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/319-trust-line.md) | plugin-sdk | The trust line: first-party bundles run in-process today | The eight bundles are static imports and run in the application's realm on the main thread. The editor loads no other bundle. |
| [022](https://github.com/paged-media/plugin-publish/blob/main/docs/adr/022-idml-relocates-to-plugin-publish.md) | plugin-publish | IDML relocates to plugin-publish; the model self-owns natively | The editor provides the native-document door that an import or export plugin uses (`apps/canvas/src/plugin-native-document.ts`), and the export targets include no built-in IDML target (`apps/canvas/src/panels/cockpit/export-targets.ts`); IDML export in the export mode is the publish plugin's exporter. |
