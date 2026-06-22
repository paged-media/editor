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
//
// B-08 variable-width strokes: when the stroke is drawn with a PEN
// (`pointerType === "pen"`), the captured per-sample pressure becomes a
// width profile that the engine's `OutlineStrokeVariable` op bakes into
// a tapered filled outline — committed alongside the `insertPath` in ONE
// undo step via a `batch` whose property child addresses the just-minted
// path through the `$created` sentinel (protocol v34/v36). A mouse (no
// real pressure) keeps the plain smooth stroke unchanged.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import { simplifyRdp, strokeWidthFromPressure } from "@paged-media/draw-geometry";

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

/** Pen width ramp (pt): pressure 0 → hairline, pressure 1 → bold. The
 *  engine lerps this profile across the committed centreline's arc
 *  length, so the stop count need not match the anchor count. */
const PEN_WIDTH_PROFILE = { min: 0.5, max: 4 };
/** Cap the profile so a long stroke stays a compact op. */
const MAX_WIDTH_STOPS = 48;

/** Pick at most `n` evenly-spaced samples (endpoints always kept), so a
 *  dense pressure stream collapses to a bounded width profile. */
function sampleEvenly(values: number[], n: number): number[] {
  if (n >= values.length || values.length <= 2) return values.slice();
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(values[Math.round((i * (values.length - 1)) / (n - 1))]);
  }
  return out;
}

export function createPencilHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let drag: PageDrag | null = null;
  let points: [number, number][] = [];
  // Per-sample pressure, parallel to `points`; pen-only width profile.
  let pressures: number[] = [];
  let pointerType = "mouse";

  const cancel = () => {
    paged?.overlaySignals.setToolPreview(null);
    drag = null;
    points = [];
    pressures = [];
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
      pressures = drag ? [e.pressure] : [];
      pointerType = e.pointerType;
    },
    onPointerMove(e: CanvasPointerEvent) {
      if (!paged || !drag) return;
      points.push(endLocalFor(drag, e));
      pressures.push(e.pressure);
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
      pressures.push(e.pressure);
      const simplified = simplifyRdp(points, pxToPt(paged, RDP_TOLERANCE_PX));
      // A pen drives the tapered outline; a mouse stays a plain stroke.
      const widths =
        pointerType === "pen"
          ? sampleEvenly(
              pressures,
              Math.min(simplified.length, MAX_WIDTH_STOPS),
            ).map((p) => strokeWidthFromPressure(p, PEN_WIDTH_PROFILE))
          : null;
      cancel();
      if (simplified.length < MIN_POINTS) return;
      // Corner anchors (handles collapsed onto the point); the
      // engine's `smooth: true` fit derives the real handles.
      const anchors = simplified.map(([x, y]) => ({
        anchor: [x, y] as [number, number],
        left: [x, y] as [number, number],
        right: [x, y] as [number, number],
      }));
      const insert = {
        op: "insertPath" as const,
        args: { pageId, anchors, open: true, smooth: true },
      };
      if (widths && widths.length >= 2) {
        // One undo step: insert the centreline, then bake the
        // pressure-driven variable-width outline onto it. The property
        // child targets the freshly-minted path via `$created` (the
        // sentinel's `kind` is irrelevant — the engine replaces the whole
        // id with the real one before applying).
        mutateAndSelect(
          paged,
          {
            op: "batch",
            args: {
              ops: [
                insert,
                {
                  op: "setElementProperty",
                  args: {
                    elementId: { kind: "polygon", id: "$created" },
                    path: "outlineStrokeVariable",
                    value: {
                      type: "outlineStrokeVariable",
                      value: {
                        widths,
                        cap: "round",
                        join: "round",
                        miterLimit: 4,
                        prevAnchors: null,
                        prevSubpathStarts: null,
                        prevSubpathOpen: null,
                      },
                    },
                  },
                },
              ],
            },
          },
          "insertPath(variable-width)",
        );
      } else {
        mutateAndSelect(paged, insert, "insertPath");
      }
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    },
  };
}
