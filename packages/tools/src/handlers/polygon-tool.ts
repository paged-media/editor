// Editor-ops — the Polygon tool's gesture handler (W2.6).
//
// Drag → a live N-gon (or star, when star inset > 0) inscribed in the
// drag bounds, previewed as a closed polyline → ONE `insertPath {
// pageId, anchors, open: false, smooth: false }` Mutation on
// pointer-up. The polygon's corner vertices become PathAnchorSpec with
// collapsed handles (left = right = anchor), so the engine stores them
// as straight corner segments. Lifecycle mirrors the Rectangle handler
// (page-anchored drag, single mutation on release, mutateAndSelect,
// Escape cancels, spring-load suspend keeps the gesture).
//
// Tool options (T8): `sides` and `starInset` are tool-scoped settings,
// read from `paged.toolSettings` keyed by this tool's id — app state,
// NOT a document mutation (the double-click ToolOptionsPopover writes
// them). Star semantics: inner radius = outer × (1 − starInset/100),
// vertices alternate outer/inner (2·sides anchors); a 0 inset is a
// plain N-gon (sides anchors).
//
// Modifiers (gestures.md DR-02): Shift constrains the bounds to a
// square via the shared `drawBoundsFor` (Alt-from-centre rides along
// for free — same helper as the Ellipse tool).

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import type { PathAnchorSpec } from "@paged-media/client";

import {
  beginPageDrag,
  drawBoundsFor,
  endLocalFor,
  mutateAndSelect,
  CLICK_DRAG_THRESHOLD_PX,
  type Bounds,
  type PageDrag,
} from "./shared";

const TOOL_ID = "paged.tool.polygon";
/** InDesign's default polygon is a hexagon; star inset defaults off. */
const DEFAULT_SIDES = 6;
const DEFAULT_STAR_INSET = 0;
const MIN_SIDES = 3;
const MAX_SIDES = 100;
const MIN_SIZE_PT = 1;

/** Clamp a tool-setting number, falling back to `fallback` when the
 *  store has no (or a non-numeric) value yet. */
function settingNumber(
  paged: PagedEditor,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = paged.toolSettings.getValue(TOOL_ID, key);
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * The polygon's corner vertices in page-local pt, inscribed in
 * `bounds`. A plain N-gon walks `sides` points around the inscribed
 * ellipse; a star (inset > 0) walks 2·sides points alternating the
 * outer radius and an inner radius scaled by (1 − inset). The first
 * vertex points straight up (−90°), InDesign's orientation, so an even
 * polygon sits flat-bottomed.
 */
function polygonVertices(
  bounds: Bounds,
  sides: number,
  starInset: number,
): [number, number][] {
  const [top, left, bottom, right] = bounds;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const rx = (right - left) / 2;
  const ry = (bottom - top) / 2;
  const inner = 1 - starInset / 100;
  const star = starInset > 0;
  const count = star ? sides * 2 : sides;
  const start = -Math.PI / 2; // 12 o'clock
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const t = start + (i / count) * Math.PI * 2;
    // Even indices ride the outer radius, odd indices the inner one
    // (a no-op scale of 1 when not a star).
    const scale = star && i % 2 === 1 ? inner : 1;
    points.push([cx + rx * scale * Math.cos(t), cy + ry * scale * Math.sin(t)]);
  }
  return points;
}

/** Corner anchor — handles collapsed onto the point, so the engine
 *  stores straight segments between vertices. */
function cornerAnchor([x, y]: [number, number]): PathAnchorSpec {
  return { anchor: [x, y], left: [x, y], right: [x, y] };
}

export function createPolygonHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let drag: PageDrag | null = null;

  const cancel = () => {
    paged?.overlaySignals.setToolPreview(null);
    drag = null;
  };

  const boundsFor = (e: CanvasPointerEvent): Bounds =>
    drawBoundsFor(drag!.startLocal, endLocalFor(drag!, e), e.modifiers);

  const optionsFor = (): { sides: number; starInset: number } => ({
    sides: Math.round(
      settingNumber(paged!, "sides", DEFAULT_SIDES, MIN_SIDES, MAX_SIDES),
    ),
    starInset: settingNumber(paged!, "starInset", DEFAULT_STAR_INSET, 0, 100),
  });

  return {
    onActivate(p) {
      paged = p;
    },
    onDeactivate(reason) {
      if (reason === "suspend") return;
      cancel();
    },
    onPointerDown(e: CanvasPointerEvent) {
      drag = beginPageDrag(e);
    },
    onPointerMove(e: CanvasPointerEvent) {
      if (!paged || !drag) return;
      if (e.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
      const { sides, starInset } = optionsFor();
      paged.overlaySignals.setToolPreview({
        pageId: drag.pageId,
        points: polygonVertices(boundsFor(e), sides, starInset),
        close: true,
      });
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!paged || !drag) {
        cancel();
        return;
      }
      const bounds = boundsFor(e);
      const { pageId } = drag;
      const { sides, starInset } = optionsFor();
      cancel();
      const [top, left, bottom, right] = bounds;
      // A click (no real drag) creates nothing — InDesign opens an
      // options dialog there; that's a follow-up (matches Rectangle).
      if (bottom - top < MIN_SIZE_PT || right - left < MIN_SIZE_PT) return;
      const anchors = polygonVertices(bounds, sides, starInset).map(cornerAnchor);
      mutateAndSelect(
        paged,
        { op: "insertPath", args: { pageId, anchors, open: false, smooth: false } },
        "insertPath",
      );
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    },
  };
}
