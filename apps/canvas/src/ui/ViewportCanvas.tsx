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

// Canvas-backed viewport.
//
// Owns a real `<canvas>` element; on mount calls
// `transferControlToOffscreen()` and hands the OffscreenCanvas to the
// worker via `CanvasClient.attachCanvas`. After that, the worker
// fully owns rendering — this component's only jobs are:
//
//   1. Host the `<canvas>` element + its hosting div.
//   2. Translate pointer + wheel events into camera updates
//      (`CanvasClient.setCamera`).
//   3. Track viewport size via ResizeObserver and forward to worker.
//   4. Render a small HUD overlay (DOM) on top of the canvas.
//
// Per spec AC-V-7 the main thread does no rendering work here — the
// `<canvas>` is opaque from React's perspective after the
// `transferControlToOffscreen` call.

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  OverlayHost,
  useContentSelection,
  useEditContextEntry,
  useOptionalEditContextStack,
  useOverlaySignals,
  type MarqueeRectPageLocal,
  type SelectionState,
} from "@paged-media/shell";

import type { CanvasClient } from "@paged-media/client";
import { viewportToDoc, type Camera } from "@paged-media/client";
import type {
  CanvasPointerEvent,
  ContentPointerEvent,
} from "@paged-media/shell";
import type {
  ElementGeometryItem,
  ElementId,
  GestureHandle,
  GestureType,
  LayoutCacheStats,
  PageId,
  ResizeHandle,
  ResolutionResult,
  RunningHeader,
  TextCellAddr,
} from "@paged-media/client";
import {
  documentBounds,
  fitCamera,
  layoutPages,
  zoomAt,
  type PageRect,
} from "./layout";

// Re-export the (now shell-owned) overlay state types so existing
// imports from this module continue to work.
export type { MarqueeRectPageLocal, SelectionState };

export interface PointerModifiers {
  /** Shift held → add to selection. */
  shift: boolean;
  /** Cmd (macOS) or Ctrl (other) held → toggle. */
  cmd: boolean;
}

export interface ViewportCanvasProps {
  client: CanvasClient;
  pageIds: ReadonlyArray<PageId>;
  pageSizesPt: ReadonlyArray<readonly [number, number]>;
  camera: Camera;
  onCameraChange: (cam: Camera) => void;
  /** Called when the user clicks (not drags) on a page. */
  onHit?: (
    selection: SelectionState | null,
    modifiers?: PointerModifiers,
  ) => void;
  /** Phase A — called when the user finishes a marquee drag with the
   * select tool. Payload is page-local `[top, left, bottom, right]`. */
  onMarquee?: (
    pageId: PageId,
    rect: [number, number, number, number],
    modifiers?: PointerModifiers,
  ) => void;
  /** Current selection; used by the overlay to highlight the hit point + page. */
  selection?: SelectionState | null;
  /** Main-thread FPS, sampled via rAF. Shown in the HUD. */
  fps?: number;
  /** Whether the worker successfully initialised WebGPU. `null` while undetermined. */
  gpuActive?: boolean | null;
  /** Tier 3 resolution result — anchor table + per-anchor page numbers. */
  resolution?: ResolutionResult | null;
  /** Phase 4 Step 2 — last rebuild's layout-cache stats; HUD badge. */
  layoutCacheStats?: LayoutCacheStats | null;
  /** Phase A — active tool. Default is `select`; `text` falls back to
   * the existing caret/typing pathway. */
  activeTool?: "select" | "text";
  /** Phase A — currently-selected element ids (worker-mirrored). */
  elementSelection?: ReadonlyArray<ElementId>;
  /** Phase A — geometry per selected id for the overlay chrome. */
  elementGeometry?: ReadonlyArray<ElementGeometryItem>;
  /** Phase B — called when the active gesture (translate, …) commits.
   * Caller refreshes the cached element geometry so the chrome lands
   * at the committed position. */
  onGestureCommitted?: () => void;
  /** Phase H / Track L — called when the user double-clicks a frame
   * whose hit is nested inside a group. `groupId` is the outermost
   * containing group (group_chain[0]); `hitElement` is the leaf the
   * user actually clicked on. Phase H used this to expand the group
   * to its leaves; Track L uses it to ENTER the group (set
   * `activeGroup = groupId`) and select the hit leaf scoped within. */
  onDoubleClickGroup?: (groupId: string, hitElement: ElementId | null) => void;
  /** Phase 2 (Concept 1) — when set, the effective tool carries a
   * gesture handler; ViewportCanvas resolves each pointer event to
   * document coordinates and routes it here, bypassing the
   * select/text / pan / marquee path. Null (the default) for
   * select/text, so the proven legacy path runs untouched. */
  /** Set when the ACTIVE tool declares a `legacyKey` as well as a
   *  gesture — i.e. its click and its drag are different halves of one
   *  tool (the Type tool: click places a caret, drag pulls out a text
   *  frame). Drives the dual dispatch in onPointerDown/onPointerUp. */
  legacyKeyForTool?: string | null;
  toolGesture?: {
    onDown: (e: CanvasPointerEvent) => void;
    onMove: (e: CanvasPointerEvent) => void;
    onUp: (e: CanvasPointerEvent) => void;
    /** Abort the in-flight tool gesture WITHOUT committing — pointer-
     *  capture loss / window blur (INV-8). `onUp` commits; this rolls
     *  back. */
    onCancel: () => void;
    /** Per-position cursor refinement from the handler's `cursorAt`. */
    hoverCursor?: (e: CanvasPointerEvent) => string | undefined;
  } | null;
  /** Phase 3 — CSS cursor for the active tool. Overrides the default
   * pan affordance when set. */
  cursor?: string;
  /** Concept 1 — the Hand tool (incl. the Space spring-load): every
   * primary-button drag pans, reusing the proven pan machinery. */
  forcePan?: boolean;
  /** Concept 1 — the Zoom tool (incl. Cmd+Space): a click zooms in
   * around the pointer; Alt-click zooms out. */
  zoomClick?: boolean;
}

const CLICK_DRAG_THRESHOLD_PX = 4;

/**
 * K-1 — invert a PAGE-LOCAL pointer into a frame's CONTENT coordinates
 * (the space a plugin's scene layer / edit context works in; §8.5 — the
 * plugin never compensates for the frame transform). The geometry's
 * `itemTransform` maps the frame's bounds-space `(bounds.left..right,
 * bounds.top..bottom)` to page-local; we invert it, then subtract the
 * bounds origin so `(0,0)` is the content-box top-left — the SAME model a
 * scene-layer submission uses (C-1 composes at `itemTransform ∘
 * translate(bounds.left, bounds.top)`). Returns `null` when the point
 * falls OUTSIDE the content box (the caller then treats the click as a
 * commit / re-target) or the transform is singular.
 *
 * NOTE: this assumes a ZERO text-inset — the same assumption the C-1
 * consumer makes when it sizes a scene layer to the full frame bounds. A
 * nonzero frame inset would shift the content origin by `(ins_left,
 * ins_top)`; threading the inset through `ElementGeometryItem` is the
 * documented residual (it is not exposed on the geometry read today).
 */
function pageToContentPoint(
  geom: ElementGeometryItem,
  pageLocal: [number, number],
): [number, number] | null {
  const m = geom.itemTransform;
  let bx = pageLocal[0];
  let by = pageLocal[1];
  if (m) {
    const [a, b, c, d, e, f] = m;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-9) return null;
    const px = pageLocal[0] - e;
    const py = pageLocal[1] - f;
    bx = (d * px - c * py) / det;
    by = (-b * px + a * py) / det;
  }
  const [top, left, bottom, right] = geom.bounds;
  const cx = bx - left;
  const cy = by - top;
  if (cx < 0 || cy < 0 || cx > right - left || cy > bottom - top) return null;
  return [cx, cy];
}

export function ViewportCanvas(props: ViewportCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Set once we've transferred to the worker — guards against re-transfer (illegal). */
  const transferredRef = useRef(false);

  const dragStateRef = useRef<{
    /** `pan` is camera-translate; `marquee` is the element-selection
     * rect drag; `gesture` is an in-flight worker gesture (translate,
     * resize, …). Click-vs-drag still uses `maxDelta` for routing
     * through the hit tester. */
    mode: "pan" | "marquee" | "gesture";
    startCam: Camera;
    /** Anchor in doc-space pt (already camera-inverted) — used so the
     * pointer→doc delta survives mid-gesture camera changes. */
    startDoc: [number, number];
    startPointer: [number, number];
    /** Largest pointer-delta seen during this gesture, in CSS px. */
    maxDelta: number;
    /** Modifier state captured at pointerdown. */
    modifiers: PointerModifiers;
    /** Phase A — anchor + page for marquee mode. `null` when the
     * pointer started outside any page (we still allow the drag to
     * resolve as a pan-style cancellation on release). */
    marqueeAnchor: {
      pageId: PageId;
      pageX: number;
      pageY: number;
    } | null;
    /** Phase B — gesture-mode bookkeeping. `handle` is `null` until
     * the worker confirms the gesture started; updates that arrive
     * before then are buffered into `pendingDelta`. */
    gestureState?: {
      handle: GestureHandle | null;
      pendingDelta: [number, number];
      target: ElementId[];
    };
  } | null>(null);

  // Phase 2 (Concept 1) — bookkeeping for a tool-gesture drag (the
  // active GestureHandler owns the semantics; we only track the
  // pointer + click-vs-drag delta).
  const toolDragRef = useRef<{
    startPointer: [number, number];
    maxDelta: number;
  } | null>(null);

  // Phase A / E — marquee + snap guides live on OverlaySignalsContext.
  // ViewportCanvas writes (pointer plumbing); the marquee + snap-lines
  // overlay contributions read.
  const overlaySignals = useOverlaySignals();
  const setMarqueeRect = overlaySignals.setMarqueeRect;
  const setSnapLines = overlaySignals.setSnapLines;
  const marqueeRect = overlaySignals.marqueeRect;

  // W2.11 — text-tool click granularity. The text caret/range is owned
  // by ContentSelectionContext (the round-tripping setter refreshes
  // caret + selection geometry); ViewportCanvas drives it directly for
  // double-/triple-click word/line selection so the granularity logic
  // stays out of the panel wiring (single-click → caret still flows
  // through `onHit` → the panel).
  const { setContentSelection } = useContentSelection();

  // W3.2 — the edit-context entry resolver (B-02/W-03). A double-click
  // consults this BEFORE group descent: a polygon enters the
  // vectorGraphic context, a webFrame enters its source context.
  const { tryEnterEditContext, tryEnterOwnedContent } = useEditContextEntry();

  // K-1 — the edit-context STACK (optional: the canvas mounts standalone
  // in some specs). While a context is active, a pointer over the active
  // frame is delivered to its contribution in FRAME-CONTENT coordinates
  // (the canvas inverts the frame transform; §8.5 — the plugin never
  // compensates); a pointer OUTSIDE the active frame COMMITS the context.
  const editContextStack = useOptionalEditContextStack();
  // True between a content pointerdown (consumed by the active context)
  // and its matching up — so move/up route to the context, not the tools.
  const contentGestureRef = useRef(false);

  // Native `detail` on pointerup is unreliable across browsers for the
  // 3rd click, so we track the click run ourselves: same screen point
  // (within slop) within the multi-click window bumps the count.
  const clickRunRef = useRef<{ t: number; x: number; y: number; count: number }>(
    { t: 0, x: 0, y: 0, count: 0 },
  );

  // Document-space layout — only used to compute initial fit-to-document.
  const rects = useMemo(
    () => layoutPages(props.pageSizesPt),
    [props.pageSizesPt],
  );

  // Mount: transfer the canvas. Cleanup: nothing — once an
  // OffscreenCanvas is transferred, the worker owns it for its
  // entire life. Re-mounting the React component is destructive
  // anyway (camera state resets), and the user flow that triggers
  // it (new document via file drop) also resets the worker model.
  useEffect(() => {
    if (transferredRef.current) return;
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const { width, height } = wrapper.getBoundingClientRect();
    const dpr = self.devicePixelRatio || 1;
    // The HTMLCanvasElement's CSS size stays driven by the
    // wrapper's flex layout; what we transfer is the *bitmap*
    // dimensions. Match them to the wrapper at attach time.
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const offscreen = canvas.transferControlToOffscreen();
    props.client.attachCanvas(offscreen, dpr, width, height);
    transferredRef.current = true;
    // Trigger initial fit-to-document.
    if (rects.length > 0 && width > 10 && height > 10) {
      props.onCameraChange(fitCamera(width, height, documentBounds(rects)));
    }
    // We deliberately depend on `client` only — fit-to-document
    // takes the current rects/dims; subsequent re-fits are driven
    // by the document-id signature effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.client]);

  // ResizeObserver: post size updates to the worker so the
  // OffscreenCanvas bitmap matches the device-pixel viewport.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let lastW = 0;
    let lastH = 0;
    const ro = new ResizeObserver(() => {
      const r = wrapper.getBoundingClientRect();
      if (r.width === lastW && r.height === lastH) return;
      lastW = r.width;
      lastH = r.height;
      const dpr = self.devicePixelRatio || 1;
      if (transferredRef.current) {
        props.client.resizeCanvas(dpr, r.width, r.height);
      }
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [props.client]);

  // Step 5e — subscribe to out-of-band snap-line notifications. The
  // SAB-mode `updateGesture` path doesn't await a reply, so the worker
  // surfaces snap guides via an unsolicited `gestureSnapLines` after
  // each drain. Empty `snapLines` is meaningful (gesture left a
  // previously-snapped axis); the overlay clears stale guides on it.
  useEffect(() => {
    return props.client.subscribe((msg) => {
      if (msg.kind === "gestureSnapLines") {
        setSnapLines(msg.payload.snapLines);
      }
    });
  }, [props.client, setSnapLines]);

  // Re-fit camera when the document changes (page-id signature).
  const pageIdSig = useMemo(() => props.pageIds.join("|"), [props.pageIds]);
  const lastFitSigRef = useRef<string>("");
  useEffect(() => {
    if (pageIdSig === lastFitSigRef.current) return;
    if (!wrapperRef.current || rects.length === 0) return;
    const { width, height } = wrapperRef.current.getBoundingClientRect();
    if (width < 10 || height < 10) return;
    props.onCameraChange(fitCamera(width, height, documentBounds(rects)));
    lastFitSigRef.current = pageIdSig;
  }, [pageIdSig, rects, props]);

  // Resolve a DOM pointer event to the document-coordinate
  // CanvasPointerEvent a GestureHandler expects.
  const buildToolPointer = useCallback(
    (
      e: React.PointerEvent<HTMLDivElement>,
      maxDelta: number,
    ): CanvasPointerEvent => {
      const rect = e.currentTarget.getBoundingClientRect();
      const [docX, docY] = viewportToDoc(
        props.camera,
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
      const containing = findContainingPage(rects, props.pageIds, docX, docY);
      const pagePoint: [number, number] | null = containing
        ? [docX - containing[1].x, docY - containing[1].y]
        : null;
      // B-08 — carry Pointer-Events pressure/tilt/pointerType straight
      // off the DOM event onto the tool pointer so stylus input reaches
      // draw tools (variable-width strokes, §13.12 Tier B). We read the
      // browser's values verbatim to preserve its semantics (mouse:
      // pressure 0 with no button, 0.5 while held; pen: physical
      // pressure). `??` guards only the synthetic-event case where a
      // field is absent — never overrides a real 0. NOTE: these ride
      // the event OBJECT, not the gesture SAB, which is a wasm-coupled
      // fixed-layout contract (see sab/gesture.ts + B-08 closure).
      const pointerType: "mouse" | "pen" | "touch" =
        e.pointerType === "pen" || e.pointerType === "touch"
          ? e.pointerType
          : "mouse";
      const built: CanvasPointerEvent = {
        pageId: containing ? containing[0] : null,
        pagePoint,
        docPoint: [docX, docY],
        modifiers: {
          shift: e.shiftKey,
          alt: e.altKey,
          cmd: e.metaKey,
          ctrl: e.ctrlKey,
        },
        maxDelta,
        button: e.button,
        target: e.target,
        pressure: e.pressure ?? 0.5,
        tiltX: e.tiltX ?? 0,
        tiltY: e.tiltY ?? 0,
        pointerType,
      };
      // Dev/test hook (B-08 spec). Headless Chromium can't synthesize a
      // physical-stylus pressure, so the Playwright spec asserts the
      // PLUMBING: it reads the last tool pointer the canvas built and
      // checks the new fields are present + typed. Stripped from prod
      // builds; mirrors the `window.__canvas` convention.
      if (!import.meta.env.PROD) {
        (
          globalThis as unknown as { __canvasPointer?: CanvasPointerEvent }
        ).__canvasPointer = built;
      }
      return built;
    },
    [props.camera, props.pageIds, rects],
  );

  // K-1 — deliver a pointer to the ACTIVE edit context in FRAME-CONTENT
  // coordinates. Returns true when the pointer was over the active frame
  // (consumed); false when there is no active context or the pointer is
  // outside its content box.
  const dispatchContentPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, phase: "down" | "move" | "up"): boolean => {
      const active = editContextStack?.active;
      const contribution = editContextStack?.activeContribution;
      if (!active || !contribution) return false;
      const rect = e.currentTarget.getBoundingClientRect();
      const [docX, docY] = viewportToDoc(
        props.camera,
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
      const containing = findContainingPage(rects, props.pageIds, docX, docY);
      if (!containing) return false;
      const [pageId, pageRect] = containing;
      const pageLocal: [number, number] = [docX - pageRect.x, docY - pageRect.y];
      // The active frame's geometry (bounds + itemTransform) carries the
      // page→content transform — same geometry the selection chrome reads.
      const rootKey = `${active.scopeRoot.kind}:${active.scopeRoot.id}`;
      const geom = (props.elementGeometry ?? []).find(
        (g) => g.pageId === pageId && `${g.id.kind}:${g.id.id}` === rootKey,
      );
      if (!geom) return false;
      const content = pageToContentPoint(geom, pageLocal);
      if (!content) return false; // outside the content box
      const ev: ContentPointerEvent = {
        contentPoint: content,
        // Frame-like ElementIds carry a string `id` (the union also covers
        // story-range / table-cell addresses, which never enter a context).
        elementId: typeof active.scopeRoot.id === "string" ? active.scopeRoot.id : "",
        modifiers: {
          shift: e.shiftKey,
          alt: e.altKey,
          cmd: e.metaKey,
          ctrl: e.ctrlKey,
        },
        button: e.button,
      };
      if (phase === "down") contribution.onContentPointerDown?.(ev);
      else if (phase === "move") contribution.onContentPointerMove?.(ev);
      else contribution.onContentPointerUp?.(ev);
      return true;
    },
    [editContextStack, props.camera, props.pageIds, props.elementGeometry, rects],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.button !== 1) return;
      // K-1 — while an edit context that OPTS INTO content pointers is
      // active (has `onContentPointerDown` — sheet's "sheet" context; NOT
      // draw/web, whose tools must keep working), a primary-button press
      // over the active frame goes to the context in content coords; a
      // press OUTSIDE the frame COMMITS the context and falls through so
      // the same click can select what was under it. Contexts WITHOUT the
      // handler skip this block entirely (unchanged tool behavior).
      if (
        e.button === 0 &&
        editContextStack?.active &&
        editContextStack.activeContribution?.onContentPointerDown
      ) {
        if (dispatchContentPointer(e, "down")) {
          e.currentTarget.setPointerCapture(e.pointerId);
          contentGestureRef.current = true;
          return;
        }
        editContextStack.commit();
      }
      // Phase 2 — a handler-bearing tool (Rectangle, …) intercepts the
      // pointer; the legacy select/text/pan path below is skipped.
      //
      // EXCEPT for a tool that declares BOTH a gesture and a legacyKey.
      // The Type tool is the case: its DRAG pulls out a text frame
      // (gesture) and its CLICK places a caret (legacy "text" path), and
      // those are two halves of one tool rather than rival
      // implementations. Without this, adding the gesture silently took
      // the caret away — `onPointerUp` commits the tool drag and RETURNS
      // before the click branch, so double-click word/line selection
      // stopped selecting anything at all.
      const legacyAlso = Boolean(props.toolGesture && props.legacyKeyForTool);
      if (props.toolGesture && e.button === 0 && !legacyAlso) {
        e.currentTarget.setPointerCapture(e.pointerId);
        toolDragRef.current = {
          startPointer: [e.clientX, e.clientY],
          maxDelta: 0,
        };
        props.toolGesture.onDown(buildToolPointer(e, 0));
        return;
      }
      if (props.toolGesture && e.button === 0 && legacyAlso) {
        // Feed the handler AND fall through, so both refs are armed.
        toolDragRef.current = {
          startPointer: [e.clientX, e.clientY],
          maxDelta: 0,
        };
        props.toolGesture.onDown(buildToolPointer(e, 0));
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      const modifiers: PointerModifiers = {
        shift: e.shiftKey,
        cmd: e.metaKey || e.ctrlKey,
      };
      const tool = props.activeTool ?? "select";
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const [docX, docY] = viewportToDoc(props.camera, cx, cy);
      const containing = findContainingPage(rects, props.pageIds, docX, docY);
      // Phase B — middle-button always pans (the convention every
      // creative tool follows). With the select tool: if the pointer
      // landed inside a currently-selected element, start a Translate
      // gesture; otherwise fall through to marquee. Text tool stays
      // pan so the existing typing UX is undisturbed.
      let mode: "pan" | "marquee" | "gesture" = "pan";
      let gestureState:
        | NonNullable<typeof dragStateRef.current>["gestureState"]
        | undefined;
      if (e.button === 1) {
        mode = "pan";
      } else if (props.forcePan || props.zoomClick) {
        // Concept 1 — Hand (or a Space spring-load) pans on any drag;
        // the Zoom tool also pans on drag (its click action is handled
        // in onPointerUp's click branch).
        mode = "pan";
      } else if (tool === "select") {
        // Phase C/D/G — if the pointer landed on a handle (resize
        // handle or the rotation handle), begin the matching gesture
        // for the currently-selected element(s). Single-select uses
        // bounds-resize on corners (Phase C); multi-select corners
        // route to matrix Scale because per-element bounds resize
        // can't compose into a coherent union resize.
        const handleAttr = readHandleAttr(e.target);
        const selection = props.elementSelection ?? [];
        const geometry = props.elementGeometry ?? [];
        const selectedGeom = geometry.length === 1 ? geometry[0] : null;
        const isMultiSelect = geometry.length > 1;
        const bodyHitElement =
          !handleAttr && containing
            ? findSelectedElementUnderPointer(
                selection,
                geometry,
                containing[0],
                [docX - containing[1].x, docY - containing[1].y],
              )
            : null;
        // Phase F / W2.10 — Cmd-drag on the body of a single-selected
        // image-bearing frame drives the content grabber: plain Cmd
        // translates the placed image, Cmd+Alt scales it, Cmd+Shift
        // rotates it (see the gestureSpec branch below). Plain
        // body-drag stays Translate; Cmd-drag on a resize handle stays
        // Scale (Phase D).
        const bodyHitIsImage =
          !handleAttr &&
          selectedGeom?.id.kind === "rectangle" &&
          selectedGeom?.hasImage === true;
        // Build gestureSpec + target list.
        let gestureSpec: GestureType | null = null;
        let targets: ElementId[] = [];
        if (handleAttr === "rotate" && (selectedGeom || isMultiSelect)) {
          gestureSpec = { kind: "rotate" };
          targets = selectedGeom ? [selectedGeom.id] : selection.slice();
        } else if (handleAttr && handleAttr !== "rotate") {
          if (isMultiSelect) {
            // Phase G — multi-select handle drag is always matrix
            // Scale (rotated or not). Holding Cmd still does Scale —
            // it's the only sensible per-element op for N>1.
            gestureSpec = { kind: "scale" };
            targets = selection.slice();
          } else if (selectedGeom) {
            gestureSpec = modifiers.cmd
              ? { kind: "scale" }
              : { kind: "resize", handle: handleAttr };
            targets = [selectedGeom.id];
          }
        } else if (bodyHitElement) {
          // Body drag. For multi-select, move ALL selected items
          // together; for single-select, just the one.
          if (isMultiSelect) {
            gestureSpec = { kind: "translate" };
            targets = selection.slice();
          } else if (modifiers.cmd && bodyHitIsImage) {
            // W2.10 — content-transform gestures ride the SAME content
            // grabber the Phase F TranslateContent uses. Cmd+drag on an
            // image body translates the placed image; layering a
            // modifier promotes it to a rotate/scale of the content,
            // about the frame centroid (the engine's RotateContent /
            // ScaleContent arms, which commit SetProperty{
            // ImageContentTransform} without touching the frame's own
            // bounds or ItemTransform):
            //   Cmd + Alt   → scaleContent
            //   Cmd + Shift → rotateContent (Shift also flows to
            //                 update_gesture, so the rotation snaps to
            //                 15° — the same Shift-constrain the frame
            //                 Rotate uses; an unconstrained content
            //                 rotate is a later affordance).
            // Alt wins over Shift when both are held so the choice is
            // deterministic. Shift stays the live constraint modifier
            // (never consumed here for translate), so plain Cmd+drag is
            // still a free TranslateContent.
            if (e.altKey) {
              gestureSpec = { kind: "scaleContent" };
            } else if (modifiers.shift) {
              gestureSpec = { kind: "rotateContent" };
            } else {
              gestureSpec = { kind: "translateContent" };
            }
            targets = [bodyHitElement];
          } else {
            gestureSpec = { kind: "translate" };
            targets = [bodyHitElement];
          }
        }
        const hit = gestureSpec ? (targets[0] ?? null) : null;
        if (hit && gestureSpec && targets.length > 0) {
          mode = "gesture";
          gestureState = {
            handle: null,
            pendingDelta: [0, 0],
            target: targets,
          };
          // Phase D — Rotate / Scale need an anchor (pointer position
          // at gesture start, in the clicked page's local coords).
          // Translate / Resize don't need one but we send it anyway
          // for future use.
          const anchor = containing
            ? {
                pageId: containing[0],
                pointInPage: [
                  docX - containing[1].x,
                  docY - containing[1].y,
                ] as [number, number],
              }
            : null;
          // Fire-and-forget — the handle returns asynchronously; any
          // pointermove events that arrive before it does are
          // accumulated into `pendingDelta` and flushed on resolve.
          void props.client
            .beginGesture(targets, gestureSpec, anchor)
            .then((handle) => {
              const drag = dragStateRef.current;
              if (!drag || drag.mode !== "gesture" || !drag.gestureState) {
                // Pointer released or escape fired before the worker
                // confirmed; cancel immediately to keep worker state
                // clean.
                void props.client.cancelGesture(handle).catch(() => {});
                return;
              }
              drag.gestureState.handle = handle;
              const pending = drag.gestureState.pendingDelta;
              if (pending[0] !== 0 || pending[1] !== 0) {
                // Step 5e — SAB mode. The worker drains the SAB on its
                // next tick and posts a `gestureSnapLines` notify; the
                // subscription above routes it into `setSnapLines`.
                void props.client
                  .updateGesture(
                    handle,
                    pending,
                    { shift: false, alt: false },
                    "sab",
                  )
                  .catch(() => {});
              }
            })
            .catch(() => {
              // Worker rejected — typically a rotated frame in Phase B.
              // Downgrade to pan so the drag still does *something*
              // sensible.
              const drag = dragStateRef.current;
              if (drag) drag.mode = "pan";
            });
        } else {
          mode = "marquee";
        }
      }
      const marqueeAnchor =
        mode === "marquee" && containing
          ? {
              pageId: containing[0],
              pageX: docX - containing[1].x,
              pageY: docY - containing[1].y,
            }
          : null;
      dragStateRef.current = {
        mode,
        startCam: props.camera,
        startDoc: [docX, docY],
        startPointer: [e.clientX, e.clientY],
        maxDelta: 0,
        modifiers,
        marqueeAnchor,
        gestureState,
      };
    },
    [
      props.activeTool,
      props.camera,
      props.client,
      props.elementGeometry,
      props.elementSelection,
      props.pageIds,
      // A draw tool's gesture handler arrives AFTER the tool is
      // activated; without this dep the callback keeps the stale
      // `toolGesture` (null, from when Select was active) and the
      // first drag silently falls through to the legacy select path
      // — the Rectangle/Line/Pen tools never draw until some other
      // dep (a pan, a selection) happens to rebuild the callback.
      props.toolGesture,
      rects,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // K-1 — while a content gesture owns the pointer, route moves to the
      // active context (content coords) and skip tool/hover logic.
      if (contentGestureRef.current) {
        dispatchContentPointer(e, "move");
        return;
      }
      // Phase 2 — route to the active tool handler while it owns the drag.
      const toolDrag = toolDragRef.current;
      if (toolDrag && props.toolGesture) {
        const d = Math.hypot(
          e.clientX - toolDrag.startPointer[0],
          e.clientY - toolDrag.startPointer[1],
        );
        if (d > toolDrag.maxDelta) toolDrag.maxDelta = d;
        props.toolGesture.onMove(buildToolPointer(e, toolDrag.maxDelta));
        return;
      }
      const drag = dragStateRef.current;
      if (!drag) {
        // plugin-draw D2 — forward HOVER moves to the active handler
        // too (the Pen's rubber band tracks them between clicks).
        // Every handler guards its drag state, so hover moves are
        // inert for drag-only tools; maxDelta 0 keeps click-vs-drag
        // semantics intact.
        if (props.toolGesture) {
          props.toolGesture.onMove(buildToolPointer(e, 0));
        }
        // Concept 1 (Phase 3) — no drag in flight: let the active
        // handler refine the cursor per pointer position (Pen near an
        // anchor ≠ Pen over empty canvas). Imperative style write so a
        // hover doesn't re-render the canvas.
        const hover = props.toolGesture?.hoverCursor;
        if (hover) {
          const refined = hover(buildToolPointer(e, 0));
          const el = wrapperRef.current;
          if (el) el.style.cursor = refined ?? props.cursor ?? "grab";
        }
        return;
      }
      const dx = e.clientX - drag.startPointer[0];
      const dy = e.clientY - drag.startPointer[1];
      const delta = Math.hypot(dx, dy);
      if (delta > drag.maxDelta) drag.maxDelta = delta;
      if (drag.mode === "pan") {
        props.onCameraChange({
          scale: drag.startCam.scale,
          tx: drag.startCam.tx + dx,
          ty: drag.startCam.ty + dy,
        });
      } else if (drag.mode === "gesture") {
        if (drag.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
        // Re-derive the doc-space delta from the original anchor so
        // the gesture stays correct even if the user panned mid-drag.
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const [docX, docY] = viewportToDoc(props.camera, cx, cy);
        const docDelta: [number, number] = [
          docX - drag.startDoc[0],
          docY - drag.startDoc[1],
        ];
        if (!drag.gestureState) return;
        if (drag.gestureState.handle === null) {
          // Begin hasn't resolved yet — buffer the delta; the
          // resolver flushes it once the handle lands.
          drag.gestureState.pendingDelta = docDelta;
        } else {
          // Step 5e — SAB hot path. Fire-and-forget; the worker drains
          // the SAB at ~125 Hz and emits `gestureSnapLines` notifies
          // so the overlay still sees active guides. Falls back to
          // JSON automatically when crossOriginIsolated is false.
          void props.client
            .updateGesture(
              drag.gestureState.handle,
              docDelta,
              // Plan-2 §8.4 — Ctrl bypasses snap. Read `e.ctrlKey`
              // independently of `metaKey`; on macOS the Ctrl key
              // is its own thing (not Cmd), matching InDesign's
              // "hold Ctrl to ignore snap targets" convention.
              { shift: e.shiftKey, alt: e.altKey, disableSnap: e.ctrlKey },
              "sab",
            )
            .catch(() => {});
        }
      } else if (drag.mode === "marquee") {
        if (drag.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
        const anchor = drag.marqueeAnchor;
        if (!anchor) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const [docX, docY] = viewportToDoc(props.camera, cx, cy);
        // Clamp the marquee to the anchor's page so the rect we
        // commit is page-local. The hit-tester only knows pages.
        const pageRect = rects[props.pageIds.indexOf(anchor.pageId)];
        if (!pageRect) return;
        const currentX = clamp(docX - pageRect.x, 0, pageRect.w);
        const currentY = clamp(docY - pageRect.y, 0, pageRect.h);
        const top = Math.min(anchor.pageY, currentY);
        const left = Math.min(anchor.pageX, currentX);
        const bottom = Math.max(anchor.pageY, currentY);
        const right = Math.max(anchor.pageX, currentX);
        setMarqueeRect({
          pageId: anchor.pageId,
          rect: [top, left, bottom, right],
        });
      }
    },
    [props, rects],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // K-1 — end a content gesture: deliver the up to the active context
      // and stop (don't run the tool/click path that would re-select).
      if (contentGestureRef.current) {
        contentGestureRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        dispatchContentPointer(e, "up");
        return;
      }
      // Phase 2 — commit the active tool handler's gesture.
      const toolDrag = toolDragRef.current;
      if (toolDrag && props.toolGesture) {
        toolDragRef.current = null;
        const wasClick = toolDrag.maxDelta <= CLICK_DRAG_THRESHOLD_PX;
        const legacyAlso = Boolean(props.legacyKeyForTool);
        props.toolGesture.onUp(buildToolPointer(e, toolDrag.maxDelta));
        // A dual tool's CLICK belongs to the legacy path (caret, click
        // run, word/line granularity). Its handler has just been told
        // the pointer went up, so it has cancelled itself, and the drag
        // state armed at pointer-down is still there to fall through on.
        if (!(wasClick && legacyAlso)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
          return;
        }
      }
      const drag = dragStateRef.current;
      if (!drag) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragStateRef.current = null;
      // Modifier state can change between down and up (user lifts
      // Shift before releasing). Take whichever was held at either
      // edge — matches industry convention.
      const modifiers: PointerModifiers = {
        shift: drag.modifiers.shift || e.shiftKey,
        cmd: drag.modifiers.cmd || e.metaKey || e.ctrlKey,
      };
      // Click vs drag: if the pointer barely moved, treat it as a
      // click and route through the worker's hit-tester. If a
      // gesture was started at pointerdown (and never moved past the
      // threshold), cancel it so the worker doesn't hold a stale
      // handle.
      if (drag.maxDelta <= CLICK_DRAG_THRESHOLD_PX) {
        setMarqueeRect(null);
        if (drag.mode === "gesture" && drag.gestureState) {
          const stale = drag.gestureState.handle;
          if (stale !== null) {
            void props.client.cancelGesture(stale).catch(() => {});
          }
        }
        // Concept 1 — Zoom tool: a click zooms in around the pointer
        // (Alt-click zooms out) instead of hit-testing.
        if (props.zoomClick) {
          const rect = e.currentTarget.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          const [docX, docY] = viewportToDoc(props.camera, cx, cy);
          const factor = e.altKey ? 1 / 1.25 : 1.25;
          const scale = Math.min(
            64,
            Math.max(0.01, props.camera.scale * factor),
          );
          props.onCameraChange({
            scale,
            tx: cx - docX * scale,
            ty: cy - docY * scale,
          });
          return;
        }
        if (!props.onHit) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        // W2.11 — multi-click granularity (SEL-05). Track the click
        // run so the 2nd consecutive click on the same point selects a
        // word and the 3rd selects the line. Native `detail` is
        // unreliable for the 3rd click, so we count ourselves.
        const clickCount = bumpClickRun(clickRunRef.current, cx, cy, e.timeStamp);
        const isText = (props.activeTool ?? "select") === "text";
        const [docX, docY] = viewportToDoc(props.camera, cx, cy);
        const containing = findContainingPage(rects, props.pageIds, docX, docY);
        if (containing) {
          const [pageId, pageRect] = containing;
          const docPoint: [number, number] = [
            docX - pageRect.x,
            docY - pageRect.y,
          ];
          const filter = isText ? "text" : "any";
          void (async () => {
            try {
              const reply = await props.client.send({
                kind: "hitTest",
                payload: { pageId, docPoint, filter },
              });
              if (reply.kind !== "hitResult") return;
              const hit = reply.payload;
              // C-4 — owned-content interception: a Type-tool click on
              // a metadata-claimed frame (a lowered sheet table, a web
              // frame) enters the OWNING plugin's modal context instead
              // of raw text editing — manual edits must not corrupt
              // content a plugin compiles. Object-type lane only; an
              // empty objectType registry early-outs, so documents
              // without plugins pay nothing.
              if (isText && hit.element) {
                const owned = await tryEnterOwnedContent({
                  element: hit.element,
                  groupChain: [],
                });
                if (owned) return;
              }
              // Text tool, 2nd/3rd click on a story offset → granular
              // selection (word / line) instead of placing a caret.
              if (
                isText &&
                clickCount >= 2 &&
                hit.storyId &&
                hit.offsetWithinStory != null
              ) {
                await applyTextGranularity(
                  props.client,
                  hit.storyId,
                  hit.offsetWithinStory,
                  clickCount,
                  setContentSelection,
                );
                return;
              }
              props.onHit?.({ pageId, docPoint, hit }, modifiers);
            } catch (err) {
              console.warn("hitTest failed:", err);
            }
          })();
        } else {
          props.onHit?.(null, modifiers);
        }
        return;
      }
      // Drag committed. Pan needs no commit work; marquee hands the
      // final rect to the caller; gesture commits via the worker.
      if (drag.mode === "marquee") {
        if (marqueeRect && props.onMarquee) {
          props.onMarquee(marqueeRect.pageId, marqueeRect.rect, modifiers);
        }
        setMarqueeRect(null);
      } else if (drag.mode === "gesture" && drag.gestureState) {
        const handle = drag.gestureState.handle;
        if (handle === null) {
          // Begin hasn't resolved — the resolver path will see the
          // dragState gone and cancel. Nothing to do here.
        } else {
          void props.client
            .commitGesture(handle)
            .then(() => {
              setSnapLines([]);
              props.onGestureCommitted?.();
            })
            .catch(() => {});
        }
      }
    },
    [props, rects, marqueeRect, setContentSelection, tryEnterOwnedContent],
  );

  // GSM-07 / INV-8 — abort the in-flight drag WITHOUT committing.
  // Pointer-capture loss (`pointercancel`) and window blur both land
  // here: the plan requires every begin to reach commit OR abort, and
  // an interrupted gesture must roll back (zero mutation), never commit
  // a phantom op. The pointer-UP path commits; this is the abort twin.
  // Covers all three drag owners: a handler-bearing tool drag (the
  // spine — cancelled via its Escape-equivalent), the legacy worker
  // gesture (cancel the handle), and a marquee (drop the rect). A pan
  // has nothing to roll back.
  const abortActiveDrag = useCallback(() => {
    // Tool-spine draw drag (Rectangle/Pen/…): cancel, don't commit.
    if (toolDragRef.current && props.toolGesture) {
      toolDragRef.current = null;
      props.toolGesture.onCancel();
    }
    const drag = dragStateRef.current;
    if (!drag) return;
    dragStateRef.current = null;
    if (drag.mode === "gesture" && drag.gestureState) {
      const handle = drag.gestureState.handle;
      if (handle !== null) {
        void props.client
          .cancelGesture(handle)
          .then(() => {
            setSnapLines([]);
            props.onGestureCommitted?.();
          })
          .catch(() => {});
      }
      // handle === null: begin hasn't resolved; the resolver sees the
      // dragState gone and cancels the handle itself.
    } else if (drag.mode === "marquee") {
      setMarqueeRect(null);
    }
  }, [props, setSnapLines, setMarqueeRect]);

  // Phase B — Escape cancels the active gesture. Listen at document
  // level so it works while pointer capture is in flight on the
  // wrapper.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const drag = dragStateRef.current;
      if (!drag || drag.mode !== "gesture" || !drag.gestureState) return;
      const handle = drag.gestureState.handle;
      drag.mode = "pan";
      drag.gestureState = undefined;
      if (handle !== null) {
        void props.client
          .cancelGesture(handle)
          .then(() => {
            setSnapLines([]);
            props.onGestureCommitted?.();
          })
          .catch(() => {});
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props]);

  // INV-8 — a window blur (Cmd/Alt-Tab away, devtools focus) while a
  // drag is in flight must abort it. Without this the gesture stays
  // open until the next pointer event, which then commits a stale
  // delta — the classic "alt-tab mid-drag leaves a stuck gesture" bug
  // (gestures.md E2E-11). pointercancel covers capture *theft*; blur
  // covers the case where the pointer never sends a cancel.
  useEffect(() => {
    const onBlur = () => abortActiveDrag();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [abortActiveDrag]);

  // GSM-07 / INV-8 — pointer-capture loss (`pointercancel`: capture
  // stolen, touch cancelled, element removed mid-drag). The browser has
  // already released capture, so unlike pointer-up we don't release it
  // here; we just roll the gesture back. Previously this aliased
  // `onPointerUp`, which COMMITTED the interrupted gesture — a phantom
  // mutation. Now it aborts (the plan's pointercancel → abort).
  const onPointerCancel = useCallback(() => {
    // K-1 — a cancelled content gesture just ends (the context keeps its
    // state; no tool drag to abort).
    if (contentGestureRef.current) {
      contentGestureRef.current = false;
      return;
    }
    abortActiveDrag();
  }, [abortActiveDrag]);

  function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** Phase B — return the first selected element whose AABB
   * (transformed corners → axis-aligned bbox) contains the page-local
   * pointer. AABB rather than oriented-rect: fast, no transform math
   * in TS, and a false positive at the AABB corner of a rotated frame
   * is acceptable since the worker's `begin_gesture` then rejects it.
   * Matches what the renderer paints for the selection chrome at the
   * same point in time. */
  function findSelectedElementUnderPointer(
    selection: ReadonlyArray<ElementId>,
    geometry: ReadonlyArray<ElementGeometryItem>,
    pageId: PageId,
    pageLocal: [number, number],
  ): ElementId | null {
    const inSel = new Set(selection.map((e) => `${e.kind}:${e.id}`));
    for (const g of geometry) {
      if (g.pageId !== pageId) continue;
      if (!inSel.has(`${g.id.kind}:${g.id.id}`)) continue;
      const [top, left, bottom, right] = g.bounds;
      const corners: Array<[number, number]> = [
        applyAffineLocal(g.itemTransform, left, top),
        applyAffineLocal(g.itemTransform, right, top),
        applyAffineLocal(g.itemTransform, right, bottom),
        applyAffineLocal(g.itemTransform, left, bottom),
      ];
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const [x, y] of corners) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (
        pageLocal[0] >= minX &&
        pageLocal[0] <= maxX &&
        pageLocal[1] >= minY &&
        pageLocal[1] <= maxY
      ) {
        return g.id;
      }
    }
    return null;
  }

  function applyAffineLocal(
    m: [number, number, number, number, number, number] | null | undefined,
    x: number,
    y: number,
  ): [number, number] {
    if (!m) return [x, y];
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  /** Phase C/D — read the `data-handle` attribute from a pointer
   * event target. Returns the matching `ResizeHandle`, `"rotate"`
   * for the Phase D rotation handle, or `null`. The Overlay tags
   * both the visible handle and a larger hit-area rect with the same
   * attribute, so a pointerdown anywhere in the grab zone fires
   * this branch. */
  function readHandleAttr(
    target: EventTarget | null,
  ): ResizeHandle | "rotate" | null {
    if (!(target instanceof Element)) return null;
    const v = target.getAttribute("data-handle");
    if (!v) return null;
    if (
      v === "north" ||
      v === "south" ||
      v === "east" ||
      v === "west" ||
      v === "northEast" ||
      v === "northWest" ||
      v === "southEast" ||
      v === "southWest" ||
      v === "rotate"
    ) {
      return v;
    }
    return null;
  }

  function findContainingPage(
    rects: ReadonlyArray<PageRect>,
    ids: ReadonlyArray<PageId>,
    docX: number,
    docY: number,
  ): [PageId, PageRect] | null {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (
        docX >= r.x &&
        docX <= r.x + r.w &&
        docY >= r.y &&
        docY <= r.y + r.h
      ) {
        return [ids[i], r];
      }
    }
    return null;
  }

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.005);
        props.onCameraChange(zoomAt(props.camera, cx, cy, factor));
      } else {
        props.onCameraChange({
          scale: props.camera.scale,
          tx: props.camera.tx - e.deltaX,
          ty: props.camera.ty - e.deltaY,
        });
      }
    },
    [props],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Phase H — double-click on a frame nested inside a group →
      // select the whole outermost containing group as a unit.
      if (!props.onDoubleClickGroup) return;
      // W2.11 — with the Type tool, double-/triple-click is text
      // granularity (handled in onPointerUp's click branch); skip the
      // group-descent path so the two don't fight over the same click.
      if ((props.activeTool ?? "select") === "text") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const [docX, docY] = viewportToDoc(props.camera, cx, cy);
      const containing = findContainingPage(rects, props.pageIds, docX, docY);
      if (!containing) return;
      const [pageId, pageRect] = containing;
      void (async () => {
        try {
          const reply = await props.client.send({
            kind: "hitTest",
            payload: {
              pageId,
              docPoint: [docX - pageRect.x, docY - pageRect.y],
              filter: "any",
            },
          });
          if (reply.kind !== "hitResult") return;
          const chain = reply.payload.groupChain ?? [];
          const element = reply.payload.element ?? null;
          // W3.2 — consult the edit-context / object-type registries
          // FIRST: a webFrame (object type) opens its source context, a
          // polygon (edit context by kind) enters vectorGraphic. Only
          // when nothing claims the double-click do we descend the group.
          const claimed = await tryEnterEditContext({
            element,
            groupChain: chain,
          });
          if (claimed) return;
          if (chain.length > 0) {
            props.onDoubleClickGroup?.(chain[0], element);
          }
        } catch (err) {
          // Same fail-quiet approach as the click hitTest.
          console.warn("doubleClick hitTest failed:", err);
        }
      })();
    },
    [props, rects, tryEnterEditContext],
  );

  return (
    <div
      ref={wrapperRef}
      // B-08 — the Playwright pressure/tilt plumbing spec targets this
      // host to dispatch a synthetic stylus pointer event and read
      // `__canvasPointer`.
      data-testid="viewport-canvas-host"
      // Phase 3 — the active tool's base cursor overrides the default
      // pan affordance; the gesture handler may refine it per position.
      style={
        props.cursor ? { ...wrapperStyle, cursor: props.cursor } : wrapperStyle
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      {/* data-paged-canvas: stable selector for the demo-capture frame-tap /
          rrweb replay to locate the document canvas (see demo-replay). */}
      <canvas ref={canvasRef} style={canvasStyle} data-paged-canvas="" />
      <OverlayHost
        camera={props.camera}
        pageIds={props.pageIds}
        pageRects={rects}
        width={wrapperRef.current?.clientWidth ?? 0}
        height={wrapperRef.current?.clientHeight ?? 0}
      />
      <ViewportHud
        camera={props.camera}
        pageCount={props.pageIds.length}
        pageIds={props.pageIds}
        pageRects={rects}
        selection={props.selection ?? null}
        fps={props.fps ?? 0}
        gpuActive={props.gpuActive ?? null}
        anchorCount={
          props.resolution ? Object.keys(props.resolution.numbering).length : 0
        }
        footnoteCount={props.resolution?.footnoteCount ?? 0}
        runningHeaders={props.resolution?.runningHeaders ?? []}
        layoutCacheStats={props.layoutCacheStats ?? null}
      />
    </div>
  );
}

const MULTI_CLICK_MS = 500;
const MULTI_CLICK_SLOP_PX = 4;

/** Advance the consecutive-click counter for SEL-05 granularity. A
 *  click within `MULTI_CLICK_MS` of, and `MULTI_CLICK_SLOP_PX` from,
 *  the previous one bumps the count (capped at 3 — triple-click is the
 *  coarsest granularity); otherwise it restarts at 1. Mutates and
 *  returns the new count. */
function bumpClickRun(
  run: { t: number; x: number; y: number; count: number },
  x: number,
  y: number,
  now: number,
): number {
  const near =
    Math.abs(x - run.x) <= MULTI_CLICK_SLOP_PX &&
    Math.abs(y - run.y) <= MULTI_CLICK_SLOP_PX;
  const inTime = now - run.t <= MULTI_CLICK_MS;
  run.count = near && inTime ? Math.min(3, run.count + 1) : 1;
  run.t = now;
  run.x = x;
  run.y = y;
  return run.count;
}

/**
 * W2.11 / SEL-05 — set a word (double-click) or paragraph (triple-click)
 * range selection on a story.
 *
 * Aftercare-A: protocol v31 added `requestWordBounds`, so double-click
 * selects the real UAX-29 WORD containing the offset (story-local byte
 * `[start, end)`); a double-click on a whitespace run selects that whole
 * whitespace run (the engine's segmentation contract).
 *
 * W2.9: protocol v35 added `requestParagraphBounds`, so triple-click now
 * selects the whole PARAGRAPH containing the offset — spanning every
 * wrapped line — instead of just the visual line. The span is story-local
 * bytes `[start, end)` (the inter-paragraph `\n` is the boundary and is
 * excluded), so typing replaces the paragraph. The `cell` qualifier (v35)
 * flows through so a triple-click inside a table cell selects THAT cell's
 * paragraph. If the engine can't resolve a paragraph (e.g. an unbuilt
 * story) we fall back to the line extent so triple-click still yields a
 * non-empty range. Every branch resolves a non-empty range, which is what
 * callers depend on (replace-on-type works).
 */
async function applyTextGranularity(
  client: CanvasClient,
  storyId: string,
  offset: number,
  clickCount: number,
  setContentSelection: (s: {
    storyId: string;
    start: number;
    end: number;
    cell?: TextCellAddr | null;
    affinity?: boolean;
  } | null) => void,
  cell: TextCellAddr | null = null,
): Promise<void> {
  try {
    if (clickCount >= 3) {
      // Triple-click → paragraph granularity (v35 paragraph-bounds wire).
      const para = await client.paragraphBounds(storyId, offset, cell);
      if (para) {
        setContentSelection({
          storyId,
          start: para.start,
          end: para.end,
          cell,
          affinity: false,
        });
        return;
      }
      // Fallback: paragraph unresolved → line extent (still non-empty).
      const bounds = await client.lineBounds(storyId, offset, cell);
      if (!bounds) return;
      setContentSelection({
        storyId,
        start: bounds.lineStart,
        end: bounds.lineEnd,
        cell,
        affinity: false,
      });
      return;
    }
    // Double-click → word granularity (UAX-29 segmentation).
    const word = await client.wordBounds(storyId, offset, cell);
    if (!word) return;
    setContentSelection({
      storyId,
      start: word.start,
      end: word.end,
      cell,
      affinity: false,
    });
  } catch {
    /* worker reload / disconnect — leave the selection put */
  }
}

function ViewportHud(props: {
  camera: Camera;
  pageCount: number;
  pageIds: ReadonlyArray<PageId>;
  pageRects: ReadonlyArray<PageRect>;
  selection: SelectionState | null;
  fps: number;
  gpuActive: boolean | null;
  anchorCount: number;
  footnoteCount: number;
  runningHeaders: ReadonlyArray<RunningHeader>;
  layoutCacheStats: LayoutCacheStats | null;
}) {
  const sel = props.selection;
  const gpuBadge =
    props.gpuActive === null
      ? { label: "…", color: "var(--status-draft)" }
      : props.gpuActive
        ? { label: "GPU", color: "var(--status-approved)" }
        : { label: "CPU", color: "var(--status-review)" };
  const fpsColor =
    props.fps === 0
      ? "var(--status-draft)"
      : props.fps >= 55
        ? "var(--status-approved)"
        : props.fps >= 30
          ? "var(--status-review)"
          : "var(--status-error)";
  return (
    <div style={hudStyle}>
      <span style={{ color: gpuBadge.color, fontWeight: 600 }}>
        {gpuBadge.label}
      </span>
      {props.fps > 0 && (
        <span style={{ color: fpsColor }}>{props.fps} fps</span>
      )}
      <span>{props.pageCount} pages</span>
      {props.layoutCacheStats &&
        props.layoutCacheStats.hits + props.layoutCacheStats.misses > 0 && (
          <CacheBadge stats={props.layoutCacheStats} />
        )}
      {props.anchorCount > 0 && (
        <span style={{ color: "var(--status-approved)" }}>
          {props.anchorCount} anchors
        </span>
      )}
      {props.footnoteCount > 0 && (
        <span style={{ color: "var(--status-progress)" }}>
          {props.footnoteCount} fn
        </span>
      )}
      {(() => {
        // Show the running header for the page closest to viewport
        // centre — gives a "where am I" anchor for long documents.
        const [vw, vh] = [
          // approximate viewport size from camera scale + canvas dims
          800, 600,
        ];
        const cx = vw / 2;
        const cy = vh / 2;
        const docX =
          (cx - props.camera.tx) / Math.max(1e-6, props.camera.scale);
        const docY =
          (cy - props.camera.ty) / Math.max(1e-6, props.camera.scale);
        let currentIdx = 0;
        let bestDistSq = Infinity;
        for (let i = 0; i < props.pageRects.length; i++) {
          const r = props.pageRects[i];
          const px = r.x + r.w / 2;
          const py = r.y + r.h / 2;
          const dsq = (px - docX) ** 2 + (py - docY) ** 2;
          if (dsq < bestDistSq) {
            bestDistSq = dsq;
            currentIdx = i;
          }
        }
        const header = props.runningHeaders[currentIdx];
        if (header?.text) {
          const truncated =
            header.text.length > 24
              ? `${header.text.slice(0, 23)}…`
              : header.text;
          return (
            <span style={{ color: "var(--status-review)" }}>§ {truncated}</span>
          );
        }
        return null;
      })()}
      <span>{(props.camera.scale * 100).toFixed(0)}%</span>
      <span>
        {props.camera.tx.toFixed(0)}, {props.camera.ty.toFixed(0)}
      </span>
      {sel && (
        <span style={hudSelStyle}>
          {sel.hit.frameId
            ? `frame ${sel.hit.frameId}`
            : `page ${sel.pageId} (no frame)`}
        </span>
      )}
    </div>
  );
}

/**
 * Phase 4 Step 2 — visualise the per-paragraph layout cache win.
 *
 * Shows `hits/total` for the most recent mutation/undo/redo rebuild.
 * Green when ≥ 90% of paragraphs hit (typing-class edit), amber
 * 50-89% (style change or larger), red below 50% (cold or
 * thrashed cache).
 */
function CacheBadge(props: { stats: LayoutCacheStats }) {
  const total = props.stats.hits + props.stats.misses;
  if (total === 0) return null;
  const ratio = props.stats.hits / total;
  const color =
    ratio >= 0.9
      ? "var(--status-approved)"
      : ratio >= 0.5
        ? "var(--status-review)"
        : "var(--status-error)";
  const pct = Math.round(ratio * 100);
  const ms = props.stats.rebuildMs;
  // AC-E-1 budget — 32 ms per typed character. Green under, amber close,
  // red over.
  const msColor =
    ms <= 16
      ? "var(--status-approved)"
      : ms <= 32
        ? "var(--status-review)"
        : "var(--status-error)";
  return (
    <>
      <span
        style={{ color }}
        title={`layout cache: ${props.stats.hits} hits / ${props.stats.misses} misses (${props.stats.len} entries)`}
      >
        cache {pct}% ({props.stats.hits}/{total})
      </span>
      <span
        style={{ color: msColor }}
        title="last rebuild wall-clock; AC-E-1 budget = 32 ms"
      >
        {ms.toFixed(1)} ms
      </span>
    </>
  );
}

const wrapperStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: "var(--canvas-surround)",
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
};

const canvasStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  display: "block",
};

// Floating UI per the design system: an elevated surface with a
// hairline border (theme-aware, so the status tokens keep contrast
// in BOTH themes — the old dark glass washed them out on light).
const hudStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 8,
  right: 8,
  display: "flex",
  gap: 12,
  background: "var(--elevated)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  padding: "4px 10px",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  pointerEvents: "none",
};

const hudSelStyle: React.CSSProperties = {
  color: "var(--status-review)", // amber — highlights the click result
};
