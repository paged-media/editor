import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type {
  HitResult,
  PageId,
  SnapLine,
} from "@paged-media/client";

/**
 * Result of a click hit-test, kept for the overlay's click-marker
 * chrome. `docPoint` is the document-space click location (page-
 * local pt shifted by the page origin); `hit` is the worker's
 * resolved hit — element + optional frame bounds. Lives in shell
 * because the overlay layer that reads it lives in shell.
 */
export interface SelectionState {
  pageId: PageId;
  docPoint: [number, number];
  hit: HitResult;
}

/**
 * Live marquee rect rendered while the user drags. Page-local pt;
 * the overlay shifts by the page origin at draw time.
 */
export interface MarqueeRectPageLocal {
  pageId: PageId;
  /** `[top, left, bottom, right]` in page-local pt. */
  rect: [number, number, number, number];
}

/**
 * Editor-ops — a polyline tool preview (Line drag, Pencil stroke,
 * Gradient axis). Page-local pt vertices; the overlay shifts by the
 * page origin at draw time, same as the rect variant.
 */
export interface ToolPreviewPolyline {
  pageId: PageId;
  points: ReadonlyArray<[number, number]>;
  /** Draw the closing edge (Pen/Polygon previews). */
  close?: boolean;
}

/**
 * Editor-ops — a gridify tool preview (W2.7): the N×M cell outlines a
 * rectangle/frame drag splits into while arrow keys are held (DR-05).
 * Each `cell` is `[top,left,bottom,right]` page-local pt, already
 * gutter-inset; the overlay shifts by the page origin at draw time and
 * strokes each as a rect, same family as the single rubber-band.
 */
export interface ToolPreviewGrid {
  pageId: PageId;
  cells: ReadonlyArray<[number, number, number, number]>;
}

/**
 * B-07 — a path/cubic tool preview (in-progress pen). Carries the true
 * anchor/handle run so the overlay renders ONE real <path> of `C`
 * commands instead of a flattened polyline (exact at any zoom, no
 * per-pointermove sampling). `anchors` is the engine's `PathAnchorSpec`
 * form — page-local pt, the SAME run `insertPath` commits. Mirrors the
 * plugin-api `ToolPreviewPath` variant; the editor's union must stay a
 * superset of the contract so the handle assigns (plugin-api-compat).
 */
export interface ToolPreviewPath {
  pageId: PageId;
  anchors: ReadonlyArray<{
    anchor: [number, number];
    left: [number, number];
    right: [number, number];
  }>;
  /** Close the contour (draw the cubic from the last anchor back to 0). */
  close?: boolean;
  /** Dashed stroke instead of the default solid (preview vocabulary). */
  dashed?: boolean;
}

/** What a tool handler can publish as its in-progress preview. */
export type ToolPreviewShape =
  | MarqueeRectPageLocal
  | ToolPreviewPolyline
  | ToolPreviewGrid
  | ToolPreviewPath;

interface OverlaySignalsValue {
  /** Last click hit-result. Cleared when the user clicks empty space. */
  hitSelection: SelectionState | null;
  setHitSelection: (value: SelectionState | null) => void;
  /** Active drag marquee, or null when no drag is in progress. */
  marqueeRect: MarqueeRectPageLocal | null;
  setMarqueeRect: (value: MarqueeRectPageLocal | null) => void;
  /** Snap guides from the active gesture. Empty when not snapping. */
  snapLines: ReadonlyArray<SnapLine>;
  setSnapLines: (value: ReadonlyArray<SnapLine>) => void;
  /** Concept 1 — the active tool handler's in-progress preview (the
   *  Rectangle rubber-band, the Line/Pencil polyline, …). Writer: the
   *  gesture handler via `paged.overlaySignals`; reader: the
   *  tool-preview overlay contribution. */
  toolPreview: ToolPreviewShape | null;
  setToolPreview: (value: ToolPreviewShape | null) => void;
}

const Context = createContext<OverlaySignalsValue | null>(null);

/**
 * Holds the transient overlay signals that aren't already in a
 * dedicated context (selection, document, content-selection).
 * Writers: ViewportCanvas (pointer + drag handling). Readers:
 * overlay contributions in `packages/shell/src/overlays/`.
 *
 * Keeping this in a context — instead of threading the values
 * through `OverlayHost` props — means a new overlay contribution
 * can subscribe to only the signals it actually needs and skip the
 * render churn for the rest.
 */
export function OverlaySignalsProvider({ children }: PropsWithChildren) {
  const [hitSelection, setHitSelection] = useState<SelectionState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRectPageLocal | null>(
    null,
  );
  const [snapLines, setSnapLines] = useState<ReadonlyArray<SnapLine>>([]);
  const [toolPreview, setToolPreview] = useState<ToolPreviewShape | null>(
    null,
  );

  const value = useMemo<OverlaySignalsValue>(
    () => ({
      hitSelection,
      setHitSelection,
      marqueeRect,
      setMarqueeRect,
      snapLines,
      setSnapLines,
      toolPreview,
      setToolPreview,
    }),
    [hitSelection, marqueeRect, snapLines, toolPreview],
  );

  // Dev hook. PagedShell builds `__canvas` ABOVE this provider, so it
  // can't reach the overlay signals; tests that drive a preview straight
  // into the overlay (B-07 path/cubic preview spec) read the writer here
  // off `__overlaySignals`. Stripped from production via Vite's PROD
  // constant; typed loosely so shell's tsconfig (no Vite ambient types)
  // still passes.
  useEffect(() => {
    const isProd =
      (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD ===
      true;
    if (isProd) return;
    (globalThis as unknown as { __overlaySignals?: unknown }).__overlaySignals =
      value;
    return () => {
      delete (globalThis as unknown as { __overlaySignals?: unknown })
        .__overlaySignals;
    };
  }, [value]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOverlaySignals(): OverlaySignalsValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useOverlaySignals called outside OverlaySignalsProvider");
  }
  return ctx;
}

/**
 * Optional variant used inside overlay components — returns `null`
 * if no provider is mounted, so an overlay can render gracefully
 * when its host hasn't been wired up yet (during partial migrations).
 */
export function useOptionalOverlaySignals(): OverlaySignalsValue | null {
  return useContext(Context);
}
