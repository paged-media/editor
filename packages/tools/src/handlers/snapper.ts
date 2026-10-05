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
// Direct Selection.
//
// Since engine protocol 67 the ENGINE resolves a point: `requestSnapPoint`
// snaps it against every visible element's anchors, centres and outlines,
// the page, ruler guides, the grid and the x / y lines through all of
// them — the same resolver the engine's own move, resize and path-edit
// gestures use, with the session's tolerance. `engineSnapPoint` asks it;
// `HostSnapper.snapAsync` uses it and falls back to the plugin-side
// geometry (draw-geometry's `snapPoint` over the page and the tool's own
// points) when the engine does not answer — an engine before v67.
//
// Both are bypassed while Cmd is held (Illustrator's "snap off while
// held") and while Shift constrains — a constrained angle wins over a
// snap that would pull the point off it. View ▸ Snap to points turns it
// off.

import { getViewToggle, type CanvasPointerEvent, type PagedEditor } from "@paged-media/shell";
import {
  anchorTargets,
  pageTargets,
  snapPoint,
  type SnapResult,
  type SnapTarget,
  type Vec2,
} from "@paged-media/draw/geometry";

/** Screen pixels within which a point snaps on the FALLBACK path (the
 *  engine path uses the session's tolerance). */
export const SNAP_TOLERANCE_PX = 6;

/** The v67 `requestSnapPoint` query, declared here so this file compiles
 *  against an engine package from before v67 (the wire union has no such
 *  kind there; the engine path then simply never answers). */
export interface EngineSnapQuery {
  pageId: string;
  point: [number, number];
  /** CSS px per pt at the current zoom. */
  cameraScale: number;
  exclude?: { id: unknown; anchors?: number[] | null }[];
  extraPoints?: [number, number][];
}

/** The part of the v67 `SnapPointResult` the tools read. */
export interface EngineSnapResult {
  point: [number, number];
  snapped: boolean;
  tolerancePt: number;
}

type Send = (msg: never) => Promise<{ kind: string; payload?: unknown }>;

/** Ask the engine to snap `query`. `null` when it does not answer — an
 *  engine before v67, or no document. Never throws. */
export async function engineSnapPoint(
  send: Send,
  query: EngineSnapQuery,
): Promise<EngineSnapResult | null> {
  try {
    const reply = await send({ kind: "requestSnapPoint", payload: { query } } as never);
    if (reply.kind !== "snapPoint") return null;
    const r = (reply.payload as { result?: EngineSnapResult } | undefined)?.result;
    return r && r.tolerancePt > 0 ? r : null;
  } catch {
    return null;
  }
}

/** Is snapping on for a sample with these modifiers? */
export function snappingOn(modifiers: { cmd?: boolean; shift?: boolean }): boolean {
  return getViewToggle("snapToPoints") && !modifiers.cmd && !modifiers.shift;
}

export interface HostSnapper {
  /** Read `pageId`'s targets (once per page). */
  prepare(pageId: string): Promise<void>;
  /** Snap `point` (page-local pt). `extra` are the tool's own points. */
  snap(point: Vec2, e: CanvasPointerEvent, ptPerPx: number, extra?: readonly Vec2[]): Vec2;
  /** Snap through the engine (v67), else as `snap` does. */
  snapAsync(
    pageId: string,
    point: Vec2,
    e: CanvasPointerEvent,
    ptPerPx: number,
    extra?: readonly Vec2[],
  ): Promise<Vec2>;
  /** The last snap, for a host that draws smart guides. */
  last(): SnapResult | null;
  reset(): void;
}

export function createHostSnapper(paged: () => PagedEditor | null): HostSnapper {
  let page: string | null = null;
  let pageT: SnapTarget[] = [];
  let lastResult: SnapResult | null = null;
  const snap = (point: Vec2, e: CanvasPointerEvent, ptPerPx: number, extra: readonly Vec2[] = []): Vec2 => {
    if (!snappingOn(e.modifiers)) {
      lastResult = null;
      return point;
    }
    const targets = extra.length > 0 ? [...pageT, ...anchorTargets(extra, "own")] : pageT;
    lastResult = snapPoint(point, targets, SNAP_TOLERANCE_PX * ptPerPx);
    return lastResult.point;
  };
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
    snap,
    async snapAsync(pageId, point, e, ptPerPx, extra = []) {
      if (!snappingOn(e.modifiers)) {
        lastResult = null;
        return point;
      }
      const p = paged();
      if (p) {
        const r = await engineSnapPoint(p.client.send.bind(p.client) as unknown as Send, {
          pageId,
          point: [point[0], point[1]],
          cameraScale: 1 / ptPerPx,
          extraPoints: extra.map((q) => [q[0], q[1]] as [number, number]),
        });
        if (r) {
          lastResult = null;
          return [r.point[0], r.point[1]];
        }
      }
      return snap(point, e, ptPerPx, extra);
    },
    last: () => lastResult,
    reset() {
      page = null;
      pageT = [];
      lastResult = null;
    },
  };
}
