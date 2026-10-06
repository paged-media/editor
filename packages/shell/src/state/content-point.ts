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

// The page → FRAME-CONTENT mapping every edit-context pointer uses: the
// K-1 content pointers, the wheel, and (W-19) the point a context is
// entered at. One function, so the entering point and the first pointer
// after it can never disagree about where the content origin is.

// eslint-disable-next-line import/no-relative-parent-imports
import type { ElementGeometryItem } from "@paged-media/client";

/**
 * Map a page-local point into a frame's CONTENT space: invert the frame's
 * `itemTransform` (page ← frame), then shift by the content-box origin
 * (`bounds` top-left), so `(0,0)` is the content-box top-left — the SAME
 * model a scene-layer submission uses (C-1 composes at `itemTransform ∘
 * translate(bounds.left, bounds.top)`). Returns `null` when the point
 * falls OUTSIDE the content box or the transform is singular.
 *
 * Assumes a ZERO text inset, as the C-1 consumer does when it sizes a
 * scene layer to the full frame bounds; the geometry read does not
 * expose the inset.
 */
export function pageToContentPoint(
  geom: Pick<ElementGeometryItem, "bounds" | "itemTransform">,
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
