# ADR 224 — The paged.media films are recorded by the editor's own test runner

- **Status:** Accepted 2026-10-12.
- **Scope:** `apps/canvas/tests/films/` (the `films` Playwright project), `apps/canvas/playwright.config.ts`,
  the `data-viewport-hud` marker in `src/ui/ViewportCanvas.tsx`; the demo layer's fixes in
  `packages/shell/src/demo/` and the live scripts in `public/scripts/*-live.js`.

## Context

paged.media shows narrated films of the editor and embeds the playground as a live demo. A
film must show the product as it is: the real editor, the real renderer, real input. Screen
recordings made by hand drift from the product, cannot be re-taken when the product changes,
and cannot prove that what they show worked.

## Decision

**A film is a Playwright spec.** The `films` project (`tests/films/**/*.film.ts`, never in CI)
runs real Chrome headless with WebGPU at 1600×900, device scale 2. `film(slug, body)` reads a
plan written by the website's media package (how long each scene's voiced line runs) and
records a take against it:

- **Capture.** The page's own compositor frames over CDP (`Page.startScreencast`, 3200×1800),
  each with its arrival time; the website composes them at a constant frame rate. The
  WebGPU canvas is in the frames.
- **Input.** The pointer moves like a hand (minimum-jerk paths, Fitts timing) and is logged,
  because the compositor draws the cursor; typing has a human rhythm. Shortcuts shown on
  screen go through `k.key`, which first takes focus off any field.
- **Scenes.** `k.scene(id, actions)` lasts at least as long as its line; `k.cut` marks a wait
  the edit removes ("6 s skipped"); `k.focus(pageRect)` aims a punch-in in page points through
  a camera mark logged at the roll; `k.chip` shows a file the picture cannot.
- **Proof.** Every step a film narrates is asserted against the engine, and the take records
  the editor commit and whether WebGPU was active. A step that does not work fails the take,
  so a film cannot show what the product does not do.
- **Stage.** Dev-only chrome (the frame-time readout, the corpus picker, Vite's overlay) is
  hidden before first paint. Nothing a user of the released editor sees is hidden.

**Live scripts run hands-free.** `public/scripts/*-live.js` narrate with `autoMs` and must run
from top to bottom with no click; `tests/live-scripts.spec.ts` runs each one in the
playground and fails on any error. The playground chip carries the run status.

## Consequences

- Making the first films found and fixed three defects in the demo layer: the statement
  splitter dropped the first statement of any script with a header comment; scripts read a
  stale copy of `window.__canvas`, so `editor.pageIds()` stayed empty after `paged.file.new`;
  and `editor.select` with a bad id took the whole UI into the error boundary.
- It also found two shape-builder defects that the films did not show: an oval was merged by its
  bounding box, and a cross-shaped overlap lost regions. Both were fixed in engine 0.71.8 and
  paged.draw canary.19 (2026-10-13), and the draw film was re-shot on two overlapping ellipses.
  The sheet film likewise left out placing the workbook's chart until its placement was fixed
  (paged.sheet canary.20); it now places it.
- Films are re-taken whenever the product changes what they show; a take recorded from an
  editor with uncommitted changes says so in its disclosure.
