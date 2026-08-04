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

// Editor-ops — the Smooth tool's gesture handler.
//
// Click a path → one `simplifyPath { elementId, tolerance }` Mutation:
// the engine drops anchors that sit within `tolerance` pt of the curve
// they lie on, which IS InDesign's Smooth tool semantic ("removes
// excess anchor points, preserving the path's shape"). The target is
// the clicked element (worker hit-test) falling back to the current
// single selection, the same resolution rule the Scissors tool uses.
//
// HONEST SCOPE — the engine op is WHOLE-ELEMENT. InDesign's Smooth
// scopes the simplification to the span you drag ALONG the path; there
// is no partial-path arm on the wire, so this tool scopes the TARGET,
// not the span. Tolerance is a tool option (double-click the slot)
// rather than a drag pressure, for the same reason.
//
// paged.draw exposes the same op as `media.paged.draw.command.
// simplifyPath` (a command-palette verb over the selection); this is
// the rail affordance for it, which is why the built-in Smooth slot is
// wired rather than retired.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import { CLICK_DRAG_THRESHOLD_PX } from "./shared";

const TOOL_ID = "paged.tool.smooth";
/** Half a point of slack — enough to drop the redundant anchors a
 *  freehand Pencil stroke leaves behind without visibly moving the
 *  curve. Matches the tolerance the path-ops capability probe uses. */
const DEFAULT_TOLERANCE_PT = 1.5;
const MIN_TOLERANCE_PT = 0.1;
const MAX_TOLERANCE_PT = 20;

function toleranceFor(paged: PagedEditor): number {
  const raw = paged.toolSettings.getValue(TOOL_ID, "tolerance");
  const n =
    typeof raw === "number" && Number.isFinite(raw) ? raw : DEFAULT_TOLERANCE_PT;
  return Math.min(MAX_TOLERANCE_PT, Math.max(MIN_TOLERANCE_PT, n));
}

export function createSmoothHandler(): GestureHandler {
  let paged: PagedEditor | null = null;

  const smoothAt = async (e: CanvasPointerEvent) => {
    if (!paged || !e.pageId || !e.pagePoint) return;
    const client = paged.client;
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
    const reply = await client.mutate({
      op: "simplifyPath",
      args: { elementId: target, tolerance: toleranceFor(paged) },
    });
    if (reply.kind === "mutationFailed") {
      // Ovals and other non-path kinds are rejected engine-side.
      // eslint-disable-next-line no-console
      console.warn(
        "simplifyPath rejected by engine:",
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
      void smoothAt(e).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("smooth failed:", err);
      });
    },
  };
}
