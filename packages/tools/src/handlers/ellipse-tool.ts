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

// Editor-ops — the Ellipse tool's gesture handler (W2.6).
//
// Drag → a live ellipse-outline rubber-band (sampled as a closed
// polyline, since the tool-preview overlay draws rects and polylines
// but has no ellipse primitive) → ONE `insertOval { pageId, bounds }`
// Mutation on pointer-up (the engine creates an Oval inscribed in the
// bounds). The lifecycle mirrors the Rectangle handler exactly:
// page-anchored drag (both corners resolved against the START page so
// the result is correct even when released over the pasteboard or a
// neighbouring page), single mutation on release, mutateAndSelect,
// Escape cancels mid-drag, spring-load suspend keeps the gesture.
//
// Modifiers (gestures.md DR-02/DR-03, shared with the Polygon tool):
//   Shift → constrain bounds to a circle (square bounds, DR-02)
//   Alt   → draw from the centre (start point is the centre, DR-03)
// resolved per sample by `drawBoundsFor` (no latched constraint).

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import {
  beginPageDrag,
  drawBoundsFor,
  endLocalFor,
  mutateAndSelect,
  CLICK_DRAG_THRESHOLD_PX,
  type Bounds,
  type PageDrag,
} from "./shared";

const MIN_SIZE_PT = 1;
/** Vertices in the ellipse-outline preview. 48 reads as a smooth curve
 *  at any practical drag size without flooding the overlay SVG. */
const PREVIEW_SAMPLES = 48;

/** Sample the ellipse inscribed in `[top,left,bottom,right]` as a ring
 *  of page-local points (closed by the overlay's `close` flag). */
function ellipsePreviewPoints(bounds: Bounds): [number, number][] {
  const [top, left, bottom, right] = bounds;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const rx = (right - left) / 2;
  const ry = (bottom - top) / 2;
  const points: [number, number][] = [];
  for (let i = 0; i < PREVIEW_SAMPLES; i++) {
    const t = (i / PREVIEW_SAMPLES) * Math.PI * 2;
    points.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return points;
}

export function createEllipseHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let drag: PageDrag | null = null;

  const cancel = () => {
    paged?.overlaySignals.setToolPreview(null);
    drag = null;
  };

  const boundsFor = (e: CanvasPointerEvent): Bounds =>
    drawBoundsFor(drag!.startLocal, endLocalFor(drag!, e), e.modifiers);

  return {
    onActivate(p) {
      paged = p;
    },
    onDeactivate(reason) {
      if (reason === "suspend") return;
      cancel();
    },
    onPointerDown(e: CanvasPointerEvent) {
      drag = beginPageDrag(e);
    },
    onPointerMove(e: CanvasPointerEvent) {
      if (!paged || !drag) return;
      if (e.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
      paged.overlaySignals.setToolPreview({
        pageId: drag.pageId,
        points: ellipsePreviewPoints(boundsFor(e)),
        close: true,
      });
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!paged || !drag) {
        cancel();
        return;
      }
      const bounds = boundsFor(e);
      const { pageId } = drag;
      cancel();
      const [top, left, bottom, right] = bounds;
      // A click (no real drag) creates nothing — InDesign opens an
      // options dialog there; that's a follow-up (matches Rectangle).
      if (bottom - top < MIN_SIZE_PT || right - left < MIN_SIZE_PT) return;
      mutateAndSelect(
        paged,
        { op: "insertOval", args: { pageId, bounds } },
        "insertOval",
      );
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    },
  };
}
