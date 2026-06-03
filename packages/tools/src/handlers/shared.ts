// Editor-ops — bookkeeping every drawing-tool handler repeats: the
// page-anchored drag (both endpoints resolved against the START page
// so the result is correct even when the pointer is released over
// another page or the pasteboard — the Rectangle handler's rule),
// post-mutate selection of the created element, and the quiet
// mutationFailed warning.

import type {
  CanvasPointerEvent,
  PagedEditor,
} from "@paged-media/shell";

export const CLICK_DRAG_THRESHOLD_PX = 4;

/** A drag anchored to the page under the pointer at pointer-down. */
export interface PageDrag {
  pageId: string;
  /** Page origin in document pt (docPoint − pagePoint at down). */
  pageOrigin: [number, number];
  /** Pointer-down position in page-local pt. */
  startLocal: [number, number];
}

export function beginPageDrag(e: CanvasPointerEvent): PageDrag | null {
  if (e.button !== 0 || !e.pageId || !e.pagePoint) return null;
  return {
    pageId: e.pageId,
    pageOrigin: [
      e.docPoint[0] - e.pagePoint[0],
      e.docPoint[1] - e.pagePoint[1],
    ],
    startLocal: e.pagePoint,
  };
}

/** Current pointer position in the START page's local coordinates. */
export function endLocalFor(
  drag: PageDrag,
  e: CanvasPointerEvent,
): [number, number] {
  return [e.docPoint[0] - drag.pageOrigin[0], e.docPoint[1] - drag.pageOrigin[1]];
}

/**
 * Fire a mutation, warn on `mutationFailed`, and select the element
 * the engine reports as created (protocol v24's `createdId`) so the
 * fresh shape immediately carries selection chrome — the post-insert
 * flow InDesign users expect.
 */
export function mutateAndSelect(
  paged: PagedEditor,
  mutation: Parameters<PagedEditor["client"]["mutate"]>[0],
  label: string,
): void {
  void paged.client
    .mutate(mutation)
    .then((reply) => {
      if (reply.kind === "mutationFailed") {
        // eslint-disable-next-line no-console
        console.warn(
          `${label} rejected by engine:`,
          JSON.stringify((reply as { payload?: unknown }).payload),
        );
        return;
      }
      if (reply.kind !== "mutationApplied") return;
      const created = reply.payload.createdId ?? null;
      if (!created) return;
      void paged.client
        .setElementSelection([created], "replace")
        .then((ids) => {
          paged.selection.setElementSelection(ids);
          return paged.client.elementGeometry(ids);
        })
        .then((items) => paged.selection.setElementGeometry(items))
        .catch(() => {});
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`${label} failed:`, err);
    });
}

/**
 * Pixel tolerance converted to document pt at the current zoom, so
 * hit radii feel constant on screen. Falls back to 1:1 when the
 * camera hasn't initialised (scale 0).
 */
export function pxToPt(paged: PagedEditor, px: number): number {
  const scale = paged.camera.camera.scale;
  return px / (scale > 0 ? scale : 1);
}
