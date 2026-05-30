# paged-media/editor

The commercial editor for **paged** — a pixel-faithful Adobe IDML
renderer. This is the closed, proprietary frontend that sits on top of
the open render engine (`paged-media/core`): a React canvas editor, an
SDK client that binds the engine wasm, and the panel/shell machinery
that turns the engine into an editable InDesign-class application.

> **Proprietary — All Rights Reserved. © And The Next GmbH.**
> Private repository. Not open source. No MPL headers live here
> (those belong to `paged-media/core`, the dual-licensed engine).

## What this is

`paged-media/core` is the engine: the Rust render pipeline (IDML parse
→ scene → text layout → compose → GPU/CPU raster), dual-licensed
MPL-2.0 OR PMEL, publishing the `@paged-media/*` SDK + wasm packages.

This repo is everything **above** that boundary — where the product
and the revenue live. It consumes the engine strictly as a published
dependency (wasm + SDK packages), **never** as a Rust path dependency,
and never reaches into the engine's source tree.

## Architecture

A **pnpm workspace** (`pnpm-workspace.yaml` → `apps/*`, `packages/*`),
TypeScript + React 18 + Vite, Tailwind for styling.

### Apps

| App | Package name | Role |
|---|---|---|
| `apps/canvas` | `paged-canvas` | The editor application. React shell driving a Web Worker that runs the engine wasm (Vello/WebGPU, tiny-skia CPU fallback) on an `OffscreenCanvas`. Owns the panel catalog wiring, REPL, script editor, and the Playwright fidelity suite. |
| `apps/devtools` | `paged-devtools` | A Chrome-DevTools-style scene-graph inspector (Tree / Properties / Render panes) over `paged-introspect-wasm`. Standalone dev tool, separate wasm bundle. |

### Packages (`@paged-media/*`)

| Package | Role | Depends on |
|---|---|---|
| `packages/client` (`@paged-media/client`) | Framework-agnostic SDK client. Owns the wasm protocol boundary: `CanvasClient` (main-thread worker handle), the tsify-generated wire types (`protocol.ts`), and the `SharedArrayBuffer` primitives (`sab/camera`, `sab/gesture`). **No React, no DOM beyond Worker + SAB.** | — (vendors engine wasm) |
| `packages/catalog` (`@paged-media/catalog`) | Declarative command/panel catalog: the curated registry of bindings + composition nodes that panels are described against. | `@paged-media/client` |
| `packages/shell` (`@paged-media/shell`) | The editor shell: React state contexts, registries (command/menu/panel/tool/overlay/keybinding), the dockview docking substrate, overlays (selection chrome, handles, snap lines, path edit), command palette, and the `PagedShell` root. | `@paged-media/client`, `@paged-media/catalog`, `@paged-media/ui` |
| `packages/ui` (`@paged-media/ui`) | UI kit — input primitives (`BoundsInput`, `ColorPicker`, `LengthInput`, `NumberInput`, `ScrubField`, units). | `@paged-media/shell` |

Dependency picture (consumer → producer):

```
apps/canvas ──► @paged-media/shell ──► @paged-media/catalog ──► @paged-media/client ──► [engine wasm]
            ├─► @paged-media/ui ──────► @paged-media/shell        ▲
            ├─► @paged-media/catalog ───────────────────────────┘
            └─► @paged-media/client
```

`@paged-media/client` is the single chokepoint to the engine. Nothing
else imports wasm.

### Engine boundary

`packages/client` is the only thing that touches the engine, and it
touches it **across a package boundary**:

- The build script (`apps/canvas/build-wasm.sh`) compiles
  `paged-canvas-wasm` from a core checkout and emits the bundle into
  `packages/client/src/wasm/`.
- Only the tsify-generated `paged_canvas_wasm.d.ts` is **tracked**
  (vendored so PR diffs show wire-format / protocol changes). The
  `.wasm` binary and `.js` loader are **gitignored build output**.
- The wire-format contract is pinned by `PROTOCOL_VERSION` on both
  sides; the worker reconciles the Rust-owned SAB layout against the
  TS mirrors at startup and warns on drift.

The scripting layer is the engine's `paged-script` crate, exposed in
the browser as a global `paged.*` object (`paged.set`, `paged.frame`,
`paged.inspect`, …). Scripts run inside the worker's embedded Boa
engine; every write lands as a `Mutation` on the same Operation
channel as gestures and panels, so `Cmd-Z` undoes script edits. The
canvas script-editor panel and Playwright tests exercise it
end-to-end.

## Dev setup

```bash
pnpm install            # workspace deps resolve via symlinks (see .npmrc)
```

### wasm prerequisite (read this before `pnpm dev`)

A fresh clone has the tracked `.d.ts` but **not** the gitignored
`.wasm`/`.js` — so the editor **cannot build or run until the engine
wasm is present** in `packages/client/src/wasm/`. Two paths:

**Today (local dev, before npm publish):** build the wasm from a
`paged-media/core` checkout. From this repo's root (with `core`'s
Rust workspace reachable):

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version <pinned>   # matches core's Cargo.lock; build script prints it
# optional: brew install binaryen   (wasm-opt size pass)

pnpm --filter paged-canvas wasm     # runs apps/canvas/build-wasm.sh → packages/client/src/wasm/
```

This produces `paged_canvas_wasm.{js,d.ts}` + `paged_canvas_wasm_bg.wasm`.
(`apps/devtools` has its own `build-wasm.sh` for `paged-introspect-wasm`.)

**After core publishes (target end state, decision B):** once
`paged-media/core` publishes `@paged-media/canvas-wasm` (and
`@paged-media/introspect-wasm`) to npm, `packages/client` is pointed
at the published package and the build-from-core step disappears —
`pnpm install` alone is sufficient. **This is not yet wired**; until
then, local dev requires the core-checkout wasm build above.

### Run

```bash
pnpm --filter paged-canvas dev      # Vite dev server, http://localhost:5173/
```

The Vite dev server sets the COOP/COEP headers required by
`SharedArrayBuffer` (the camera/gesture SABs). The same headers must
be set in any production deployment.

### Build / typecheck

```bash
pnpm typecheck      # tsc across apps/*
pnpm build          # vite build across apps/*
```

## Tests

`apps/canvas` carries the Playwright suite — panel-behaviour specs
plus an end-to-end **fidelity** suite that drives the editor in a real
browser and diffs per-page PNG output (ΔE2000 / SSIM) against
InDesign-exported reference PDFs from the corpus.

```bash
cd apps/canvas
pnpm wasm                       # ensure the wasm bundle is built first
pnpm test:fidelity              # full gate
pnpm test:fidelity:capture      # record metrics + thresholds
pnpm test:fidelity:ui           # interactive Playwright UI
BACKEND=gpu pnpm test:fidelity  # WebGPU/Vello path (headed; CPU fallback if no adapter)
```

Playwright spawns (or reuses) the Vite dev server; it does **not**
rebuild the wasm — build it out of band with `pnpm wasm` first.
See `apps/canvas/tests/README.md` for the fidelity harness details and
`apps/canvas/README.md` for the canvas app architecture.

## License

Proprietary. All rights reserved. © And The Next GmbH. Internal use
only; do not redistribute.
