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

// Snapping for the host's point-placing tools (RFI C-68) — the Pen and
// Direct Selection. The geometry is draw-geometry's `snapPoint`; this is
// the host half, the editor's twin of paged.draw's `handlers/snapping.ts`:
// it reads the page's size ONCE per page (its edges, centre lines and
// corners become targets), adds whatever points the tool contributes
// (the Pen's placed anchors, the other anchors of the path being
// edited), converts the screen tolerance at the current zoom, and is
// bypassed while Cmd is held (Illustrator's "snap off while held") and
// while Shift constrains — a constrained angle wins over a snap that
// would pull the point off it. View ▸ Snap to points turns it off.
// No engine read per move.

import { getViewToggle, type CanvasPointerEvent, type PagedEditor } from "@paged-media/shell";
import {
  anchorTargets,
  pageTargets,
  snapPoint,
  type SnapResult,
  type SnapTarget,
  type Vec2,
} from "@paged-media/draw/geometry";

/** Screen pixels within which a point snaps. */
export const SNAP_TOLERANCE_PX = 6;

/** Is snapping on for a sample with these modifiers? */
export function snappingOn(modifiers: { cmd?: boolean; shift?: boolean }): boolean {
  return getViewToggle("snapToPoints") && !modifiers.cmd && !modifiers.shift;
}

export interface HostSnapper {
  /** Read `pageId`'s targets (once per page). */
  prepare(pageId: string): Promise<void>;
  /** Snap `point` (page-local pt). `extra` are the tool's own points. */
  snap(point: Vec2, e: CanvasPointerEvent, ptPerPx: number, extra?: readonly Vec2[]): Vec2;
  /** The last snap, for a host that draws smart guides. */
  last(): SnapResult | null;
  reset(): void;
}

export function createHostSnapper(paged: () => PagedEditor | null): HostSnapper {
  let page: string | null = null;
  let pageT: SnapTarget[] = [];
  let lastResult: SnapResult | null = null;
  return {
    async prepare(pageId) {
      if (page === pageId) return;
      page = pageId;
      pageT = [];
      const p = paged();
      if (!p) return;
      try {
        const pages = await p.client.collection<{ selfId: string; sizePt?: [number, number] }>("pages");
        const size = pages.find((x) => x.selfId === pageId)?.sizePt;
        if (size && page === pageId) pageT = pageTargets(size[0], size[1]);
      } catch {
        /* no page list → snap to the tool's own points only */
      }
    },
    snap(point, e, ptPerPx, extra = []) {
      if (!snappingOn(e.modifiers)) {
        lastResult = null;
        return point;
      }
      const targets = extra.length > 0 ? [...pageT, ...anchorTargets(extra, "own")] : pageT;
      lastResult = snapPoint(point, targets, SNAP_TOLERANCE_PX * ptPerPx);
      return lastResult.point;
    },
    last: () => lastResult,
    reset() {
      page = null;
      pageT = [];
      lastResult = null;
    },
  };
}
