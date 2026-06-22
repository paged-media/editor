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
import type {
  ElementGeometryItem,
  ResizeHandle,
} from "@paged-media/client";

import type { OverlayContribution, OverlayProps } from "../registries/overlay";
import { useSelection } from "../state/selection-context";

import { applyAffine } from "./affine";
import { groupByPage, unionAabb } from "./selection-chrome";

/**
 * Eight cardinal/diagonal resize handles.
 *
 * - Single selection: handles render on the element's oriented bbox
 *   (corners projected through `itemTransform`).
 * - Multi-selection: handles render on the per-page union AABB.
 *
 * Each handle carries `data-handle="<name>"`; ViewportCanvas's
 * pointerdown reads the dataset to begin the correct resize gesture.
 */
function ResizeHandlesRender(props: OverlayProps) {
  const { elementGeometry } = useSelection();
  if (elementGeometry.length === 0) return null;
  if (elementGeometry.length === 1) {
    return renderSingle(elementGeometry[0], props);
  }
  return renderUnion(elementGeometry, props);
}

function renderSingle(item: ElementGeometryItem, props: OverlayProps) {
  const pr = props.pageRects.get(item.pageId);
  if (!pr) return null;
  const [top, left, bottom, right] = item.bounds;
  const cx = (left + right) * 0.5;
  const cy = (top + bottom) * 0.5;
  const positions = handlePositions(left, top, right, bottom, cx, cy);
  const inv = 1 / props.camera.scale;
  return (
    <>
      {positions.map(({ name, local, cursor }) => {
        const [wx, wy] = applyAffine(item.itemTransform, local[0], local[1]);
        return renderHandle(
          name,
          pr.x + wx,
          pr.y + wy,
          inv,
          cursor,
          `${name}`,
        );
      })}
    </>
  );
}

function renderUnion(
  geometry: ReadonlyArray<ElementGeometryItem>,
  props: OverlayProps,
) {
  const byPage = groupByPage(geometry);
  const inv = 1 / props.camera.scale;
  const out: ReactNode[] = [];
  for (const [pageId, items] of byPage) {
    const pr = props.pageRects.get(pageId);
    if (!pr) continue;
    const bb = unionAabb(items);
    if (!bb) continue;
    const cx = (bb.minX + bb.maxX) * 0.5;
    const cy = (bb.minY + bb.maxY) * 0.5;
    const positions = handlePositions(
      bb.minX,
      bb.minY,
      bb.maxX,
      bb.maxY,
      cx,
      cy,
    );
    for (const { name, local, cursor } of positions) {
      out.push(
        renderHandle(
          name,
          pr.x + local[0],
          pr.y + local[1],
          inv,
          cursor,
          `${pageId}:${name}`,
        ),
      );
    }
  }
  return <>{out}</>;
}

function handlePositions(
  left: number,
  top: number,
  right: number,
  bottom: number,
  cx: number,
  cy: number,
): Array<{
  name: ResizeHandle;
  local: [number, number];
  cursor: string;
}> {
  return [
    { name: "northWest", local: [left, top], cursor: "nwse-resize" },
    { name: "north", local: [cx, top], cursor: "ns-resize" },
    { name: "northEast", local: [right, top], cursor: "nesw-resize" },
    { name: "east", local: [right, cy], cursor: "ew-resize" },
    { name: "southEast", local: [right, bottom], cursor: "nwse-resize" },
    { name: "south", local: [cx, bottom], cursor: "ns-resize" },
    { name: "southWest", local: [left, bottom], cursor: "nesw-resize" },
    { name: "west", local: [left, cy], cursor: "ew-resize" },
  ];
}

function renderHandle(
  name: ResizeHandle,
  x: number,
  y: number,
  inv: number,
  cursor: string,
  key: string,
) {
  const visiblePx = 8;
  const hitPx = 12;
  return (
    <g
      key={key}
      transform={`translate(${x}, ${y}) scale(${inv})`}
      data-selection-handle={name}
    >
      <rect
        x={-hitPx / 2}
        y={-hitPx / 2}
        width={hitPx}
        height={hitPx}
        fill="transparent"
        data-handle={name}
        style={{ cursor, pointerEvents: "all" }}
      />
      <rect
        x={-visiblePx / 2}
        y={-visiblePx / 2}
        width={visiblePx}
        height={visiblePx}
        fill="white"
        stroke="var(--overlay-selection)"
        strokeWidth={1}
        data-handle={name}
        style={{ cursor, pointerEvents: "all" }}
      />
    </g>
  );
}

export const resizeHandlesContribution: OverlayContribution = {
  id: "paged.resize-handles",
  render: ResizeHandlesRender,
  z: 300,
};
