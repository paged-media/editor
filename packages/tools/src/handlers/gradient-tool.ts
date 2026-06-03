// Editor-ops — the Gradient Swatch tool's gesture handler.
//
// Drag across the selected element(s) → the gradient AXIS: angle from
// the drag direction (renderer convention: 0° = left→right, 90° =
// top→bottom, i.e. y-down positive) and length from the drag extent
// in pt. Committed as ONE batch Mutation (angle + length per target)
// so the whole drag is a single undo step. The fill must already
// reference a `Gradient/<id>` swatch — the axis fields are inert on
// solid fills (the renderer only reads them for gradient paints).
// Shift constrains the axis to 45° increments.

import type { Mutation } from "@paged-media/client";
import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import {
  beginPageDrag,
  endLocalFor,
  CLICK_DRAG_THRESHOLD_PX,
  type PageDrag,
} from "./shared";

const MIN_LENGTH_PT = 1;

export function createGradientSwatchHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let drag: PageDrag | null = null;

  const cancel = () => {
    paged?.overlaySignals.setToolPreview(null);
    drag = null;
  };

  const axisFor = (
    e: CanvasPointerEvent,
  ): { end: [number, number]; angleDeg: number; lengthPt: number } => {
    const end = endLocalFor(drag!, e);
    let dx = end[0] - drag!.startLocal[0];
    let dy = end[1] - drag!.startLocal[1];
    let angle = Math.atan2(dy, dx);
    if (e.modifiers.shift) {
      const step = Math.PI / 4;
      angle = Math.round(angle / step) * step;
      const len = Math.hypot(dx, dy);
      dx = len * Math.cos(angle);
      dy = len * Math.sin(angle);
    }
    return {
      end: [drag!.startLocal[0] + dx, drag!.startLocal[1] + dy],
      angleDeg: (angle * 180) / Math.PI,
      lengthPt: Math.hypot(dx, dy),
    };
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
      if (!paged || paged.selection.elementSelection.length === 0) return;
      drag = beginPageDrag(e);
    },
    onPointerMove(e: CanvasPointerEvent) {
      if (!paged || !drag) return;
      if (e.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
      const { end } = axisFor(e);
      paged.overlaySignals.setToolPreview({
        pageId: drag.pageId,
        points: [drag.startLocal, end],
      });
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!paged || !drag) {
        cancel();
        return;
      }
      const targets = paged.selection.elementSelection.slice();
      const { angleDeg, lengthPt } = axisFor(e);
      cancel();
      if (lengthPt < MIN_LENGTH_PT || targets.length === 0) return;
      const ops: Mutation[] = targets.flatMap((elementId): Mutation[] => [
        {
          op: "setElementProperty",
          args: {
            elementId,
            path: "frameGradientFillAngle",
            value: { type: "length", value: angleDeg },
          },
        },
        {
          op: "setElementProperty",
          args: {
            elementId,
            path: "frameGradientFillLength",
            value: { type: "length", value: lengthPt },
          },
        },
      ]);
      void paged.client
        .mutate({ op: "batch", args: { ops } })
        .then((reply) => {
          if (reply.kind === "mutationFailed") {
            // eslint-disable-next-line no-console
            console.warn(
              "gradient axis rejected by engine:",
              JSON.stringify((reply as { payload?: unknown }).payload),
            );
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("gradient axis failed:", err);
        });
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    },
  };
}
