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
//   - the ENGINE-TRUTH chain state (W3.A2): on every Operation push it
//     reads `nextTextFrame` / `previousTextFrame` off the SELECTED
//     frame(s) via `elementProperties` and publishes the two id sets
//     so the ports' glyphs reflect the real chain (load-time chains
//     included; undo/redo re-sync automatically);
//   - the OVERSET frame set: it watches the live `stories` overset
//     (StorySummary.overset is engine-truth) and the document handle,
//     publishing the set of frame ids whose story overflows so the
//     out-port can paint the red "+" badge.
//
// Undo granularity (verified against the wire `batch` op): TH-01's
// link is ONE linkFrames mutation = one undo step. TH-02's
// draw-then-link is TWO SEQUENTIAL mutations (insertTextFrame, then
// linkFrames), NOT a single batch. The wire `batch` op takes a
// pre-serialised `Mutation[]`; a batched linkFrames would have to name
// the new frame as its `to`, but the new frame's id isn't known until
// insertTextFrame applies (it comes back on `mutationApplied`'s
// `createdId`), and there is no placeholder/forward-reference in the
// batch payload to carry it. So the draw-flow is two undo steps, and
// the spec asserts the two-op sequence. All on the same Operation
// channel as every other edit.

import { useCallback, useEffect, useRef } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { Mutation, PageId, StorySummary } from "@paged-media/client";

import { useCamera } from "../../state/camera-context";
import { useCanvasClient } from "../../state/canvas-client-context";
import { useDocument } from "../../state/document-context";
import { useOptionalOverlaySignals } from "../../state/overlay-signals-context";
import { useSelection } from "../../state/selection-context";
import { useThreading, type LoadedCursor } from "../../state/threading-context";
import { layoutPageRects, type ShellPageRect } from "./page-layout";

/** Default size (pt) of a frame drawn by a plain CLICK on empty canvas
 *  (no drag): its top-left corner sits at the click and it is kept on
 *  the page. A DRAG draws the frame to the dragged box instead (ED-5). */
const DEFAULT_FRAME_W = 160;
const DEFAULT_FRAME_H = 200;

/** Screen px a press must travel before it is a drag, not a click — the
 *  canvas's own click/drag threshold. */
const DRAG_THRESHOLD_PX = 4;

/** Smallest dragged frame (pt); a smaller box is treated as a click, the
 *  Type tool's minimum. */
const MIN_DRAGGED_FRAME_PT = 8;

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
  const { loaded, clearCursor, setChainState, setOversetFrames } =
    useThreading();
  const setToolPreview = useOptionalOverlaySignals()?.setToolPreview ?? null;
  const setToolPreviewRef = useRef(setToolPreview);
  setToolPreviewRef.current = setToolPreview;

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
   *  frame (TH-01, one linkFrames) OR draw+link a new frame on empty
   *  canvas (TH-02, insertTextFrame then linkFrames — two undo steps;
   *  see the file header for why this can't be one batch).
   *
   *  `end` is where a DRAG was released (ED-5): the new frame is then the
   *  dragged box, like any frame tool draws, wherever the drag began. */
  const settleDrop = useCallback(
    async (
      src: LoadedCursor,
      clientX: number,
      clientY: number,
      end: { clientX: number; clientY: number } | null = null,
    ) => {
      const doc = clientToDoc(clientX, clientY);
      if (!doc) return;
      const rects = layoutPageRects(handleRef.current?.pageSizesPt ?? []);
      const pageIds = handleRef.current?.pageIds ?? [];
      const hit = pageForDoc(rects, pageIds, doc[0], doc[1]);
      const landingPage = hit?.pageId ?? src.sourcePageId ?? pageIds[0] ?? null;
      const landingRect =
        hit?.rect ?? rects[pageIds.indexOf(landingPage as PageId)] ?? rects[0];

      const drawAndLink = async (bounds: [number, number, number, number]) => {
        if (!landingPage) return;
        // insertTextFrame returns the new frame's id on `mutationApplied`;
        // use it as linkFrames' `to`. Two sequential mutations.
        const created = await dispatch({
          op: "insertTextFrame",
          args: { pageId: landingPage, bounds },
        });
        if (typeof created !== "string") return;
        await dispatch({
          op: "linkFrames",
          args: { from: src.sourceFrameId, to: created },
        });
      };

      const endDoc = end ? clientToDoc(end.clientX, end.clientY) : null;
      if (endDoc && landingRect) {
        // Page-local [top, left, bottom, right] of the dragged box, on the
        // page the drag began over.
        const x0 = Math.min(doc[0], endDoc[0]) - landingRect.x;
        const x1 = Math.max(doc[0], endDoc[0]) - landingRect.x;
        const y0 = Math.min(doc[1], endDoc[1]) - landingRect.y;
        const y1 = Math.max(doc[1], endDoc[1]) - landingRect.y;
        if (x1 - x0 >= MIN_DRAGGED_FRAME_PT && y1 - y0 >= MIN_DRAGGED_FRAME_PT) {
          await drawAndLink([y0, x0, y1, x1]);
          return;
        }
      }

      // TH-01 — drop on an existing text frame: link into it. (EMPTY is
      // the engine's own precondition; a non-empty target rejects on
      // the channel and surfaces here as a no-op.)
      if (hit) {
        const frame = await hitFrame(hit.pageId, doc[0], doc[1], hit.rect);
        if (
          frame &&
          frame.kind === "textFrame" &&
          frame.id !== src.sourceFrameId
        ) {
          // The chain-state effect re-reads on the mutationApplied
          // push, so the ports follow without a manual mirror update.
          await dispatch({
            op: "linkFrames",
            args: { from: src.sourceFrameId, to: frame.id },
          });
          return;
        }
      }

      // TH-02 — click on empty canvas: insert a default-sized text frame
      // with its top-left corner at the click, then link into it. On a
      // page the frame is kept on that page (it used to be centred on
      // the click and hang off the edge); on the pasteboard it stays
      // where it was put.
      if (!landingPage || !landingRect) return;
      const w = hit ? Math.min(DEFAULT_FRAME_W, landingRect.w) : DEFAULT_FRAME_W;
      const h = hit ? Math.min(DEFAULT_FRAME_H, landingRect.h) : DEFAULT_FRAME_H;
      let left = doc[0] - landingRect.x;
      let top = doc[1] - landingRect.y;
      if (hit) {
        left = Math.min(Math.max(left, 0), landingRect.w - w);
        top = Math.min(Math.max(top, 0), landingRect.h - h);
      }
      await drawAndLink([top, left, top + h, left + w]);
    },
    [clientToDoc, hitFrame, dispatch],
  );
  const settleRef = useRef(settleDrop);
  settleRef.current = settleDrop;

  // ── loaded-cursor window listeners (bound only while loaded) ──────
  const cursorLoaded = loaded != null;

  // B4 — SHOW the mode. While a thread is loaded these listeners run in
  // CAPTURE phase and `stopPropagation` the next pointerdown ANYWHERE on
  // screen, including over a panel: the app is modal and the user's next
  // click is already spoken for. The only feedback was the source
  // frame's own out-port turning magenta — an 18px square the user's
  // hand is usually covering.
  //
  // Written on documentElement rather than a React style, because the
  // pointer may be over any part of the app (panels, rails, the menu
  // bar) and every one of those subtrees sets its own cursor. `!important`
  // for the same reason. Restored on unload, including when the effect
  // tears down mid-load — an Escape that left the whole app showing a
  // copy cursor would be a worse bug than the one being fixed.
  useEffect(() => {
    if (!cursorLoaded) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("cursor");
    const previousPriority = root.style.getPropertyPriority("cursor");
    root.style.setProperty("cursor", "copy", "important");
    return () => {
      if (previous) root.style.setProperty("cursor", previous, previousPriority);
      else root.style.removeProperty("cursor");
    };
  }, [cursorLoaded]);

  useEffect(() => {
    if (!cursorLoaded) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const src = loadedRef.current;
      if (!src) return;
      // The ports' own pointerdown handlers stop propagation, so a
      // pointerdown reaching the window did NOT land on a port — it is
      // a drop target. Consume it (so the canvas doesn't also begin a
      // marquee/select) and wait for the release: a click links or drops
      // a default frame, a DRAG draws the new frame to its box (ED-5 —
      // the press used to settle at once, so a drag was ignored).
      e.preventDefault();
      e.stopPropagation();
      const start = { clientX: e.clientX, clientY: e.clientY };
      let dragged = false;
      const finish = () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onCancel, true);
        setToolPreviewRef.current?.(null);
      };
      const onMove = (m: PointerEvent) => {
        // The canvas never saw the press; keep the moves from it too.
        m.stopPropagation();
        if (!loadedRef.current) {
          finish();
          return;
        }
        dragged ||=
          Math.hypot(m.clientX - start.clientX, m.clientY - start.clientY) >
          DRAG_THRESHOLD_PX;
        if (!dragged) return;
        const a = clientToDoc(start.clientX, start.clientY);
        const b = clientToDoc(m.clientX, m.clientY);
        const rects = layoutPageRects(handleRef.current?.pageSizesPt ?? []);
        const pageIds = handleRef.current?.pageIds ?? [];
        if (!a || !b) return;
        const page =
          pageForDoc(rects, pageIds, a[0], a[1]) ??
          (src.sourcePageId
            ? { pageId: src.sourcePageId, rect: rects[pageIds.indexOf(src.sourcePageId)] }
            : null);
        if (!page?.rect) return;
        setToolPreviewRef.current?.({
          pageId: page.pageId,
          rect: [
            Math.min(a[1], b[1]) - page.rect.y,
            Math.min(a[0], b[0]) - page.rect.x,
            Math.max(a[1], b[1]) - page.rect.y,
            Math.max(a[0], b[0]) - page.rect.x,
          ],
        });
      };
      const onUp = (u: PointerEvent) => {
        u.preventDefault();
        u.stopPropagation();
        finish();
        // Escape during the drag already unloaded the cursor.
        if (!loadedRef.current) return;
        clearCursor();
        void settleRef.current(
          src,
          start.clientX,
          start.clientY,
          dragged ? { clientX: u.clientX, clientY: u.clientY } : null,
        );
      };
      const onCancel = () => finish();
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onCancel, true);
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
  }, [cursorLoaded, clearCursor, clientToDoc]);

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
      // The StorySummary collection carries the live `overset` flag. A
      // collection read, not a `paged.stories()` script: a script run reads
      // as a document change to every listener, and this runs after every
      // edit.
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
        // C-23 — a pasteboard frame has no page to index or hit-test
        // against. Threading is a PAGE-level relationship (ports are
        // drawn in page space, and `hitFrame` probes a page), so an
        // off-page frame is correctly out of scope here rather than
        // something to fall back for.
        if (!g.pageId) continue;
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

  // ── engine-truth chain state (W3.A2) ─────────────────────────────
  // Read `nextTextFrame` / `previousTextFrame` off the SELECTED text
  // frame(s) and publish the two id sets the ports read. Scoped to the
  // selection (the only frames whose ports render) so we never walk the
  // whole document. Re-runs on selection change + every Operation push,
  // so load-time chains AND undo/redo are reflected directly from the
  // engine — no session mirror.
  const refreshChain = useCallback(async () => {
    try {
      const frames = geomRef.current.filter((g) => g.id.kind === "textFrame");
      if (frames.length === 0) {
        setChainState({ withNext: new Set(), withPrev: new Set() });
        return;
      }
      // A real linked frame is a `u…` element id; the IDML "no link"
      // sentinel is the literal `"n"` (InDesign's `NextTextFrame="n"` /
      // `PreviousTextFrame="n"`), and an absent/empty value is also no
      // link. Treat both as "no chain".
      const isLinked = (v: string): boolean => v !== "" && v !== "n";
      const withNext = new Set<string>();
      const withPrev = new Set<string>();
      for (const g of frames) {
        // `g.id.kind === "textFrame"` here (filtered above), so the
        // ElementId's `id` is the bare frame-id string.
        if (g.id.kind !== "textFrame") continue;
        const frameId = g.id.id;
        const props = await client.elementProperties(g.id);
        if (!props) continue;
        const next = props.entries.find((e) => e.path === "nextTextFrame");
        const prev = props.entries.find((e) => e.path === "previousTextFrame");
        if (next?.value && next.value.type === "text" && isLinked(next.value.value)) {
          withNext.add(frameId);
        }
        if (prev?.value && prev.value.type === "text" && isLinked(prev.value.value)) {
          withPrev.add(frameId);
        }
      }
      setChainState({ withNext, withPrev });
    } catch {
      setChainState({ withNext: new Set(), withPrev: new Set() });
    }
  }, [client, setChainState]);

  useEffect(() => {
    void refreshOverset();
    void refreshChain();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied" ||
        msg.kind === "documentLoaded" ||
        msg.kind === "stats"
      ) {
        void refreshOverset();
        void refreshChain();
      }
    });
    return off;
    // `elementGeometry` is read through `geomRef`; list it so a
    // selection change re-runs the resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, refreshOverset, refreshChain, elementGeometry]);

  return null;
}
