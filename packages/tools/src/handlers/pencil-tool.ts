// Editor-ops — the Pencil tool's gesture handler.
//
// Freehand drag → raw pointer samples (page-local pt, anchored to the
// START page) → Ramer-Douglas-Peucker simplification at a tolerance
// that's constant in SCREEN px (converted to pt at the current zoom)
// → one `insertPath { smooth: true }` Mutation. The engine runs its
// Schneider fit over the simplified polyline, so the committed path
// is smooth cubics, not the jittery samples. One stroke per element —
// lift-and-redraw starts a new path (v1 semantics).
//
// The RDP implementation moved to `@paged-media/draw-geometry`
// (plugin-draw milestone D1) — same algorithm, now shared with the
// paged.draw machines and unit-tested there.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import { simplifyRdp } from "@paged-media/draw-geometry";

import {
  beginPageDrag,
  endLocalFor,
  mutateAndSelect,
  pxToPt,
  type PageDrag,
} from "./shared";

/** Screen-space simplification tolerance. ~1.5px keeps the gesture's
 *  intent while shedding the pointer-event noise the curve fitter
 *  would otherwise chase. */
const RDP_TOLERANCE_PX = 1.5;
const MIN_POINTS = 2;

export function createPencilHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let drag: PageDrag | null = null;
  let points: [number, number][] = [];

  const cancel = () => {
    paged?.overlaySignals.setToolPreview(null);
    drag = null;
    points = [];
  };

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
      points = drag ? [drag.startLocal] : [];
    },
    onPointerMove(e: CanvasPointerEvent) {
      if (!paged || !drag) return;
      points.push(endLocalFor(drag, e));
      paged.overlaySignals.setToolPreview({
        pageId: drag.pageId,
        points,
      });
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!paged || !drag) {
        cancel();
        return;
      }
      const { pageId } = drag;
      points.push(endLocalFor(drag, e));
      const simplified = simplifyRdp(points, pxToPt(paged, RDP_TOLERANCE_PX));
      cancel();
      if (simplified.length < MIN_POINTS) return;
      // Corner anchors (handles collapsed onto the point); the
      // engine's `smooth: true` fit derives the real handles.
      const anchors = simplified.map(([x, y]) => ({
        anchor: [x, y] as [number, number],
        left: [x, y] as [number, number],
        right: [x, y] as [number, number],
      }));
      mutateAndSelect(
        paged,
        { op: "insertPath", args: { pageId, anchors, open: true, smooth: true } },
        "insertPath",
      );
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    },
  };
}
