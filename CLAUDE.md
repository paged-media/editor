# CLAUDE.md

Orientation for Claude sessions in **paged-media/editor** — the closed
commercial frontend for the `paged` IDML engine. Terse by design;
read the root `README.md` for the longer picture and
`apps/canvas/README.md` for canvas-app internals.

## What this is

Public, **dual-licensed AGPL-3.0 OR PMEL** (And The Next GmbH). The editor
is a networked app, so the open side is **AGPL** (§13 network copyleft);
the engine (`paged-media/core`) stays **MPL-2.0 OR PMEL** — more permissive,
for embedding. (This repo was proprietary / All-Rights-Reserved and private
until 2026-06-22, when it was opened.)

- **License headers apply to every source file** (AGPL Exhibit-style notice
  + PMEL, pointing at LICENSE.md). New source files carry it — copy it
  verbatim from the top of any existing source file, or see `CONTRIBUTING.md`.
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

### wasm / SDK boundary (Decision B — LIVE since v0.33.0)

The engine arrives as **published npm packages**: `packages/client`
depends on `@paged-media/canvas-wasm`, `apps/devtools` on
`@paged-media/introspect-wasm` (apps/canvas also direct-depends on
canvas-wasm — the worker DEEP-IMPORTS it). `pnpm install` suffices;
there is no build-from-core step and no vendored `.d.ts` (types come
from the package).

- **Version convention**: package `0.<protocol>.<patch>` — the minor
  IS the wire protocol. `scripts/check-protocol-version.sh` (CI:
  protocol-version.yml) asserts `protocol.ts PROTOCOL_VERSION ==`
  installed package minor; the worker handshake still catches runtime
  drift (`protocolMismatch`).
- **Engine bumps**: core tags `v0.<protocol>.<patch>` → its
  publish-wasm workflow ships the packages → bump the three pins +
  `PROTOCOL_VERSION` here in one change.
- **Local dev against UNPUBLISHED core changes**: build the package
  dirs locally (`~/paged/sync-wasm.sh` — rewritten as the local
  override tool) and point the deps at them via `file:` overrides;
  never commit the override.
- The wasm asset loads in vite via explicit `?url` imports passed to
  the loader's `default({ module_or_path })` — don't revert to the
  bare loader default (it resolves relative to node_modules and
  breaks worker chunks).

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
