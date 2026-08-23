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

// The Type tool's DRAG: pull out a new text frame.
//
// Until now `paged.tool.type` carried no `gesture` at all. It set the
// hit-test filter to "text" and placed a caret, and that was the whole
// tool — so "press T, drag a box, type", the muscle memory of every
// InDesign user alive, produced nothing. `insertTextFrame` existed on
// the wire since protocol v24 and the only ways to reach it were a menu
// item with no keybinding, the script REPL, or dragging a thread out of
// an existing frame's out-port onto empty canvas.
//
// WHY THIS NEEDS NO CHANGE IN ViewportCanvas. The pointer-up dispatch
// already splits on `maxDelta <= CLICK_DRAG_THRESHOLD_PX`: below the
// threshold it routes to the worker's hit-tester (which is what places
// the caret), above it the gesture handler owns the drag. So a CLICK
// keeps doing exactly what it did, and only a DRAG reaches this file —
// which is precisely the InDesign split.
//
// WHAT IT DELIBERATELY DOES NOT DO. A drag that STARTS over an existing
// text frame creates nothing. In InDesign that gesture selects a range
// of text, and this handler is not that; creating a frame on top of the
// one the user was aiming at would be worse than doing nothing, so it
// bails and leaves the frame alone. Range-drag-select stays as it was.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import { CLICK_DRAG_THRESHOLD_PX, mutateAndSelect } from "./shared";

/** Smaller than a shape's minimum: a one-line frame is a legitimate
 *  thing to pull out, and rounding a deliberate small drag up to a
 *  shape-sized box would fight the user. */
const MIN_TEXT_FRAME_PT = 8;

export function createTypeHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let startPageId: string | null = null;
  let startLocal: [number, number] | null = null;
  /** Set when pointer-down landed on an existing text frame: the drag is
   *  then inert (see the header note). Resolved asynchronously, so the
   *  drag may already be under way when the answer arrives — which is
   *  why it is checked at pointer-up rather than gating pointer-down. */
  let overExistingText = false;

  const reset = () => {
    startPageId = null;
    startLocal = null;
    overExistingText = false;
    paged?.overlaySignals.setToolPreview(null);
  };

  const boundsFor = (end: [number, number]): [number, number, number, number] => {
    const [sx, sy] = startLocal!;
    const [ex, ey] = end;
    return [Math.min(sy, ey), Math.min(sx, ex), Math.max(sy, ey), Math.max(sx, ex)];
  };

  return {
    onActivate(p: PagedEditor) {
      paged = p;
    },
    onDeactivate(reason) {
      // Spring-load suspend keeps the in-flight drag so it resumes when
      // the override is released — same rule the shape tools follow.
      if (reason === "suspend") return;
      reset();
    },
    onPointerDown(e: CanvasPointerEvent) {
      if (e.button !== 0 || !paged || !e.pageId || !e.pagePoint) {
        reset();
        return;
      }
      startPageId = e.pageId;
      startLocal = [e.pagePoint[0], e.pagePoint[1]];
      overExistingText = false;
      // Ask whether a text frame is already here. Filter "text" because
      // dragging across a rectangle to make a text frame is legitimate —
      // only an existing TEXT frame is the case we decline.
      const client = paged.client;
      const pageId = e.pageId;
      const docPoint = e.pagePoint;
      void (async () => {
        try {
          const reply = await client.send({
            kind: "hitTest",
            payload: { pageId, docPoint, filter: "text" },
          });
          if (reply.kind === "hitResult" && reply.payload.element) {
            overExistingText = true;
          }
        } catch {
          // No answer — treat the canvas as empty. Refusing to create on
          // a failed hit-test would make the tool feel broken exactly
          // when the worker is already struggling.
        }
      })();
    },
    onPointerMove(e: CanvasPointerEvent) {
      if (!paged || !startLocal || !e.pagePoint) return;
      if (e.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
      if (overExistingText) return;
      paged.overlaySignals.setToolPreview({
        pageId: startPageId!,
        rect: boundsFor([e.pagePoint[0], e.pagePoint[1]]),
      });
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!paged || !startPageId || !startLocal || !e.pagePoint) {
        reset();
        return;
      }
      const bounds = boundsFor([e.pagePoint[0], e.pagePoint[1]]);
      const pageId = startPageId;
      const declined = overExistingText;
      reset();
      if (declined) return;
      const [top, left, bottom, right] = bounds;
      if (bottom - top < MIN_TEXT_FRAME_PT || right - left < MIN_TEXT_FRAME_PT) {
        return;
      }
      mutateAndSelect(
        paged,
        { op: "insertTextFrame", args: { pageId, bounds } },
        "insertTextFrame",
      );
    },
  };
}
