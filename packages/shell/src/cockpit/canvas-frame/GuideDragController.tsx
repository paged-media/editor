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

// W2.8 — the headless guide-drag controller (GD-01…03).
//
// Mounted once inside the cockpit canvas column. Renders nothing; it
// is the bridge between the ruler hit zones / overlay (which only
// START a drag, into the GuideDrag context) and the engine. While a
// drag is live it owns:
//
//   - window pointermove → convert client px to document pt through
//     the live camera + viewport rect, resolve which page the pointer
//     is over, and publish the preview (the overlay draws it);
//   - window pointerup → settle: ONE insertGuide (create dropped over
//     a page) / moveGuide (existing guide dropped over a page) /
//     deleteGuide (existing guide dropped back over a ruler), or
//     nothing (a create dropped back over the ruler — GD-01 cancel);
//   - Escape → cancel: restore the original position, no mutation
//     (GD-03). We never mutate until release, so a cancel is just
//     dropping the live preview.
//
// It also seeds + maintains the guide mirror. W3.A2: the mirror is now
// engine-truth — `collection("spreads")` carries each spread's live
// `<Guide>` set (`SpreadSummary.guides`: id + orientation + position +
// pageIndex), refreshed on every request, so the controller RE-QUERIES
// the collection on load AND on every Operation push (mutationApplied /
// undoApplied / redoApplied) to rebuild the mirror. This replaces the
// old optimistic-only mirror that `DocumentHandle.rulerGuides`
// (load-time snapshot, no ids) forced: undo/redo now re-sync the
// overlay from the post-mutation model, and a created guide's real
// positional id comes back from the collection. The controller still
// applies an OPTIMISTIC update right after its own mutation for
// instant feedback; the collection re-query confirms / corrects it.
// Single undo per placement/move/delete — one mutation each, on the
// same Operation channel as every other edit. The re-query is skipped
// while a drag is live so it never clobbers an in-flight preview.

import { useCallback, useEffect, useRef } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type {
  GuideSummary,
  Mutation,
  PageId,
  SpreadSummary,
} from "@paged-media/client";

import { useCamera } from "../../state/camera-context";
import { useCanvasClient } from "../../state/canvas-client-context";
import { useDocument } from "../../state/document-context";
import {
  useGuideDrag,
  type GuideDragState,
  type OptimisticGuide,
} from "../../state/guide-drag-context";
import { layoutPageRects, type ShellPageRect } from "./page-layout";

/** Whole-pt snap (GD spec: release snaps to whole pt). */
function snapPt(v: number): number {
  return Math.round(v);
}

/** Re-derive the positional `Guide/<spread>/<index>` id for every
 *  guide from its per-spread order, matching how the engine addresses
 *  guides (insertGuide appends; deleteGuide re-indexes the rest). */
function reindex(guides: OptimisticGuide[]): OptimisticGuide[] {
  const perSpread = new Map<string, number>();
  return guides.map((g) => {
    const idx = perSpread.get(g.spreadId) ?? 0;
    perSpread.set(g.spreadId, idx + 1);
    return { ...g, id: `Guide/${g.spreadId}/${idx}` };
  });
}

interface PageHit {
  pageId: PageId;
  rect: ShellPageRect;
}

function pageForDoc(
  rects: ReadonlyArray<ShellPageRect>,
  ids: ReadonlyArray<PageId>,
  x: number,
  y: number,
): PageHit | null {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return { pageId: ids[i], rect: r };
    }
  }
  return null;
}

export function GuideDragController() {
  const client = useCanvasClient();
  const { camera } = useCamera();
  const { handle } = useDocument();
  const { drag, guides, updateDrag, clearDrag, setGuides } = useGuideDrag();

  // Live refs so the once-per-drag window listeners read fresh values
  // without re-subscribing every preview tick.
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const handleRef = useRef(handle);
  handleRef.current = handle;
  const dragRef = useRef<GuideDragState | null>(drag);
  dragRef.current = drag;
  const guidesRef = useRef(guides);
  guidesRef.current = guides;

  // Spread ids for the loaded document, document order. Guides are
  // spread-scoped; a created guide lands on the spread that owns the
  // page under the pointer. Most fixtures are single-spread.
  const spreadIdsRef = useRef<string[]>([]);

  /** Map a page id to the spread that owns it. Without a page→spread
   *  wire map we approximate by page order (one-spread-per-page is the
   *  common multi-spread shape); single-spread docs always return the
   *  first spread. Part of the documented wire gap. */
  const spreadForPageId = useCallback((pageId: PageId | null): string | null => {
    const ids = spreadIdsRef.current;
    if (ids.length === 0) return null;
    if (ids.length === 1 || !pageId) return ids[0];
    const pages = handleRef.current?.pageIds ?? [];
    const pageIdx = pages.indexOf(pageId);
    if (pageIdx < 0) return ids[0];
    return ids[Math.min(pageIdx, ids.length - 1)];
  }, []);

  // ── engine-truth re-sync from `collection("spreads")` (W3.A2) ─────
  // Rebuild the mirror from each spread's live `guides` set. `pageIndex`
  // is spread-local; map it to a document page id via each spread's
  // running page offset (spreads carry their pageCount). The
  // GuideSummary already carries the engine's positional id, so we use
  // it directly (no reindex needed). Skipped while a drag is live so a
  // mid-drag Operation push never clobbers the preview.
  const resyncFromSpreads = useCallback(async () => {
    if (dragRef.current) return;
    try {
      const spreads = await client.collection<SpreadSummary>("spreads");
      spreadIdsRef.current = spreads.map((s) => s.selfId);
      const pages = handleRef.current?.pageIds ?? [];
      const mirror: OptimisticGuide[] = [];
      let pageOffset = 0;
      for (const sp of spreads) {
        for (const g of (sp.guides ?? []) as GuideSummary[]) {
          const pageId = pages[pageOffset + (g.pageIndex ?? 0)] ?? pages[0];
          if (!pageId) continue;
          mirror.push({
            id: g.id,
            spreadId: sp.selfId,
            orientation: g.orientation,
            pageId,
            position: g.position,
          });
        }
        pageOffset += sp.pageCount;
      }
      setGuides(mirror);
    } catch {
      /* worker reload / disconnect — keep the current mirror */
    }
  }, [client, setGuides]);
  const resyncRef = useRef(resyncFromSpreads);
  resyncRef.current = resyncFromSpreads;

  // Seed on load + re-sync on every Operation push (mutationApplied /
  // undoApplied / redoApplied). Load is detected by a pageIds signature
  // change; the subscription catches our own guide mutations AND
  // undo/redo so the overlay follows engine truth.
  const seededSigRef = useRef<string>("");
  useEffect(() => {
    if (!handle) return;
    const sig = handle.pageIds.join("|");
    if (sig !== seededSigRef.current) {
      seededSigRef.current = sig;
      void resyncFromSpreads();
    }
  }, [handle, resyncFromSpreads]);

  useEffect(() => {
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        void resyncRef.current();
      }
    });
    return off;
  }, [client]);

  /** Convert a client (viewport) pointer position to a document-space
   *  point through the live camera + the viewport wrapper rect. The
   *  cockpit tags the wrapper `data-paged-viewport`. */
  const clientToDoc = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const wrap = document.querySelector("[data-paged-viewport]");
      if (!wrap) return null;
      const r = wrap.getBoundingClientRect();
      const cam = cameraRef.current;
      if (cam.scale <= 0) return null;
      return [
        (clientX - r.left - cam.tx) / cam.scale,
        (clientY - r.top - cam.ty) / cam.scale,
      ];
    },
    [],
  );

  /** Is the client point over a ruler strip? Used to cancel a create
   *  / delete a moved guide. */
  const overRulerAt = useCallback((clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    return Boolean(el && el.closest("[data-h-ruler], [data-v-ruler]"));
  }, []);

  /** Resolve a client pointer position to the preview fields for a
   *  drag of the given orientation: which page + page-local coordinate
   *  on the perpendicular axis, and whether the pointer is over a
   *  ruler. Pure read — both the live preview (onMove) and the commit
   *  (onUp) call it, so the release uses the freshest position rather
   *  than a possibly-stale React state snapshot. */
  const resolvePreview = useCallback(
    (
      orientation: "horizontal" | "vertical",
      clientX: number,
      clientY: number,
    ): Pick<
      GuideDragState,
      "overRuler" | "previewDocCoord" | "previewPageId" | "previewPosition"
    > => {
      const overRuler = overRulerAt(clientX, clientY);
      const doc = clientToDoc(clientX, clientY);
      if (!doc) {
        return {
          overRuler,
          previewDocCoord: null,
          previewPageId: null,
          previewPosition: null,
        };
      }
      const rects = layoutPageRects(handleRef.current?.pageSizesPt ?? []);
      const pageIds = handleRef.current?.pageIds ?? [];
      const hit = pageForDoc(rects, pageIds, doc[0], doc[1]);
      if (orientation === "horizontal") {
        return {
          overRuler,
          previewDocCoord: doc[1],
          previewPageId: hit?.pageId ?? null,
          previewPosition: hit ? doc[1] - hit.rect.y : null,
        };
      }
      return {
        overRuler,
        previewDocCoord: doc[0],
        previewPageId: hit?.pageId ?? null,
        previewPosition: hit ? doc[0] - hit.rect.x : null,
      };
    },
    [overRulerAt, clientToDoc],
  );
  const resolvePreviewRef = useRef(resolvePreview);
  resolvePreviewRef.current = resolvePreview;

  /** Fire one guide mutation; resolve true on `mutationApplied`. */
  const dispatch = useCallback(
    async (mutation: Mutation): Promise<boolean> => {
      try {
        const reply = await client.mutate(mutation);
        return reply.kind === "mutationApplied";
      } catch {
        return false;
      }
    },
    [client],
  );

  /** Commit the drag's terminal mutation (or none) + mirror it into
   *  the optimistic store. Exactly one of insertGuide / moveGuide /
   *  deleteGuide, or zero (cancel). */
  const settle = useCallback(
    async (d: GuideDragState, onRuler: boolean) => {
      if (d.kind === "create") {
        // GD-01: dropped back over the ruler, or never over a page →
        // cancel (no insert).
        if (onRuler || d.previewPageId == null || d.previewPosition == null) {
          return;
        }
        const spreadId = spreadForPageId(d.previewPageId);
        if (!spreadId) return;
        const position = snapPt(d.previewPosition);
        const pageId = d.previewPageId;
        const ok = await dispatch({
          op: "insertGuide",
          args: { spreadId, orientation: d.orientation, position },
        });
        if (!ok) return;
        setGuides((prev) =>
          reindex([
            ...prev,
            { id: "", spreadId, orientation: d.orientation, pageId, position },
          ]),
        );
        return;
      }
      // MOVE
      const target = d.guide;
      if (!target) return;
      // GD-02: dropped back over a ruler → delete.
      if (onRuler) {
        const ok = await dispatch({
          op: "deleteGuide",
          args: { guideId: target.id },
        });
        if (!ok) return;
        setGuides((prev) => reindex(prev.filter((g) => g.id !== target.id)));
        return;
      }
      // Over a page → moveGuide to the snapped position. Off every
      // page (pasteboard) or unchanged → no-op (zero mutation).
      if (d.previewPosition == null) return;
      const position = snapPt(d.previewPosition);
      if (position === target.position) return;
      const movedPage = d.previewPageId ?? target.pageId;
      const ok = await dispatch({
        op: "moveGuide",
        args: { guideId: target.id, position },
      });
      if (!ok) return;
      setGuides((prev) =>
        prev.map((g) =>
          g.id === target.id ? { ...g, position, pageId: movedPage } : g,
        ),
      );
    },
    [spreadForPageId, dispatch, setGuides],
  );
  const settleRef = useRef(settle);
  settleRef.current = settle;

  // ── window listeners, mounted only while a drag is live ──────────
  const dragActive = drag != null;
  useEffect(() => {
    if (!dragActive) return;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      updateDrag(resolvePreviewRef.current(d.orientation, e.clientX, e.clientY));
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      clearDrag();
      if (!d) return;
      // Recompute the drop from the pointer-up position so the commit
      // never rides a stale preview (the last move may not have
      // re-rendered yet). Carry it into settle.
      const resolved = resolvePreviewRef.current(
        d.orientation,
        e.clientX,
        e.clientY,
      );
      void settleRef.current({ ...d, ...resolved }, resolved.overRuler);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // GD-03 — cancel: nothing was mutated yet, so just drop the
      // live preview. A move's original guide is untouched.
      clearDrag();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
    // Listeners read the live drag / preview-resolver / settle through
    // refs, so they bind exactly once per drag (mount/unmount on
    // dragActive).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragActive, updateDrag, clearDrag]);

  return null;
}
