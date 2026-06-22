/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// Concept 1 (Phase 2) — the Rectangle tool's gesture handler, with
// gridify (W2.7).
//
// Proves the Tool→Operation map end-to-end: a drag on the canvas
// shows a live rubber-band (published through
// `paged.overlaySignals.setToolPreview`, drawn by the tool-preview
// overlay contribution) and emits a single `insertFrame` Mutation on
// pointer-up (invariant 9 — the handler mutates ONLY through
// `paged.client.mutate`, never the model). Both corners are resolved
// against the START page so the frame is correct even if the pointer
// is released over another page or the pasteboard.
//
// Gridify (gestures.md DR-05/DR-06/DR-07): while the drag is ACTIVE,
// the arrow keys split the pending frame into an N×M grid —
// Right/Left = ±columns, Up/Down = ±rows, each clamped to ≥ 1. The
// preview shows the cells inset by the standard gutter
// (GRIDIFY_GUTTER_PT); pointer-up commits ALL cells as ONE `batch`
// Mutation, so the whole grid is a single undo step (DR-05 / INV-1).
// Keys back to 1×1 commit a single plain frame, no residual grid
// metadata (DR-07). Shift constrains each cell toward a square via the
// shared `drawBoundsFor` (the bounds is squared; the cells inherit it —
// DR-06). Arrow keys with no active drag do nothing here, so cursor
// nav is unaffected.
//
// Lifecycle: `onDeactivate("suspend")` (a spring-load — hold Space for
// a momentary Hand) KEEPS the in-flight gesture so it resumes on
// release; `"switch"` cancels it. Escape cancels mid-drag (zero
// mutation).

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import type { Mutation } from "@paged-media/client";

import {
  drawBoundsFor,
  gridCellsFor,
  mutateAndSelect,
  GRIDIFY_GUTTER_PT,
  CLICK_DRAG_THRESHOLD_PX,
  type Bounds,
} from "./shared";

const MIN_SIZE_PT = 1;

export function createRectangleHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let startPageId: string | null = null;
  // Page origin in document pt = docPoint − pagePoint at pointer-down.
  let startPageOrigin: [number, number] | null = null;
  let startLocal: [number, number] | null = null;
  // The last sample's local end + modifiers, so an arrow key (which
  // carries no pointer position) can repaint the grid at the current
  // drag size (INV-5 — the grid is a pure function of the live bounds).
  let lastEnd: [number, number] | null = null;
  let lastMods = { shift: false, alt: false };
  let dragging = false;
  // Gridify grid dimensions, reset to 1×1 on each pointer-down.
  let cols = 1;
  let rows = 1;

  const clearPreview = () => {
    paged?.overlaySignals.setToolPreview(null);
  };

  const reset = () => {
    startPageId = null;
    startPageOrigin = null;
    startLocal = null;
    lastEnd = null;
    lastMods = { shift: false, alt: false };
    dragging = false;
    cols = 1;
    rows = 1;
  };

  const cancel = () => {
    clearPreview();
    reset();
  };

  /** End corner in the START page's local coordinates. */
  const endLocalFor = (e: CanvasPointerEvent): [number, number] => [
    e.docPoint[0] - startPageOrigin![0],
    e.docPoint[1] - startPageOrigin![1],
  ];

  /** Bounds for the current sample, modifier-resolved (Shift → square,
   *  Alt → from centre) — the same rule the Ellipse/Polygon tools use. */
  const boundsFor = (end: [number, number]): Bounds =>
    drawBoundsFor(startLocal!, end, lastMods);

  /** Repaint from the last known end + grid dims: a single rect at 1×1,
   *  or the N×M cell grid otherwise. */
  const repaint = () => {
    if (!paged || !startPageId || !lastEnd) return;
    const bounds = boundsFor(lastEnd);
    if (cols === 1 && rows === 1) {
      paged.overlaySignals.setToolPreview({ pageId: startPageId, rect: bounds });
      return;
    }
    paged.overlaySignals.setToolPreview({
      pageId: startPageId,
      cells: gridCellsFor(bounds, cols, rows, GRIDIFY_GUTTER_PT),
    });
  };

  return {
    onActivate(p) {
      paged = p;
    },
    onDeactivate(reason) {
      // Spring-load suspend keeps the in-flight gesture (and its
      // preview) so it resumes when the override is released (AC 5).
      if (reason === "suspend") return;
      cancel();
    },
    onPointerDown(e: CanvasPointerEvent) {
      if (e.button !== 0 || !e.pageId || !e.pagePoint) {
        cancel();
        return;
      }
      startPageId = e.pageId;
      startPageOrigin = [
        e.docPoint[0] - e.pagePoint[0],
        e.docPoint[1] - e.pagePoint[1],
      ];
      startLocal = e.pagePoint;
      lastEnd = e.pagePoint;
      lastMods = { shift: e.modifiers.shift, alt: e.modifiers.alt };
      dragging = false;
      cols = 1;
      rows = 1;
    },
    onPointerMove(e: CanvasPointerEvent) {
      if (!paged || !startPageId || !startPageOrigin || !startLocal) return;
      lastEnd = endLocalFor(e);
      lastMods = { shift: e.modifiers.shift, alt: e.modifiers.alt };
      if (e.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
      dragging = true;
      repaint();
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!paged || !startPageId || !startPageOrigin || !startLocal) {
        cancel();
        return;
      }
      const bounds = boundsFor(endLocalFor(e));
      const pageId = startPageId;
      const gridCols = cols;
      const gridRows = rows;
      cancel();
      const [top, left, bottom, right] = bounds;
      // A click (no real drag) creates nothing — InDesign opens an
      // options dialog there; that's a follow-up.
      if (bottom - top < MIN_SIZE_PT || right - left < MIN_SIZE_PT) return;
      const cells = gridCellsFor(bounds, gridCols, gridRows, GRIDIFY_GUTTER_PT);
      // 1×1 → a single insertFrame (DR-07 — no residual grid). Engine op
      // landed with protocol v24; the reply's `createdId` selects the
      // fresh frame (shared post-insert flow).
      if (cells.length === 1) {
        mutateAndSelect(
          paged,
          { op: "insertFrame", args: { pageId, bounds: cells[0] } },
          "insertFrame",
        );
        return;
      }
      // N×M → ALL cells in ONE `batch` so the grid is a single undo step
      // (DR-05 / INV-1). batch is capability-verified supported on the
      // wire (Mutation union).
      const ops: Mutation[] = cells
        .filter(([t, l, b, r]) => b - t >= MIN_SIZE_PT && r - l >= MIN_SIZE_PT)
        .map((cell) => ({ op: "insertFrame", args: { pageId, bounds: cell } }));
      if (ops.length === 0) return;
      mutateAndSelect(
        paged,
        { op: "batch", args: { ops } },
        "insertFrame (gridify)",
      );
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        cancel();
        return;
      }
      // Arrow keys gridify ONLY while a drag is active — otherwise they
      // fall through to cursor nav untouched (DR-05 acceptance: arrows
      // with no active drag do nothing here).
      if (!dragging || !startPageId || !lastEnd) return;
      switch (e.key) {
        case "ArrowRight":
          cols += 1;
          break;
        case "ArrowLeft":
          cols = Math.max(1, cols - 1);
          break;
        case "ArrowUp":
          rows += 1;
          break;
        case "ArrowDown":
          rows = Math.max(1, rows - 1);
          break;
        default:
          return;
      }
      // Consume the key so the active gesture owns it (the page doesn't
      // scroll / the selection doesn't nudge while we gridify).
      e.preventDefault();
      repaint();
    },
  };
}
