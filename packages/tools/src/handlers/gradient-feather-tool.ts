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

// Editor-ops — the Gradient Feather tool's gesture handler.
//
// Drag across the selected element(s) → a linear opacity feather
// along the drag axis: a whole-struct `frameGradientFeather` write
// (protocol v24) with the classic two-stop ramp (opaque → transparent)
// and the angle from the drag direction (same convention as the
// gradient axis: 0° = left→right, 90° = top→bottom). One
// `setElementProperty` per target inside a single batch (one undo
// step). Escape mid-drag cancels; a plain click clears the feather
// from the selection (InDesign's "zero-length drag removes the
// effect" affordance, made explicit).

import type {
  ElementId,
  GradientFeatherSpec,
  Mutation,
  Value,
} from "@paged-media/client";
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

export function createGradientFeatherHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let drag: PageDrag | null = null;

  const cancel = () => {
    paged?.overlaySignals.setToolPreview(null);
    drag = null;
  };

  const commit = (targets: ElementId[], spec: GradientFeatherSpec | null) => {
    if (!paged || targets.length === 0) return;
    const value: Value = { type: "gradientFeather", value: spec };
    const ops: Mutation[] = targets.map((elementId) => ({
      op: "setElementProperty",
      args: { elementId, path: "frameGradientFeather", value },
    }));
    void paged.client
      .mutate(ops.length === 1 ? ops[0] : { op: "batch", args: { ops } })
      .then((reply) => {
        if (reply.kind === "mutationFailed") {
          // GraphicLines are rejected engine-side (no fill to feather).
          // eslint-disable-next-line no-console
          console.warn(
            "gradientFeather rejected by engine:",
            JSON.stringify((reply as { payload?: unknown }).payload),
          );
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("gradientFeather failed:", err);
      });
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
      paged.overlaySignals.setToolPreview({
        pageId: drag.pageId,
        points: [drag.startLocal, endLocalFor(drag, e)],
      });
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!paged || !drag) {
        cancel();
        return;
      }
      const start = drag.startLocal;
      const end = endLocalFor(drag, e);
      const targets = paged.selection.elementSelection.slice();
      const wasDrag = e.maxDelta > CLICK_DRAG_THRESHOLD_PX;
      cancel();
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const lengthPt = Math.hypot(dx, dy);
      if (!wasDrag || lengthPt < MIN_LENGTH_PT) {
        // Plain click → clear the feather.
        commit(targets, null);
        return;
      }
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      commit(targets, {
        gradientType: "Linear",
        startPoint: start,
        endPoint: end,
        angleDeg,
        stops: [
          { stopColor: null, locationPct: 0, alphaPct: 100, midpointPct: 50 },
          { stopColor: null, locationPct: 100, alphaPct: 0, midpointPct: 50 },
        ],
      });
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    },
  };
}
