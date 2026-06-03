// Concept 1 (Phase 2) — the Rectangle tool's gesture handler.
//
// Proves the Tool→Operation map end-to-end: a drag on the canvas
// emits a single `insertFrame` Mutation on pointer-up (invariant 9 —
// the handler mutates ONLY through `paged.client.mutate`, never the
// model). Both corners are resolved against the START page so the
// frame is correct even if the pointer is released over another page
// or the pasteboard. Live rubber-band preview is a follow-up (the
// active-tool overlay); the frame still lands on release.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

const MIN_SIZE_PT = 1;

export function createRectangleHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let startPageId: string | null = null;
  // Page origin in document pt = docPoint − pagePoint at pointer-down.
  let startPageOrigin: [number, number] | null = null;
  let startLocal: [number, number] | null = null;

  const reset = () => {
    startPageId = null;
    startPageOrigin = null;
    startLocal = null;
  };

  return {
    onActivate(p) {
      paged = p;
    },
    onDeactivate() {
      reset();
    },
    onPointerDown(e: CanvasPointerEvent) {
      if (e.button !== 0 || !e.pageId || !e.pagePoint) {
        reset();
        return;
      }
      startPageId = e.pageId;
      startPageOrigin = [
        e.docPoint[0] - e.pagePoint[0],
        e.docPoint[1] - e.pagePoint[1],
      ];
      startLocal = e.pagePoint;
    },
    onPointerMove() {
      /* live rubber-band preview — follow-up via the active-tool overlay */
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!paged || !startPageId || !startPageOrigin || !startLocal) {
        reset();
        return;
      }
      // End corner expressed in the START page's local coordinates.
      const endLocal: [number, number] = [
        e.docPoint[0] - startPageOrigin[0],
        e.docPoint[1] - startPageOrigin[1],
      ];
      const top = Math.min(startLocal[1], endLocal[1]);
      const left = Math.min(startLocal[0], endLocal[0]);
      const bottom = Math.max(startLocal[1], endLocal[1]);
      const right = Math.max(startLocal[0], endLocal[0]);
      const pageId = startPageId;
      reset();
      // A click (no real drag) creates nothing — InDesign opens an
      // options dialog there; that's a follow-up.
      if (bottom - top < MIN_SIZE_PT || right - left < MIN_SIZE_PT) return;
      void paged.client
        .mutate({
          op: "insertFrame",
          args: { pageId, bounds: [top, left, bottom, right] },
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
  };
}
