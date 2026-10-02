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

// The HOST's half of path editing: saying what the pointer is on.
//
// paged.draw's Direct Selection and Pen machines never hit-test — they
// are handed a description of what a press landed on (an anchor, one of
// its handles, a point on a segment, nothing) and decide what that
// means. Producing that description is the editor's job, because only
// the editor knows how big a dot is on screen at this zoom. This module
// is that one job, shared by both tools so an anchor is the same size
// to the Pen as it is to Direct Selection.
//
// Everything here works in POINTER space — page-local pt, the space the
// overlay draws in — on a table already mapped through the element's
// item transform (`toPointerTable`). A tolerance is therefore a distance
// on the page, which at a given zoom is a distance on screen; nothing
// has to reason about a rotated or scaled element's own axes.

import {
  IDENTITY_AFFINE,
  closestTOnCubic,
  dist,
  evalCubic,
  transformAnchorTable,
  type Affine,
  type AnchorTable,
  type Vec2,
} from "@paged-media/draw/geometry";
import { segmentPairsOf } from "@paged-media/draw/machines";

/** What a point on the page is over. `index` is the flat anchor index
 *  (across contours); a segment is named by its START anchor — the
 *  convention of the engine's `NearestPathPointResult.segStart` and of
 *  both machines' hit types. */
export type PathHit =
  | { kind: "anchor"; index: number }
  | { kind: "handle"; index: number; side: "left" | "right" }
  | { kind: "segment"; index: number; t: number }
  | { kind: "empty" };

/** Grab sizes in CSS px. They are the path-edit overlay's own hit
 *  shapes (an 11 px square on an anchor, a 10 px disc on a handle, an
 *  8 px band along a segment), so what the cursor promises over a dot
 *  is what a press there gets. */
export const PATH_HIT_PX = {
  /** HALF the side of an anchor's square. */
  anchor: 5.5,
  /** Radius of a handle's disc. */
  handle: 5,
  /** Half the width of a segment's band. */
  segment: 4,
} as const;

/** Grab sizes in pointer-space pt. */
export interface PathHitRadii {
  anchor: number;
  handle: number;
  segment: number;
}

/** `PATH_HIT_PX` at a zoom: `ptPerPx` is document pt per CSS px. */
export function pathHitRadii(ptPerPx: number): PathHitRadii {
  return {
    anchor: PATH_HIT_PX.anchor * ptPerPx,
    handle: PATH_HIT_PX.handle * ptPerPx,
    segment: PATH_HIT_PX.segment * ptPerPx,
  };
}

/** A handle this close to its anchor is collapsed onto it (IDML's
 *  corner convention): the overlay draws no dot for it, so there is
 *  nothing to grab. */
const COLLAPSED_HANDLE_PT = 1e-3;

/** Map an engine anchor table (the element's inner space) into pointer
 *  space through its item transform. */
export function toPointerTable(
  table: AnchorTable,
  transform: Affine | null | undefined,
): AnchorTable {
  return transformAnchorTable(table, transform ?? IDENTITY_AFFINE);
}

/**
 * What `point` is over, on ONE path. Precedence is the overlay's paint
 * order, top first: an anchor, then a handle, then a segment — so a
 * handle dot that happens to sit under a neighbouring anchor's square
 * does not steal the press from the anchor the user can see.
 *
 * `handles: false` skips the handle dots, for a tool that does not draw
 * them (the Pen).
 */
export function hitPathTable(
  table: AnchorTable,
  point: Vec2,
  radii: PathHitRadii,
  options: { handles: boolean } = { handles: true },
): PathHit {
  // Anchors — a square, like the dot. The nearest one wins a tie
  // between two whose squares overlap.
  let best = -1;
  let bestDistance = Infinity;
  table.anchors.forEach((a, i) => {
    if (
      Math.abs(a.anchor[0] - point[0]) > radii.anchor ||
      Math.abs(a.anchor[1] - point[1]) > radii.anchor
    ) {
      return;
    }
    const d = dist(a.anchor, point);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  if (best >= 0) return { kind: "anchor", index: best };

  if (options.handles) {
    let side: "left" | "right" = "left";
    bestDistance = radii.handle;
    table.anchors.forEach((a, i) => {
      for (const s of ["left", "right"] as const) {
        if (dist(a[s], a.anchor) <= COLLAPSED_HANDLE_PT) continue;
        const d = dist(a[s], point);
        if (d <= bestDistance) {
          best = i;
          side = s;
          bestDistance = d;
        }
      }
    });
    if (best >= 0) return { kind: "handle", index: best, side };
  }

  let segment: { index: number; t: number } | null = null;
  bestDistance = radii.segment;
  for (const [start, end] of segmentPairsOf(table)) {
    const s = table.anchors[start];
    const e = table.anchors[end];
    if (!s || !e) continue;
    const t = closestTOnCubic(s.anchor, s.right, e.left, e.anchor, point);
    const d = dist(evalCubic(s.anchor, s.right, e.left, e.anchor, t), point);
    if (d <= bestDistance) {
      segment = { index: start, t };
      bestDistance = d;
    }
  }
  return segment ? { kind: "segment", ...segment } : { kind: "empty" };
}
