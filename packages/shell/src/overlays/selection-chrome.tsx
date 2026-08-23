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

import type { ReactNode } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { ElementGeometryItem } from "@paged-media/client";

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useSelection } from "../state/selection-context";

import { applyAffine } from "./affine";

/**
 * Outlines + per-element bounding chrome for selected elements.
 *
 * - Single selection: oriented bbox via the element's
 *   `itemTransform` applied to its `bounds` corners.
 * - Multi-selection: per-element bboxes plus a dashed union AABB
 *   (per page).
 *
 * Read directly from the selection context — no props beyond the
 * registry's standard `OverlayProps`.
 */
function SelectionChromeRender(props: OverlayProps) {
  const { elementGeometry } = useSelection();
  if (elementGeometry.length === 0) return null;

  const out: ReactNode[] = [];
  for (const g of elementGeometry) {
    const pr = g.pageId ? props.pageRects.get(g.pageId) : undefined;
    if (!pr) continue; // C-23 — pageless ⇒ no page-local chrome
    const [top, left, bottom, right] = g.bounds;
    const corners: Array<[number, number]> = [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
    ];
    const points = corners
      .map(([x, y]) => applyAffine(g.itemTransform, x, y))
      .map(([x, y]) => `${pr.x + x},${pr.y + y}`)
      .join(" ");
    const key = `${g.id.kind}:${g.id.id}`;
    out.push(
      <polygon
        key={key}
        points={points}
        fill="none"
        stroke="var(--overlay-selection)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />,
    );
  }

  // Multi-select union AABB, per page.
  if (elementGeometry.length > 1) {
    out.push(...renderUnionBoxes(elementGeometry, props));
  }

  return <>{out}</>;
}

function renderUnionBoxes(
  geometry: ReadonlyArray<ElementGeometryItem>,
  props: OverlayProps,
): ReactNode[] {
  const byPage = groupByPage(geometry);
  const out: ReactNode[] = [];
  for (const [pageId, items] of byPage) {
    const pr = props.pageRects.get(pageId);
    if (!pr) continue;
    const bb = unionAabb(items);
    if (!bb) continue;
    out.push(
      <rect
        key={`union:${pageId}`}
        x={pr.x + bb.minX}
        y={pr.y + bb.minY}
        width={bb.maxX - bb.minX}
        height={bb.maxY - bb.minY}
        fill="none"
        stroke="var(--overlay-selection)"
        strokeWidth={1}
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />,
    );
  }
  return out;
}

export function groupByPage(
  geometry: ReadonlyArray<ElementGeometryItem>,
): Map<string, ElementGeometryItem[]> {
  const byPage = new Map<string, ElementGeometryItem[]>();
  for (const g of geometry) {
    // C-23 — `pageId` is nullable once the engine reports PASTEBOARD
    // elements (it used to omit them entirely). An element on no page
    // has no page-local space to draw chrome in, so it is not grouped
    // and gets no chrome. Written as a guard NOW, ahead of the wasm
    // bump that narrows the type, so the change lands in one place
    // instead of surfacing as a type error across six overlays.
    if (!g.pageId) continue;
    const list = byPage.get(g.pageId) ?? [];
    list.push(g);
    byPage.set(g.pageId, list);
  }
  return byPage;
}

export interface Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function unionAabb(
  items: ReadonlyArray<ElementGeometryItem>,
): Aabb | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const g of items) {
    const [top, left, bottom, right] = g.bounds;
    const corners: Array<[number, number]> = [
      applyAffine(g.itemTransform, left, top),
      applyAffine(g.itemTransform, right, top),
      applyAffine(g.itemTransform, right, bottom),
      applyAffine(g.itemTransform, left, bottom),
    ];
    for (const [x, y] of corners) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

export const selectionChromeContribution: OverlayContribution = {
  id: "paged.selection-chrome",
  render: SelectionChromeRender,
  z: 200,
};
