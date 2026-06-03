// Editor-ops — the Line tool's gesture handler.
//
// Drag → live polyline preview → a single `insertLine` Mutation on
// pointer-up (engine creates a GraphicLine with the document-default
// stroke). Shift constrains the line to 45° increments, matching
// InDesign. Both endpoints resolve against the START page (the
// Rectangle handler's rule) so crossing onto the pasteboard or a
// neighbouring page mid-drag keeps the geometry correct.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import {
  beginPageDrag,
  endLocalFor,
  mutateAndSelect,
  CLICK_DRAG_THRESHOLD_PX,
  type PageDrag,
} from "./shared";

const MIN_LENGTH_PT = 1;

/** Snap the segment start→end to the nearest 45° direction. */
function constrain45(
  start: [number, number],
  end: [number, number],
): [number, number] {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return end;
  const step = Math.PI / 4;
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
  return [start[0] + len * Math.cos(snapped), start[1] + len * Math.sin(snapped)];
}

export function createLineHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let drag: PageDrag | null = null;

  const cancel = () => {
    paged?.overlaySignals.setToolPreview(null);
    drag = null;
  };

  const endFor = (e: CanvasPointerEvent): [number, number] => {
    const end = endLocalFor(drag!, e);
    return e.modifiers.shift ? constrain45(drag!.startLocal, end) : end;
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
    },
    onPointerMove(e: CanvasPointerEvent) {
      if (!paged || !drag) return;
      if (e.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
      paged.overlaySignals.setToolPreview({
        pageId: drag.pageId,
        points: [drag.startLocal, endFor(e)],
      });
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!paged || !drag) {
        cancel();
        return;
      }
      const { pageId, startLocal } = drag;
      const end = endFor(e);
      cancel();
      if (Math.hypot(end[0] - startLocal[0], end[1] - startLocal[1]) < MIN_LENGTH_PT) {
        return;
      }
      mutateAndSelect(
        paged,
        { op: "insertLine", args: { pageId, start: startLocal, end } },
        "insertLine",
      );
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    },
  };
}
