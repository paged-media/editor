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

import {
  createContext,
  useCallback,
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

/**
 * The overlay TEXT primitive (plugin RFI "overlay carries shapes only")
 * — an on-canvas readout in the tool-preview family (paged.draw's
 * Measure tool HUD; future: Dimension tool, crop HUDs, Ruler markers).
 * `x`/`y` are page-local pt (the text BASELINE anchor); the overlay
 * shifts by the page origin and renders at constant SCREEN size (the
 * page-caption idiom), so `size` is screen px, not document pt.
 * PLAIN TEXT ONLY — the renderer sanitizes (control chars stripped,
 * no markup). Mirrors the plugin-api `ToolPreviewText` variant; the
 * editor's union must stay a superset of the contract so the handle
 * assigns (plugin-api-compat).
 */
export interface ToolPreviewText {
  /** Explicit discriminant (the vocabulary's first — older variants
   *  discriminate structurally). */
  kind: "text";
  pageId: PageId;
  /** Text anchor x, page-local pt. */
  x: number;
  /** Text BASELINE y, page-local pt. */
  y: number;
  /** The label. Plain text; the renderer sanitizes + truncates. */
  text: string;
  /** Font size in screen px (constant under zoom). Default 11. */
  size?: number;
  /** Horizontal anchoring relative to `x` (SVG text-anchor). Default "start". */
  anchor?: "start" | "middle" | "end";
  /** Render a small backing plate behind the label for legibility. */
  background?: boolean;
}

/** What a tool handler can publish as its in-progress preview. */
export type ToolPreviewShape =
  | MarqueeRectPageLocal
  | ToolPreviewPolyline
  | ToolPreviewGrid
  | ToolPreviewPath
  | ToolPreviewText;

/**
 * K-9 — what the tool-preview SLOT holds: one shape (every built-in
 * tool) or a LIST (a plugin publishing geometry AND a label at once,
 * or a Shape Builder shading every collected face). One slot, two
 * writers — never two stacked overlay layers. Shapes render in array
 * order, first = bottom-most, and each carries its own `pageId`, so a
 * list may span pages.
 */
export type ToolPreviewSlot = ToolPreviewShape | readonly ToolPreviewShape[];

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
   *  tool-preview overlay contribution. Holds a LIST when the writer
   *  used `setToolPreviews` (K-9). */
  toolPreview: ToolPreviewSlot | null;
  setToolPreview: (value: ToolPreviewShape | null) => void;
  /** K-9 — publish MANY shapes into the SAME slot: the gap that made a
   *  plugin tool choose between showing geometry and showing a label
   *  (paged.draw's Measure swapped one for the other at pointer-up; its
   *  Shape Builder could highlight one face but not shade the collected
   *  set). Replaces whatever the slot holds; `null` or `[]` clears it. */
  setToolPreviews: (value: readonly ToolPreviewShape[] | null) => void;
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
  const [toolPreview, setToolPreviewSlot] = useState<ToolPreviewSlot | null>(
    null,
  );

  // Both writers land in the ONE slot. Single-shape callers keep the
  // exact signature they always had (every built-in tool handler is
  // untouched); the list writer normalizes an empty list to null so
  // "clear" is one state everywhere.
  const setToolPreview = useCallback(
    (value: ToolPreviewShape | null) => setToolPreviewSlot(value),
    [],
  );
  const setToolPreviews = useCallback(
    (value: readonly ToolPreviewShape[] | null) =>
      setToolPreviewSlot(value && value.length > 0 ? value : null),
    [],
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
      setToolPreviews,
    }),
    [
      hitSelection,
      marqueeRect,
      snapLines,
      toolPreview,
      setToolPreview,
      setToolPreviews,
    ],
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
