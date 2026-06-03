// Editor-ops — the Pencil tool's gesture handler.
//
// Freehand drag → raw pointer samples (page-local pt, anchored to the
// START page) → Ramer-Douglas-Peucker simplification at a tolerance
// that's constant in SCREEN px (converted to pt at the current zoom)
// → one `insertPath { smooth: true }` Mutation. The engine runs its
// Schneider fit over the simplified polyline, so the committed path
// is smooth cubics, not the jittery samples. One stroke per element —
// lift-and-redraw starts a new path (v1 semantics).

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

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

/** Perpendicular distance from `p` to the segment a→b. */
function segmentDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq),
  );
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Iterative RDP (explicit stack — strokes can run thousands of
 *  samples and recursion depth tracks the sample count). */
function simplifyRdp(
  points: ReadonlyArray<[number, number]>,
  tolerance: number,
): [number, number][] {
  if (points.length <= 2) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index >= 0 && maxDist > tolerance) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

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
