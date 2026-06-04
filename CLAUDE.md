# CLAUDE.md

Orientation for Claude sessions in **paged-media/editor** — the closed
commercial frontend for the `paged` IDML engine. Terse by design;
read the root `README.md` for the longer picture and
`apps/canvas/README.md` for canvas-app internals.

## What this is

Private, **proprietary / All-Rights-Reserved (And The Next GmbH)**.
The engine (`paged-media/core`) is the open, dual-licensed Rust render
pipeline; this repo is the closed editor on top of it.

- **No MPL headers here.** MPL-2.0-OR-PMEL is core-only. New files in
  this repo get no license header.
- This repo consumes the engine **across a package boundary** — the
  published `@paged-media` wasm/SDK packages — **never** a Rust path
  dependency, and never reaches into core's source tree.

## Workspace layout (pnpm)

`pnpm-workspace.yaml` → `apps/*` + `packages/*`. React 18 + Vite + TS +
Tailwind.

- `apps/canvas` (`paged-canvas`) — the editor app. React shell →
  Web Worker → engine wasm on `OffscreenCanvas` (Vello/WebGPU, tiny-skia
  CPU fallback). Owns `src/panels/*`, the REPL (`src/repl/`), the
  script editor, and the Playwright suite (`tests/`).
- `apps/devtools` (`paged-devtools`) — standalone scene-graph
  inspector over `paged-introspect-wasm` (its own `build-wasm.sh`).
- `packages/client` (`@paged-media/client`) — **the only wasm/engine
  boundary.** `CanvasClient`, tsify wire types (`protocol.ts`), SAB
  primitives (`sab/camera`, `sab/gesture`). No React, no DOM beyond
  Worker + SAB.
- `packages/catalog` (`@paged-media/catalog`) — declarative
  command/panel catalog (bindings + composition nodes). Deps: client.
- `packages/shell` (`@paged-media/shell`) — editor shell: state
  contexts, registries, dockview docking substrate, overlays, command
  palette, `PagedShell`. Deps: client + catalog + ui.
- `packages/ui` (`@paged-media/ui`) — input primitives. Deps: shell.

Consumer→producer: `canvas → shell → catalog → client → [wasm]`;
`ui → shell`.

## Hard rules

### Workers must DEEP-IMPORT primitives — never the shell barrel

A web worker that imports through the `@paged-media/shell` barrel
**hangs at startup**: the barrel pulls in React, which a worker has no
business loading. This was a real bug. In worker code, import SAB /
protocol / primitive symbols directly from `@paged-media/client` (its
barrel is React-free by lint), or deep-import the specific module —
**never** route worker imports through `@paged-media/shell`.

### wasm / SDK boundary + build prerequisite

`packages/client` owns the wasm. Only the tsify
`paged_canvas_wasm.d.ts` is tracked (vendored so PR diffs show
protocol changes); the `.wasm` binary + `.js` loader are gitignored
build output.

- A fresh clone **cannot build/run** until the wasm exists in
  `packages/client/src/wasm/`.
- **Today:** build it from a `paged-media/core` checkout —
  `pnpm --filter paged-canvas wasm` (runs `apps/canvas/build-wasm.sh`,
  needs `rustup` wasm32 target + `wasm-bindgen-cli` matching core's
  `Cargo.lock`).
- **End state (decision B):** once core publishes
  `@paged-media/canvas-wasm` (+ `@paged-media/introspect-wasm`) to npm
  and `packages/client` is repointed at it, `pnpm install` suffices.
  **Not yet wired** — until then, local dev needs the core-checkout
  build.
- `PROTOCOL_VERSION` + the SAB layout are reconciled Rust↔TS at worker
  startup; drift fires a `protocolMismatch` warning. Don't paper over
  it — regenerate the `.d.ts` and bump the version in the same change.

### `paged.*` scripting global

The engine's `paged-script` crate registers a global `paged.*`
(`paged.set`, `paged.frame`, `paged.inspect`, …), evaluated inside the
worker's embedded **Boa** engine. Every script write lands as a
`Mutation` on the same Operation channel as gestures and panels, so
edits are undoable. The script-editor panel
(`apps/canvas/src/panels/script-editor.tsx`) and
`tests/script-editor.spec.ts` drive it end-to-end.

## Tests

Playwright lives in `apps/canvas/tests/`: per-panel behaviour specs +
an end-to-end **fidelity** suite (per-page PNG diff, ΔE2000/SSIM,
against InDesign reference PDFs).

```bash
cd apps/canvas
pnpm wasm                       # build the wasm first — Playwright won't
pnpm test:fidelity              # full gate
BACKEND=gpu pnpm test:fidelity  # WebGPU/Vello path (headed; CPU fallback)
```

The Vite dev server (spawned/reused by Playwright) sets the COOP/COEP
headers `SharedArrayBuffer` needs.

## Design system (the publishing cockpit)

The visual + UX source of truth is the **`paged-media/brand`** repo
(`~/paged/brand/editor` locally): tokens (`colors_and_type.css`),
content rules (sentence case, mono tabular values, **no emoji**),
the clean-room icon system, and the cockpit UI kit
(`ui_kits/editor/`). In this repo:

- **Tokens** live in `packages/shell/src/styles/theme.css` — the
  `--paged-*` shadcn channels plus resolved layers (`--chrome-*`,
  `--status-*`, `--overlay-*`, `--pg-*`, rhythm/motion). Never
  hardcode hexes in chrome/panels; swatch/ink CONTENT colours stay
  literal by design. **Dark is the default theme** (ThemeProvider,
  `paged.theme`); dockview bridges via `dockview-theme-paged`.
- **SVG overlays** author `stroke="var(--overlay-*)"` attributes;
  presentation attributes can't resolve `var()`, so globals.css
  re-applies each token through attribute-selector rules
  (`overlay-tokens.spec.ts` guards this). Selection = magenta,
  guides = violet — the DTP cues.
- **Fonts**: IBM Plex Sans/Mono self-hosted via fontsource;
  Cormorant only for the `paged.` wordmark (`.pg-wordmark`).
- **Icons**: three registries (`tool-`/`panel-`/`ui-*`) in
  `packages/shell/src/icons/` — 24×24 line SVG, currentColor,
  1.5–1.9 stroke. Author new glyphs to those rules; never emoji or
  third-party sets.
- **Workflow modes**: six cockpit modes registered through
  `registries/mode.ts` (apps declare `toolbarLeft` + `panelSet`;
  the shell renders ModeSwitcher/ContextToolbar/PanelRail and
  parks per-mode layouts under `paged.layout.mode.<id>`). New
  product surfaces without engine support ship as VISIBLE stubs
  (`ComingSoon` in `components/cockpit/kit.tsx`), never
  fake-interactive.

## Conventions

- **Don't loosen fidelity thresholds to hide a regression.** Thresholds
  (`corpus/envato/canvas-fidelity-thresholds.json`) are sized to
  measurements + headroom. Fix the regression; tighten after, never
  before.
- **Format only files you touched** — repo-wide `prettier`/`fmt` drifts
  unrelated files.
- **Comments earn their place** — narrate the WHY for a non-obvious
  IDML/wasm/SAB constraint or a worked-around upstream bug; otherwise
  let the code speak.
