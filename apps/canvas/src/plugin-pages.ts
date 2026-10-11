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

// v70 — the editor half of the plugin page doors (`host.viewport.goToPage`,
// `activePage`, `onDidChangeActivePage`; plugin-sdk `PagesBackend`). The
// camera and the page layout live in the React tree, the plugin hosts are
// built once outside it, so this module is the hand-off: the canvas
// publishes the active page and registers how to go to one; the backend
// reads both.

import type { Camera } from "@paged-media/client";

import { fitCamera, layoutPages } from "./ui/layout";

type Listener = (pageId: string | null) => void;
type GoTo = (pageId: string, fit: "page" | "width") => boolean;

let active: string | null = null;
let goTo: GoTo | null = null;
const listeners = new Set<Listener>();

/** The canvas reports the page the user is on; listeners hear changes only. */
export function publishActivePage(pageId: string | null): void {
  if (pageId === active) return;
  active = pageId;
  for (const l of [...listeners]) {
    try {
      l(pageId);
    } catch {
      // One plugin's listener must not stop the others.
    }
  }
}

/** The canvas registers how it moves the camera to a page (null: none). */
export function setPageGoTo(fn: GoTo | null): void {
  goTo = fn;
}

/** The camera that shows page `index` of `pageSizesPt`: the whole page,
 *  or its full width from its top edge. */
export function cameraForPage(
  pageSizesPt: ReadonlyArray<readonly [number, number]>,
  index: number,
  fit: "page" | "width",
  viewportWidthPx: number,
  viewportHeightPx: number,
  marginPx = 40,
): Camera | null {
  const rect = layoutPages(pageSizesPt)[index];
  if (!rect || viewportWidthPx <= 0 || viewportHeightPx <= 0) return null;
  if (fit === "page") {
    return fitCamera(viewportWidthPx, viewportHeightPx, rect, marginPx);
  }
  const scale = Math.max(0.01, (viewportWidthPx - 2 * marginPx) / rect.w);
  return {
    scale,
    tx: (viewportWidthPx - rect.w * scale) / 2 - rect.x * scale,
    ty: marginPx - rect.y * scale,
  };
}

/** The backend every plugin host gets (plugin-sdk `PagesBackend`). */
export const pagesBackend = {
  goToPage(pageId: string, fit: "page" | "width"): boolean {
    return goTo ? goTo(pageId, fit) : false;
  },
  activePage(): string | null {
    return active;
  },
  onDidChangeActivePage(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
