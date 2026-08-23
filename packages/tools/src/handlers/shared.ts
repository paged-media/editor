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

// Editor-ops — bookkeeping every drawing-tool handler repeats: the
// page-anchored drag (both endpoints resolved against the START page
// so the result is correct even when the pointer is released over
// another page or the pasteboard — the Rectangle handler's rule),
// post-mutate selection of the created element, and the quiet
// mutationFailed warning.

import type {
  CanvasPointerEvent,
  PagedEditor,
} from "@paged-media/shell";

export const CLICK_DRAG_THRESHOLD_PX = 4;

/** A drag anchored to the page under the pointer at pointer-down. */
export interface PageDrag {
  pageId: string;
  /** Page origin in document pt (docPoint − pagePoint at down). */
  pageOrigin: [number, number];
  /** Pointer-down position in page-local pt. */
  startLocal: [number, number];
}

export function beginPageDrag(e: CanvasPointerEvent): PageDrag | null {
  if (e.button !== 0 || !e.pageId || !e.pagePoint) return null;
  return {
    pageId: e.pageId,
    pageOrigin: [
      e.docPoint[0] - e.pagePoint[0],
      e.docPoint[1] - e.pagePoint[1],
    ],
    startLocal: e.pagePoint,
  };
}

/** Current pointer position in the START page's local coordinates. */
export function endLocalFor(
  drag: PageDrag,
  e: CanvasPointerEvent,
): [number, number] {
  return [e.docPoint[0] - drag.pageOrigin[0], e.docPoint[1] - drag.pageOrigin[1]];
}

/** `[top, left, bottom, right]` page-local bounds. */
export type Bounds = [number, number, number, number];

/**
 * Resolve a drag's bounds for the shape-drawing tools (Ellipse,
 * Polygon — the rubber-band rect of the Rectangle tool, modifier-aware).
 *
 * The base rule is the Rectangle handler's: bounds = normalized(start,
 * end) (DR-01 — a negative drag normalizes). Two modifiers layer on top,
 * each a pure function of the CURRENT sample (INV-5 — no latched state):
 *   - Shift → constrain to a square: the larger of |dx|,|dy| on both
 *     axes, the square anchored at the start corner (DR-02), the sign of
 *     each axis preserved so it grows toward the pointer.
 *   - Alt   → draw from centre: `start` is the centre, the half-extent
 *     mirrors to the opposite side (DR-03). Composes with Shift (the
 *     square is centred on `start`).
 */
export function drawBoundsFor(
  start: [number, number],
  end: [number, number],
  mods: { shift: boolean; alt: boolean },
): Bounds {
  let dx = end[0] - start[0];
  let dy = end[1] - start[1];
  if (mods.shift) {
    // Square: the max extent on both axes, each keeping its own sign so
    // the square tracks the drag quadrant.
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * m;
    dy = Math.sign(dy || 1) * m;
  }
  let left: number;
  let right: number;
  let top: number;
  let bottom: number;
  if (mods.alt) {
    // Centre = start; the extent mirrors to both sides.
    left = start[0] - Math.abs(dx);
    right = start[0] + Math.abs(dx);
    top = start[1] - Math.abs(dy);
    bottom = start[1] + Math.abs(dy);
  } else {
    left = Math.min(start[0], start[0] + dx);
    right = Math.max(start[0], start[0] + dx);
    top = Math.min(start[1], start[1] + dy);
    bottom = Math.max(start[1], start[1] + dy);
  }
  return [top, left, bottom, right];
}

/**
 * Standard inter-cell gutter for gridify (DR-05/DR-06), in pt. InDesign's
 * default column/row gutter is 1 pica = 12 pt; we use the same so a
 * gridified draw reads like a default InDesign multi-column layout. A
 * fixed constant (not zoom-scaled): the gutter is document geometry, the
 * gap baked into every committed cell, not screen chrome.
 */
export const GRIDIFY_GUTTER_PT = 12;

/**
 * Split a drag's `[top,left,bottom,right]` bounds into a `cols × rows`
 * grid of equal cells separated by `gutter` pt (DR-05). The outer
 * envelope stays fixed at `bounds`; the gutters eat into it, so each
 * cell is `(width − (cols−1)·gutter) / cols` wide and the analogous
 * height. Cells walk row-major (left→right, top→bottom) — the order the
 * batch commits and the preview draws them.
 *
 * A 1×1 grid returns the single bounds unchanged (DR-07: keys back to
 * 1×1 ⇒ one plain frame, no residual grid). When the gutters would
 * collapse a cell to ≤ 0 the gutter is dropped to 0 for that axis, so a
 * tight drag still yields touching cells rather than inverted bounds.
 */
export function gridCellsFor(
  bounds: Bounds,
  cols: number,
  rows: number,
  gutter: number,
): Bounds[] {
  const [top, left, bottom, right] = bounds;
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  if (c === 1 && r === 1) return [bounds];
  const totalW = right - left;
  const totalH = bottom - top;
  // Drop the gutter on an axis when it would leave no room for the cells
  // (a very tight drag); cells then touch instead of inverting.
  const gx = c > 1 && gutter * (c - 1) < totalW ? gutter : 0;
  const gy = r > 1 && gutter * (r - 1) < totalH ? gutter : 0;
  const cellW = (totalW - gx * (c - 1)) / c;
  const cellH = (totalH - gy * (r - 1)) / r;
  const cells: Bounds[] = [];
  for (let row = 0; row < r; row++) {
    const cellTop = top + row * (cellH + gy);
    for (let col = 0; col < c; col++) {
      const cellLeft = left + col * (cellW + gx);
      cells.push([cellTop, cellLeft, cellTop + cellH, cellLeft + cellW]);
    }
  }
  return cells;
}

/** The worker reply `mutate` resolves with (refusals RESOLVE as
 *  `mutationFailed` — they never reject). */
export type MutateReply = Awaited<
  ReturnType<PagedEditor["client"]["mutate"]>
>;

/**
 * Fire a mutation, warn on `mutationFailed`, and select the element
 * the engine reports as created (protocol v24's `createdId`) so the
 * fresh shape immediately carries selection chrome — the post-insert
 * flow InDesign users expect.
 *
 * Returns the worker reply (or `null` on a transport error) so a
 * caller that needs the outcome — the `paged.insert.*` command layer
 * reports refusals to the Problems panel rather than the console —
 * can inspect it; `onRefused` fires on `mutationFailed` for callers
 * that route the refusal to a user-visible channel. Both are additive:
 * the drawing-tool handlers ignore them.
 */
export function mutateAndSelect(
  paged: PagedEditor,
  mutation: Parameters<PagedEditor["client"]["mutate"]>[0],
  label: string,
  onRefused?: (reply: MutateReply) => void,
): Promise<MutateReply | null> {
  return paged.client
    .mutate(mutation)
    .then((reply) => {
      if (reply.kind === "mutationFailed") {
        // eslint-disable-next-line no-console
        console.warn(
          `${label} rejected by engine:`,
          JSON.stringify((reply as { payload?: unknown }).payload),
        );
        onRefused?.(reply);
        return reply;
      }
      if (reply.kind !== "mutationApplied") return reply;
      const created = reply.payload.createdId ?? null;
      if (!created) return reply;
      return paged.client
        .setElementSelection([created], "replace")
        .then((ids) => {
          paged.selection.setElementSelection(ids);
          return paged.client.elementGeometry(ids);
        })
        .then((items) => {
          paged.selection.setElementGeometry(items);
          return reply;
        })
        .catch(() => reply);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`${label} failed:`, err);
      return null;
    });
}

/**
 * Pixel tolerance converted to document pt at the current zoom, so
 * hit radii feel constant on screen. Falls back to 1:1 when the
 * camera hasn't initialised (scale 0).
 */
export function pxToPt(paged: PagedEditor, px: number): number {
  const scale = paged.camera.camera.scale;
  return px / (scale > 0 ? scale : 1);
}
