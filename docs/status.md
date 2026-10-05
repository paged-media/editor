# Status

What the editor ships and what it does not, read from the code at commit `6d098eb`
(engine `@paged-media/canvas-wasm` 0.66.0, protocol 66). How the parts fit is in
[`architecture.md`](architecture.md). Panel-by-panel detail is in
[`reference/panels.md`](reference/panels.md), which is a dated snapshot.

## Shipped

- **Documents.** Open (`.idml`, `.paged`, and any file type a loaded plugin's importer
  claims) from the "Open…" command or by drag and drop; New document; Save as a `.paged`
  container (Cmd/Ctrl+S), to a stored file handle when there is one and otherwise as a
  download; "Save As IDML…"; "Open PDF…" through the PDF plugin's importer.
- **Export.** PDF through the export dialog, with progress and cancel; page images as PNG;
  every exporter a plugin registers, listed in the Outputs panel. Swatch libraries can be
  imported and exported as `.ase`.
- **Canvas.** Rendering in a worker, on WebGPU with a CPU fallback. Pan and zoom; click and
  marquee selection; move, resize, scale and rotate gestures with snap guides; frame content
  transforms; path-edit mode, where anchors, handles and segments drag, several anchors
  select by marquee, arrows nudge them and Delete removes them, each edit one undo step;
  text editing with caret and range selection.
- **Tools.** 28 built-in tools (`packages/tools/src/built-in-tools.ts`): 19 with a gesture
  handler (page, type, line, pen, pencil, smooth, frame and shape tools, scissors, rotate,
  scale, shear, two gradient tools, eyedropper); Selection, Direct Selection, Hand and Zoom;
  and five marked `planned`. Direct Selection is the Selection tool's pointer path plus path-edit
  mode, kept on while the tool is in hand (`packages/shell/src/state/selection-context.tsx:52-57`);
  its behaviour, and the Pen's, are paged.draw's `DirectSelectMachine` and `PenMachine`
  (`@paged-media/draw/machines`), so the Pen also continues, closes and joins open paths.
- **Commands.** A command palette, menus and keybindings over one registry. Insert commands
  for text frame, rectangle, ellipse, line, table, page and placed image; arrange, group
  and ungroup; undo and redo.
- **Panels.** 73 registered panels across six workflow modes (design, content, prepress,
  data, review, export), among them properties, character and paragraph, styles, swatches
  and colour, layers, pages, links, preflight, separations and the Export Center.
- **Plugins.** Eight first-party bundles are activated at start: draw, web, data, sheet,
  image, publish, pdf, doc. Their panels, tools, commands, importers, exporters and edit
  contexts appear in the same chrome.
- **Solo mode.** `?solo=<name>` for six profiles: `paged.draw`, `paged.image`,
  `paged.sheet`, `paged.doc`, `paged.web`, `paged.data`.
- **Scripting.** A script editor panel runs `paged.*` scripts in the engine's interpreter;
  a REPL panel parses one-line commands (`set`, `insert`, `remove`, `move`, `undo`, `redo`,
  `inspect`) into mutations. An Actions panel records and replays command invocations.
- **Diagnostics.** A Problems panel (plugin diagnostics, failed saves, missing default
  font) and a Journal panel over a local event log that can be exported as a file.
- **Playground build.** `build:demo` keeps the automation handle, a script playground and
  an iframe bridge for running `paged.*` source from an embedding page.

## Limits of what is shipped

- **Browser.** The application needs cross-origin isolation, `SharedArrayBuffer`,
  `OffscreenCanvas` and a module worker. Save-to-file needs the File System Access API;
  without it every save is a download.
- **CPU fallback.** Without WebGPU the live canvas draws each page from one PNG tile, 256 px
  wide by default (`apps/canvas/src/worker/render.ts:93`).
- **Page layout.** Pages are stacked vertically; the pages of a spread are not placed side
  by side (`apps/canvas/src/ui/layout.ts`).
- **Open.** The native file picker lists `.paged` and `.idml`. The extensions of plugin
  importers are added only to the `<input type="file">` fallback
  (`packages/shell/src/PagedShell.tsx:763-771` and `:832-838`). Two importers may claim one
  extension; the first registered wins.
- **Save.** There is no autosave and no recent-files list. Save writes the `.paged` bytes
  to the file handle stored by the "Open…" command's native picker and downloads when none
  is stored. That picker code is the only place the handle is set or cleared
  (`packages/shell/src/PagedShell.tsx:774-844`).
- **Default font.** The fallback face is fetched from `/fonts/Inter.ttf`. The dev server
  serves that path from a fixture directory outside this repository;
  `apps/canvas/public/` contains no font.
- **Seams.** Five tools, three export targets (web bundle, social crops, print package),
  the collaboration cluster in the header and several panels (comments, component library,
  review inspector, the data-suite preview, object export, export tagging) are rendered
  disabled or as placeholders.
- **Multi-selection edits.** A property edit through a catalogue-bound panel on several
  selected elements sends one mutation per element, so it is one undo step per element
  (`packages/shell/src/catalog/binding-hook.ts:546-549`).
- **Plugins.** `@paged-media/doc` resolves through a `link:` override to a sibling checkout,
  not from the registry. Solo mode skips the other bundles' activation, not their modules.
- **Packages.** No workflow here publishes `@paged-media/client`; `@paged-media/tools` is private.
- **Tests.** The two gating Playwright projects run on Linux without a GPU. The GPU
  journeys, the fidelity suite and the journey screenshot comparisons (all 24 baselines are
  macOS) do not gate. No workflow runs `pnpm test:journal` or builds `apps/devtools`.
- **Stale documents.** The root, `apps/canvas` and `apps/devtools` READMEs describe a
  `build-wasm.sh` step that does not exist.

## Not built

- A server, accounts, sharing or real-time collaboration ([ADR 211](adr/211-no-backend.md)).
- Loading a plugin at run time, and any isolation between a bundle and the application
  ([plugin-sdk ADR 319](https://github.com/paged-media/plugin-sdk/blob/main/docs/adr/319-trust-line.md)).
- A unit-test runner for the application: apart from three Node scripts under `scripts/`,
  every test is a Playwright spec.
- A use for the worker-based bundle loader in `packages/shell/src/bundles/`: it is exported
  from the shell, and nothing in `apps/` imports it.
- A policy for two plugins that claim the same file extension.
- A gating CI lane for the GPU path: the GPU journey step in `tests.yml` is manual and advisory.
