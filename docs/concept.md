# Concept

Why this repository exists, what it is for, and what it will not do. Each paragraph names
its source file in a comment. Where `README.md` is older than the code (its "Engine
boundary" and "Dev setup" sections), the code is followed.

## Why it exists

The README describes paged as a pixel-faithful renderer of Adobe's IDML format. The engine
lives in another repository, `paged-media/core`: a Rust pipeline from IDML parse through
scene, text layout and composition to a GPU or CPU raster. This repository is everything
above that boundary: the React canvas editor, the client that binds the engine wasm, and
the panel and shell machinery that turn the engine into an editable application.
<!-- source: README.md:3-7, README.md:17-22 -->

## What it is for

- **An editing application in the browser.** `apps/canvas` is a React shell that drives a
  Web Worker; the worker runs the engine wasm on an `OffscreenCanvas`, on WebGPU with a
  CPU fallback.
- **A client for the engine.** `packages/client` holds `CanvasClient`, the main-thread
  handle on the worker, together with the generated wire types and the shared-memory
  primitives. It is framework-agnostic: no React, and no DOM beyond `Worker` and
  `SharedArrayBuffer`. Its own README calls it "the editor's own client, published":
  "There is no second engine here and no second vocabulary."
- **A shell that other things register into.** `packages/shell` owns the state contexts,
  the registries (commands, menus, panels, tools, overlays, keybindings), the overlays and
  the command palette. Six workflow modes are declared by the application and rendered by
  the shell.
- **A panel catalogue.** `packages/catalog` is the curated registry of bindings and
  composition nodes that declarative panels are described against.
- **A separate inspector.** `apps/devtools`, a standalone scene-graph inspector.
<!-- source: README.md:33-45, CLAUDE.md:28-43, CLAUDE.md:138-141, packages/client/README.md:3-10 -->

Scripting belongs to the engine and is reached from here. The engine registers a global
`paged.*` object that is evaluated inside the worker. Every write a script makes lands as a
`Mutation` on the same channel as gestures and panel edits, so undo covers script edits too.
<!-- source: README.md:74-80, CLAUDE.md:87-95 -->

Correctness is part of the purpose. `apps/canvas` carries a Playwright suite of panel
behaviour specs and a fidelity suite that drives the editor in a real browser and compares
page renders with InDesign-exported references.
<!-- source: README.md:135-138, CLAUDE.md:99-101, CONTRIBUTING.md:44-48 -->

## What it will never do

**Depend on the engine's source.** The application consumes the engine strictly as a published dependency,
the `@paged-media` wasm packages: never as a Rust path dependency, and never by reaching into the engine's
source tree. `pnpm install` is the whole engine setup; only the test lanes use a `core` checkout.
<!-- source: README.md:22-24, CLAUDE.md:19-21, CLAUDE.md:59-66, CONTRIBUTING.md:25-29, .github/workflows/tests.yml:298-349, apps/canvas/tests/showcase/chapter.ts:66-80 -->

**Describe the wire by hand.** Wire types are re-exported from the engine package, and the
header of `protocol.ts` forbids hand-written types in that file. The protocol number is
read from the installed package, and a wasm whose own protocol differs is refused.
<!-- source: packages/client/src/protocol.ts:22-40, CLAUDE.md:68-73 -->

**Load React in a worker.** Worker code imports from `@paged-media/client` or deep-imports a
module; it never imports through the shell's entry point, which pulls in React and hangs
the worker at start.
<!-- source: CLAUDE.md:50-57 -->

**Fake a feature.** A product surface without engine support ships as a visible stub; it
is never made to look interactive.
<!-- source: CLAUDE.md:141-144 -->

**Let a tool reach into the model.** A tool's handler may draw its in-progress gesture on
the overlay, but it changes the document only through `mutate` or the worker gesture calls:
"Imperative rendering; declarative mutation."
<!-- source: packages/shell/src/tools/gesture-handler.ts:28-32 -->

**Branch on which plugin answered.** A host panel that shows values provided by a plugin
may not look at the plugin's identity to decide what to do.
<!-- source: packages/shell/src/catalog/binding-providers.tsx:40-46 -->

**Send the journal anywhere.** The local event log is "KEPT, not SENT".
<!-- source: apps/canvas/src/journal-sink.ts:32 -->

**Loosen a threshold to hide a regression.** Fidelity thresholds are sized to measurements
plus headroom: fix the regression first, tighten afterwards.
<!-- source: CLAUDE.md:148-151, CONTRIBUTING.md:56-58 -->
