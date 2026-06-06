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
// It also seeds + maintains the optimistic guide mirror (see
// guide-drag-context.tsx for why a client mirror exists): seeded from
// `DocumentHandle.rulerGuides` on load, rewritten after each guide
// mutation it dispatches. Single undo per placement/move/delete — one
// mutation each, on the same Operation channel as every other edit.

import { useCallback, useEffect, useRef } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { Mutation, PageId } from "@paged-media/client";

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
  // The live optimistic mirror, so the async seed below can tell
  // whether the session has already populated it (a create/move) by
  // the time the spreads collection resolves.
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

  // Seed the optimistic mirror from the load-time handle guides. The
  // handle exposes { pageId, orientation, location } with no id; we
  // assign positional ids per spread. Re-seeds only when a NEW
  // document loads (pageIds signature change), never on our own
  // mutations.
  const seededSigRef = useRef<string>("");
  useEffect(() => {
    if (!handle) return;
    const sig = handle.pageIds.join("|");
    if (sig === seededSigRef.current) return;
    seededSigRef.current = sig;
    void client
      .collection<{ selfId: string }>("spreads")
      .then((spreads) => {
        spreadIdsRef.current = spreads.map((s) => s.selfId);
        // The spreads collection resolves asynchronously. If the user
        // created or moved a guide WHILE it was in flight, the optimistic
        // mirror is now authoritative for this session — replacing it
        // with the (stale, load-time) `rulerGuides` snapshot would wipe
        // that edit (the AC-GD-02 move snapped straight back to its
        // create position). Only seed an untouched mirror.
        if (guidesRef.current.length > 0) return;
        const seeded: OptimisticGuide[] = (handle.rulerGuides ?? []).map(
          (g) => ({
            id: "",
            spreadId: spreadForPageId(g.pageId) ?? spreadIdsRef.current[0] ?? "",
            orientation: g.orientation,
            pageId: g.pageId,
            position: g.location,
          }),
        );
        setGuides(reindex(seeded));
      })
      .catch(() => {
        spreadIdsRef.current = [];
        if (guidesRef.current.length === 0) setGuides([]);
      });
  }, [handle, client, setGuides, spreadForPageId]);

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
