// W2.8 — guide creation / drag (GD-01…03).
//
// State store shared between the ruler hit zones (CockpitLayout's
// HRuler / VRulerStrip), the headless GuideDragController, and the
// guide overlay. Holds two things:
//
//   1. An OPTIMISTIC mirror of the document's guides. The engine
//      supports insertGuide / moveGuide / deleteGuide (protocol v28)
//      but the read surface — `DocumentHandle.rulerGuides` — is a
//      load-time snapshot with no per-guide id, and there is no
//      in-session re-query after a mutation. So the controller keeps
//      a client-side mirror it updates as it dispatches each
//      mutation, and the overlay renders it on top of the (still
//      authoritative for load-time guides) handle guides. See the
//      WIRE GAP note at the bottom of this file.
//
//   2. The LIVE drag (preview line + what a release will do). A drag
//      is either a creation (dragged out of a ruler) or a move of an
//      existing optimistic guide. Both publish a preview the overlay
//      draws and resolve to exactly one mutation (or zero on cancel)
//      on release.
//
// Writers: the ruler strips (beginCreate), the overlay's per-guide
// hit lines (beginMove), and the controller (updateDrag / settle /
// cancel + the mirror sync). Readers: the overlay + the controller.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { PageId } from "@paged-media/client";

export type GuideOrientation = "horizontal" | "vertical";

/**
 * A guide in the optimistic mirror. `id` is the engine's positional
 * address — `Guide/<spreadId>/<index>` — the same string moveGuide /
 * deleteGuide expect. `position` is the spread-local coordinate on
 * the perpendicular axis (x for vertical, y for horizontal), in pt,
 * matching the engine's `position` argument. `pageId` is the page
 * the guide visually belongs to (the overlay draws it across that
 * page's rect); kept alongside `spreadId` so a single-page-per-spread
 * document — the common case — renders without a spread→page map.
 */
export interface OptimisticGuide {
  id: string;
  spreadId: string;
  orientation: GuideOrientation;
  pageId: PageId;
  /** Spread-local coordinate on the perpendicular axis, pt. */
  position: number;
}

/**
 * The live drag. `kind: "create"` was dragged out of a ruler and
 * commits an insertGuide on release (unless released back over the
 * ruler — then it's discarded). `kind: "move"` grabbed a placed
 * guide and commits a moveGuide, OR a deleteGuide when released back
 * over the ruler (GD-02). Both track the current preview position in
 * document-space pt so the overlay can draw the line; `previewPageId`
 * + `previewPosition` are page-local-resolved by the controller each
 * update.
 */
export interface GuideDragState {
  kind: "create" | "move";
  orientation: GuideOrientation;
  /** For a move: the guide being repositioned (so we can restore it
   *  on Escape and address it for moveGuide / deleteGuide). */
  guide: OptimisticGuide | null;
  /** Live preview, in DOCUMENT-space pt (the axis the guide moves on).
   *  The overlay spans the relevant page; null before the first move. */
  previewDocCoord: number | null;
  /** Page the preview currently sits over (null = over the pasteboard
   *  / outside any page). Drives which page rect the overlay spans and
   *  which page a created guide lands on. */
  previewPageId: PageId | null;
  /** Page-local coordinate of the preview on the perpendicular axis,
   *  pt — what insertGuide / moveGuide commit. null when off-page. */
  previewPosition: number | null;
  /** true while the pointer is over a ruler strip — a release here
   *  cancels a create or deletes a moved guide (GD-01 / GD-02). */
  overRuler: boolean;
}

interface GuideDragContextValue {
  /** The optimistic guide mirror (client-side; see file header). */
  guides: ReadonlyArray<OptimisticGuide>;
  /** Replace the whole mirror (the controller seeds it from the
   *  document handle on load, and rewrites it after each mutation). */
  setGuides: React.Dispatch<React.SetStateAction<OptimisticGuide[]>>;

  /** The live drag, or null when idle. */
  drag: GuideDragState | null;

  /** Start a creation drag out of a ruler. `orientation` is the guide
   *  that ruler produces (HRuler → horizontal, VRuler → vertical). */
  beginCreate(orientation: GuideOrientation): void;
  /** Start a move drag on a placed guide. */
  beginMove(guide: OptimisticGuide): void;
  /** Patch the live drag's preview fields (controller, per pointer
   *  move). No-op when no drag is active. */
  updateDrag(patch: Partial<GuideDragState>): void;
  /** Clear the live drag (the controller calls this after it has
   *  dispatched any mutation, or on cancel). */
  clearDrag(): void;
}

const Context = createContext<GuideDragContextValue | null>(null);

export function GuideDragProvider({ children }: PropsWithChildren) {
  const [guides, setGuides] = useState<OptimisticGuide[]>([]);
  const [drag, setDrag] = useState<GuideDragState | null>(null);
  // Mirror the live drag in a ref so the controller's window
  // listeners (registered once per drag) read the freshest state
  // without re-subscribing on every preview tick.
  const dragRef = useRef<GuideDragState | null>(null);
  dragRef.current = drag;

  const beginCreate = useCallback((orientation: GuideOrientation) => {
    const next: GuideDragState = {
      kind: "create",
      orientation,
      guide: null,
      previewDocCoord: null,
      previewPageId: null,
      previewPosition: null,
      overRuler: true,
    };
    dragRef.current = next;
    setDrag(next);
  }, []);

  const beginMove = useCallback((guide: OptimisticGuide) => {
    const next: GuideDragState = {
      kind: "move",
      orientation: guide.orientation,
      guide,
      previewDocCoord: null,
      previewPageId: guide.pageId,
      previewPosition: guide.position,
      overRuler: false,
    };
    dragRef.current = next;
    setDrag(next);
  }, []);

  const updateDrag = useCallback((patch: Partial<GuideDragState>) => {
    setDrag((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      dragRef.current = next;
      return next;
    });
  }, []);

  const clearDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
  }, []);

  const value = useMemo<GuideDragContextValue>(
    () => ({
      guides,
      setGuides,
      drag,
      beginCreate,
      beginMove,
      updateDrag,
      clearDrag,
    }),
    [guides, drag, beginCreate, beginMove, updateDrag, clearDrag],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useGuideDrag(): GuideDragContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useGuideDrag called outside GuideDragProvider");
  }
  return ctx;
}

/** Optional variant — returns null if no provider is mounted, so the
 *  overlay + rulers degrade gracefully in a host that hasn't wired
 *  the guide feature (e.g. the slim viewer reusing a ruler). */
export function useOptionalGuideDrag(): GuideDragContextValue | null {
  return useContext(Context);
}

// ── WIRE GAP (capability matrix) ──────────────────────────────────
// The engine ops insertGuide / moveGuide / deleteGuide are supported
// (capability-matrix: protocol v28). What is NOT surfaced is an
// in-session READ of guides keyed by id: `DocumentHandle.rulerGuides`
// is a load-time snapshot carrying only { pageId, orientation,
// location } (no guide id), and there is no re-query after a
// mutation. The optimistic mirror in this context bridges that gap
// for the UI. The cross-boundary truth is still observable by
// RELOADING the document (loadDocument re-reads rulerGuides from the
// post-mutation model) — which is how the GD specs assert the engine
// actually persisted the guide. When core surfaces a live, id-keyed
// guides collection, the controller can replace the mirror with a
// `mutationApplied`-driven refresh and the reload step drops out.
