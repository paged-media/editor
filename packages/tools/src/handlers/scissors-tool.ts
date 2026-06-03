// Editor-ops — the Scissors tool's gesture handler.
//
// Click on (or near) a path anchor → one `pathOpenAt` Mutation
// (protocol v24): a closed contour opens at that anchor (the engine
// rotates the contour so the cut is the seam and twins the endpoint);
// an open contour splits into two at it. The target is the clicked
// element (worker hit-test), falling back to the current single
// selection so a precise click on a hairline path isn't required.
// v1 cuts at ANCHORS only — mid-segment cuts (de Casteljau split +
// open) ride the same engine op later via a preceding
// `pathPointInsert`.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import { CLICK_DRAG_THRESHOLD_PX, pxToPt } from "./shared";

/** Screen-space pick radius around an anchor. */
const ANCHOR_TOLERANCE_PX = 6;

export function createScissorsHandler(): GestureHandler {
  let paged: PagedEditor | null = null;

  const cutAt = async (e: CanvasPointerEvent) => {
    if (!paged || !e.pageId || !e.pagePoint) return;
    const client = paged.client;
    // Resolve the target: hit-test first, selection as fallback.
    let target = null;
    try {
      const reply = await client.send({
        kind: "hitTest",
        payload: { pageId: e.pageId, docPoint: e.pagePoint, filter: "any" },
      });
      if (reply.kind === "hitResult") target = reply.payload.element ?? null;
    } catch {
      /* fall through to the selection */
    }
    if (!target && paged.selection.elementSelection.length === 1) {
      target = paged.selection.elementSelection[0];
    }
    if (!target) return;
    const result = await client.pathAnchors(target).catch(() => null);
    if (!result || result.pageId !== e.pageId) return;
    // Nearest anchor within the pick radius (page-local pt).
    const tol = pxToPt(paged, ANCHOR_TOLERANCE_PX);
    let best = -1;
    let bestDist = tol;
    result.anchors.forEach((a, i) => {
      const d = Math.hypot(
        a.anchor[0] - e.pagePoint![0],
        a.anchor[1] - e.pagePoint![1],
      );
      if (d <= bestDist) {
        best = i;
        bestDist = d;
      }
    });
    if (best < 0) return;
    const reply = await client.mutate({
      op: "pathOpenAt",
      args: { elementId: target, index: best },
    });
    if (reply.kind === "mutationFailed") {
      // Ovals / single-anchor contours are rejected engine-side.
      // eslint-disable-next-line no-console
      console.warn(
        "pathOpenAt rejected by engine:",
        JSON.stringify((reply as { payload?: unknown }).payload),
      );
    }
  };

  return {
    onActivate(p) {
      paged = p;
    },
    onDeactivate() {
      /* click tool — nothing in flight */
    },
    onPointerDown() {
      /* acts on pointer-up so click-vs-drag is decidable */
    },
    onPointerMove() {},
    onPointerUp(e: CanvasPointerEvent) {
      if (e.button !== 0 || e.maxDelta > CLICK_DRAG_THRESHOLD_PX) return;
      void cutAt(e).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("scissors cut failed:", err);
      });
    },
  };
}
