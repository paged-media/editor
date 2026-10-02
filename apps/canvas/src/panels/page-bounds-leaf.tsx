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

// `paged.input.pageBounds` — the Object section's Bounds row (Properties
// and the Control panel), reading where the selection IS rather than its
// inner `frameBounds` (see `page-position.ts`).
//
// It renders through the built-in Bounds leaf, so the four cells look and
// behave exactly as before; only the VALUE and the WRITE change. The
// cells are editable where an edge write is the edge the user sees (one
// rectangle, ellipse or text frame with no rotation, scale or shear) and
// read-only otherwise — a rotated frame, a line, a path, a group, a
// multi-selection — where a `frameBounds` write would land somewhere
// other than the number typed. Those move through Transform ▸ X / Y.

import type { ComponentType } from "react";
import type { CatalogEntry, LeafProps } from "@paged-media/catalog";
import type { Value } from "@paged-media/client";

import { usePagePosition } from "./page-position";

export const PAGED_INPUT_PAGE_BOUNDS = "paged.input.pageBounds";

/** The catalog entry, rendering through `boundsLeaf` — the built-in
 *  `paged.input.bounds` leaf, handed in by the registry that owns it. */
export function pageBoundsEntry(
  boundsLeaf: ComponentType<LeafProps>,
): CatalogEntry {
  const BoundsLeaf = boundsLeaf;
  function PageBoundsLeaf({ props }: LeafProps) {
    const { box, edgeLeaf, setEdges } = usePagePosition();
    const value: Value | null = box
      ? {
          type: "bounds",
          value: [box.top, box.left, box.bottom, box.right],
        }
      : null;
    return (
      <span className="contents" data-page-bounds={edgeLeaf ? "edges" : "readout"}>
        <BoundsLeaf
          value={value}
          props={props}
          onCommit={
            edgeLeaf
              ? (next) => {
                  if (next.type !== "bounds") return;
                  const [top, left, bottom, right] = next.value;
                  void setEdges({ top, left, bottom, right });
                }
              : undefined
          }
        />
      </span>
    );
  }
  return {
    id: PAGED_INPUT_PAGE_BOUNDS,
    kind: "leaf",
    props: {
      label: "string",
      labels: "JsonValue",
      layout: "string",
      seam: "boolean",
    },
    bindings: {
      reads: ["selection", "selectionProperty:frameBounds", "selectionProperty:frameTransform"],
      writes: ["geometry", "selectionProperty:frameBounds"],
    },
    leaf: PageBoundsLeaf,
  };
}
