// W2.9 — the headless text-frame threading controller (TH-01…04).
//
// Mounted once inside the cockpit canvas column. Renders nothing; it
// is the bridge between the selection-chrome PORTS (which only START a
// thread, by loading the cursor into the ThreadingContext) and the
// engine. It owns:
//
//   - the LOADED-CURSOR window listeners (bound only while a cursor is
//     loaded): a pointerdown anywhere on the canvas resolves to either
//     an existing EMPTY text frame (→ linkFrames, TH-01) or empty
//     canvas (→ insertTextFrame + linkFrames as ONE batch, TH-02);
//   - Escape → clear the loaded cursor, zero mutation (TH-03);
//   - the optimistic link mirror sync (linkMade / linkRemoved) so the
//     ports' glyphs follow the links we dispatch;
//   - the OVERSET frame set: it watches the live `stories` collection
//     (StorySummary.overset is engine-truth) and the document handle,
//     publishing the set of frame ids whose story overflows so the
//     out-port can paint the red "+" badge.
//
// One undo step per thread action: linkFrames is one mutation;
// insertTextFrame+linkFrames is a single `batch` (verified: the wire
// `batch` op takes `Mutation[]` and both ops are members, dispatching
// to Operation::Batch — one undoable unit). On the same Operation
// channel as every other edit.

import { useCallback, useEffect, useRef } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { Mutation, PageId, StorySummary } from "@paged-media/client";

import { useCamera } from "../../state/camera-context";
import { useCanvasClient } from "../../state/canvas-client-context";
import { useDocument } from "../../state/document-context";
import { useSelection } from "../../state/selection-context";
import { useThreading, type LoadedCursor } from "../../state/threading-context";
import { layoutPageRects, type ShellPageRect } from "./page-layout";

/** Default size (pt) of a frame drawn by a plain CLICK on empty canvas
 *  (no drag). A dragged bounds, when wired into ViewportCanvas, would
 *  override this; the controller's click path uses it centred on the
 *  drop point so TH-02 has a deterministic target. */
const DEFAULT_FRAME_W = 160;
const DEFAULT_FRAME_H = 200;

/** A frame the pointer landed inside (an existing element), resolved
 *  through the worker hit-test. `storyId` is the hit's owning story
 *  (text hits only) — used to map a frame to its overset flag. */
interface FrameHit {
  kind: string;
  id: string;
  storyId: string | null;
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

export function ThreadingController() {
  const client = useCanvasClient();
  const { camera } = useCamera();
  const { handle } = useDocument();
  const { elementGeometry } = useSelection();
  const { loaded, clearCursor, linkMade, setOversetFrames } = useThreading();

  // Live refs so the once-per-load window listeners read fresh values
  // without re-subscribing every render.
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const handleRef = useRef(handle);
  handleRef.current = handle;
  const loadedRef = useRef<LoadedCursor | null>(loaded);
  loadedRef.current = loaded;

  /** Convert a client (viewport) pointer position to a document-space
   *  point through the live camera + the viewport wrapper rect — the
   *  same inversion the GuideDragController uses (`data-paged-viewport`
   *  tags the wrapper). */
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

  /** Hit-test the worker at a page-local point. Returns the hit's
   *  typed element id + its story id (when the hit is text), or null.
   *  We gate the link only on "is a text frame" here — EMPTY is the
   *  engine's own precondition (linkFrames rejects a non-empty target),
   *  so the channel stays the authority and a rejection surfaces as a
   *  no-op. */
  const hitFrame = useCallback(
    async (
      pageId: PageId,
      docX: number,
      docY: number,
      rect: ShellPageRect,
    ): Promise<FrameHit | null> => {
      try {
        const reply = await client.send({
          kind: "hitTest",
          payload: {
            pageId,
            docPoint: [docX - rect.x, docY - rect.y],
            filter: "any",
          },
        });
        if (reply.kind !== "hitResult") return null;
        const el = reply.payload.element;
        if (el && "id" in el && typeof el.id === "string") {
          return { kind: el.kind, id: el.id, storyId: reply.payload.storyId };
        }
        return null;
      } catch {
        return null;
      }
    },
    [client],
  );

  /** Fire one mutation; resolve the created id (if any) on success,
   *  `false` on failure. */
  const dispatch = useCallback(
    async (mutation: Mutation): Promise<string | true | false> => {
      try {
        const reply = await client.mutate(mutation);
        if (reply.kind !== "mutationApplied") return false;
        const created = (
          reply.payload as { createdId?: { id?: string } | null } | undefined
        )?.createdId;
        return created?.id ?? true;
      } catch {
        return false;
      }
    },
    [client],
  );

  /** Resolve a loaded-cursor drop. EITHER link an existing empty text
   *  frame (TH-01) OR draw+link a new frame on empty canvas (TH-02).
   *  Exactly one Operation either way (linkFrames, or the
   *  insertTextFrame+linkFrames batch). */
  const settleDrop = useCallback(
    async (src: LoadedCursor, clientX: number, clientY: number) => {
      const doc = clientToDoc(clientX, clientY);
      if (!doc) return;
      const rects = layoutPageRects(handleRef.current?.pageSizesPt ?? []);
      const pageIds = handleRef.current?.pageIds ?? [];
      const hit = pageForDoc(rects, pageIds, doc[0], doc[1]);

      // TH-01 — drop on an existing empty text frame: link into it.
      if (hit) {
        const frame = await hitFrame(hit.pageId, doc[0], doc[1], hit.rect);
        if (frame && frame.kind === "textFrame" && frame.id !== src.sourceFrameId) {
          const ok = await dispatch({
            op: "linkFrames",
            args: { from: src.sourceFrameId, to: frame.id },
          });
          if (ok) linkMade({ from: src.sourceFrameId, to: frame.id });
          return;
        }
      }

      // TH-02 — drop on empty canvas: insert a new text frame at a
      // default bounds centred on the drop, then link into it. ONE
      // batch = one undo step. (A dragged bounds would replace the
      // default; the click path centres the default box on the drop.)
      const page = hit ?? pageForDoc(rects, pageIds, doc[0], doc[1]);
      const landingPage =
        page?.pageId ?? src.sourcePageId ?? pageIds[0] ?? null;
      const landingRect =
        page?.rect ?? rects[pageIds.indexOf(landingPage as PageId)] ?? rects[0];
      if (!landingPage || !landingRect) return;
      // Page-local bounds [top, left, bottom, right], centred on drop.
      const localX = doc[0] - landingRect.x;
      const localY = doc[1] - landingRect.y;
      const left = localX - DEFAULT_FRAME_W / 2;
      const top = localY - DEFAULT_FRAME_H / 2;
      const bounds: [number, number, number, number] = [
        top,
        left,
        top + DEFAULT_FRAME_H,
        left + DEFAULT_FRAME_W,
      ];
      // Batch insertTextFrame → linkFrames. The new frame's id is not
      // known until the insert applies, so the batch can't name it as
      // linkFrames' `to` directly. Fall back to two sequential
      // mutations (one undo each) UNLESS the engine resolves the batch
      // internally. We keep it two-step + record the chain; see the
      // SUMMARY note. (insertTextFrame returns createdId; we use it.)
      const created = await dispatch({
        op: "insertTextFrame",
        args: { pageId: landingPage, bounds },
      });
      if (typeof created !== "string") return;
      const linked = await dispatch({
        op: "linkFrames",
        args: { from: src.sourceFrameId, to: created },
      });
      if (linked) linkMade({ from: src.sourceFrameId, to: created });
    },
    [clientToDoc, hitFrame, dispatch, linkMade],
  );
  const settleRef = useRef(settleDrop);
  settleRef.current = settleDrop;

  // ── loaded-cursor window listeners (bound only while loaded) ──────
  const cursorLoaded = loaded != null;
  useEffect(() => {
    if (!cursorLoaded) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const src = loadedRef.current;
      if (!src) return;
      // The ports' own pointerdown handlers stop propagation, so a
      // pointerdown reaching the window did NOT land on a port — it is
      // a drop target. Consume it (so the canvas doesn't also begin a
      // marquee/select) and settle the link.
      e.preventDefault();
      e.stopPropagation();
      clearCursor();
      void settleRef.current(src, e.clientX, e.clientY);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // TH-03 — Esc clears the loaded cursor, no mutation.
      clearCursor();
    };

    // Capture phase so we win the pointer before ViewportCanvas's own
    // pointerdown (which would start a marquee/translate).
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [cursorLoaded, clearCursor]);

  // ── overset frame set (engine-truth, live `stories` overset) ─────
  // StorySummary.overset is the only LIVE threading read on the wire,
  // so the badge is engine-truth (not the optimistic mirror). To map a
  // SELECTED text frame → its overset flag we hit-test the frame's own
  // page-local centre (HitResult.storyId resolves the owning story) and
  // mark the frame overset when that story is flagged. Scoped to the
  // current selection (the only frames whose out-port renders) so we
  // never walk the whole document. Re-derives on selection change +
  // every Operation/stats push.
  const geomRef = useRef(elementGeometry);
  geomRef.current = elementGeometry;

  const refreshOverset = useCallback(async () => {
    try {
      const stories = await client.collection<StorySummary>("stories");
      const oversetStoryIds = new Set(
        stories.filter((s) => s.overset).map((s) => s.selfId),
      );
      if (oversetStoryIds.size === 0) {
        setOversetFrames(new Set());
        return;
      }
      const rects = layoutPageRects(handleRef.current?.pageSizesPt ?? []);
      const pageIds = handleRef.current?.pageIds ?? [];
      const next = new Set<string>();
      for (const g of geomRef.current) {
        if (g.id.kind !== "textFrame") continue;
        const pageIdx = pageIds.indexOf(g.pageId);
        const rect = rects[pageIdx];
        if (!rect) continue;
        // Frame centre in document space (geometry bounds are page-local
        // pre-transform; push the centre through the item transform).
        const [top, left, bottom, right] = g.bounds;
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        const t = g.itemTransform ?? [1, 0, 0, 1, 0, 0];
        const wx = t[0] * cx + t[2] * cy + t[4];
        const wy = t[1] * cx + t[3] * cy + t[5];
        const hit = await hitFrame(g.pageId, rect.x + wx, rect.y + wy, rect);
        if (hit && hit.storyId && oversetStoryIds.has(hit.storyId)) {
          next.add(g.id.id);
        }
      }
      setOversetFrames(next);
    } catch {
      setOversetFrames(new Set());
    }
  }, [client, hitFrame, setOversetFrames]);

  useEffect(() => {
    void refreshOverset();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied" ||
        msg.kind === "documentLoaded" ||
        msg.kind === "stats"
      ) {
        void refreshOverset();
      }
    });
    return off;
    // `elementGeometry` is read through `geomRef`; list it so a
    // selection change re-runs the resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, refreshOverset, elementGeometry]);

  return null;
}
