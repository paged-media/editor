// Concept 1 (Phase 2) — the Rectangle tool's gesture handler.
//
// Proves the Tool→Operation map end-to-end: a drag on the canvas
// shows a live rubber-band (published through
// `paged.overlaySignals.setToolPreview`, drawn by the tool-preview
// overlay contribution) and emits a single `insertFrame` Mutation on
// pointer-up (invariant 9 — the handler mutates ONLY through
// `paged.client.mutate`, never the model). Both corners are resolved
// against the START page so the frame is correct even if the pointer
// is released over another page or the pasteboard.
//
// Lifecycle: `onDeactivate("suspend")` (a spring-load — hold Space for
// a momentary Hand) KEEPS the in-flight gesture so it resumes on
// release; `"switch"` cancels it. Escape cancels mid-drag.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

const MIN_SIZE_PT = 1;
const CLICK_DRAG_THRESHOLD_PX = 4;

export function createRectangleHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let startPageId: string | null = null;
  // Page origin in document pt = docPoint − pagePoint at pointer-down.
  let startPageOrigin: [number, number] | null = null;
  let startLocal: [number, number] | null = null;

  const clearPreview = () => {
    paged?.overlaySignals.setToolPreview(null);
  };

  const reset = () => {
    startPageId = null;
    startPageOrigin = null;
    startLocal = null;
  };

  const cancel = () => {
    clearPreview();
    reset();
  };

  /** End corner in the START page's local coordinates. */
  const endLocalFor = (e: CanvasPointerEvent): [number, number] => [
    e.docPoint[0] - startPageOrigin![0],
    e.docPoint[1] - startPageOrigin![1],
  ];

  const boundsFor = (
    end: [number, number],
  ): [number, number, number, number] => [
    Math.min(startLocal![1], end[1]),
    Math.min(startLocal![0], end[0]),
    Math.max(startLocal![1], end[1]),
    Math.max(startLocal![0], end[0]),
  ];

  return {
    onActivate(p) {
      paged = p;
    },
    onDeactivate(reason) {
      // Spring-load suspend keeps the in-flight gesture (and its
      // preview) so it resumes when the override is released (AC 5).
      if (reason === "suspend") return;
      cancel();
    },
    onPointerDown(e: CanvasPointerEvent) {
      if (e.button !== 0 || !e.pageId || !e.pagePoint) {
        cancel();
        return;
      }
      startPageId = e.pageId;
      startPageOrigin = [
        e.docPoint[0] - e.pagePoint[0],
        e.docPoint[1] - e.pagePoint[1],
      ];
      startLocal = e.pagePoint;
    },
    onPointerMove(e: CanvasPointerEvent) {
      if (!paged || !startPageId || !startPageOrigin || !startLocal) return;
      if (e.maxDelta <= CLICK_DRAG_THRESHOLD_PX) return;
      paged.overlaySignals.setToolPreview({
        pageId: startPageId,
        rect: boundsFor(endLocalFor(e)),
      });
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!paged || !startPageId || !startPageOrigin || !startLocal) {
        cancel();
        return;
      }
      const bounds = boundsFor(endLocalFor(e));
      const pageId = startPageId;
      cancel();
      const [top, left, bottom, right] = bounds;
      // A click (no real drag) creates nothing — InDesign opens an
      // options dialog there; that's a follow-up.
      if (bottom - top < MIN_SIZE_PT || right - left < MIN_SIZE_PT) return;
      void paged.client
        .mutate({
          op: "insertFrame",
          args: { pageId, bounds },
        })
        .then((reply) => {
          // `mutate` resolves with the worker reply; a rejected op comes
          // back as `mutationFailed` (today: core has not implemented
          // `Mutation::InsertFrame` — the editor path is complete, the
          // engine op is the core follow-up).
          if (reply.kind === "mutationFailed") {
            // eslint-disable-next-line no-console
            console.warn(
              "insertFrame rejected by engine:",
              JSON.stringify((reply as { payload?: unknown }).payload),
            );
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("insertFrame failed:", err);
        });
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    },
  };
}
