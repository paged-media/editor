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

// Editor-ops — the Page tool's gesture handler (v1).
//
// Engine semantics (protocol v24): `insertPage` creates a NEW
// single-page spread after the reference page; deleting a page
// inside a multi-page spread, or the only page, is rejected
// engine-side. The shell refreshes its page grid from the
// `pageStructureChanged` + `pageSizesPt` fields on the
// `mutationApplied` reply — no document reload.
//
// v1 interaction grammar (minimal, Pages-panel-free):
//   - click a page        → arm it as the tool's target
//   - Alt+click a page    → insert a new page after it
//   - drag on a page      → resize it (the drag end is the new
//                           bottom-right corner, page-local pt;
//                           live rect preview)
//   - Delete / Backspace  → delete the armed page

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import {
  beginPageDrag,
  endLocalFor,
  CLICK_DRAG_THRESHOLD_PX,
  type PageDrag,
} from "./shared";

/** Pages can't shrink past this (InDesign's own floor is 1pt; ours
 *  keeps the resize handle grabbable). */
const MIN_PAGE_PT = 72;

export function createPageHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  let drag: PageDrag | null = null;
  /** Last page the user clicked — the Delete target. */
  let armedPageId: string | null = null;

  const cancel = () => {
    paged?.overlaySignals.setToolPreview(null);
    drag = null;
  };

  const warnIfFailed = (label: string) => (reply: { kind: string }) => {
    if (reply.kind === "mutationFailed") {
      // eslint-disable-next-line no-console
      console.warn(
        `${label} rejected by engine:`,
        JSON.stringify((reply as { payload?: unknown }).payload),
      );
    }
  };

  const boundsFor = (end: [number, number]): [number, number, number, number] => [
    0,
    0,
    Math.max(MIN_PAGE_PT, end[1]),
    Math.max(MIN_PAGE_PT, end[0]),
  ];

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
      paged.overlaySignals.setToolPreview({
        pageId: drag.pageId,
        rect: boundsFor(endLocalFor(drag, e)),
      });
    },
    onPointerUp(e: CanvasPointerEvent) {
      if (!paged || !drag) {
        cancel();
        return;
      }
      const { pageId } = drag;
      const end = endLocalFor(drag, e);
      const wasDrag = e.maxDelta > CLICK_DRAG_THRESHOLD_PX;
      cancel();
      armedPageId = pageId;
      if (wasDrag) {
        void paged.client
          .mutate({ op: "resizePage", args: { pageId, bounds: boundsFor(end) } })
          .then(warnIfFailed("resizePage"))
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("resizePage failed:", err);
          });
        return;
      }
      if (e.modifiers.alt) {
        void paged.client
          .mutate({
            op: "insertPage",
            args: { afterPageId: pageId, masterId: null },
          })
          .then(warnIfFailed("insertPage"))
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("insertPage failed:", err);
          });
      }
    },
    onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        cancel();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && paged && armedPageId) {
        const pageId = armedPageId;
        armedPageId = null;
        void paged.client
          .mutate({ op: "deletePage", args: { pageId } })
          .then(warnIfFailed("deletePage"))
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("deletePage failed:", err);
          });
      }
    },
  };
}
