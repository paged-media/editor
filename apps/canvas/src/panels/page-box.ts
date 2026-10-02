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

// The PURE half of `page-position.ts`: where a selection sits, as the
// selection chrome draws it, and the one write an edge readout may make.
// Kept apart from the hook so it runs in Node (the hook needs the shell).
// See `page-position.ts` for the why.

import type { PageItemId } from "../object-commands";

/** An axis-aligned box, `top < bottom`, `left < right`, in points. */
export interface PageBox {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** `[top, left, bottom, right]` through `transform`, boxed. `null` is
 *  the engine's identity. */
export function composedBox(
  bounds: readonly number[],
  transform: readonly number[] | null | undefined,
): PageBox {
  const [top, left, bottom, right] = bounds;
  const [a, b, c, d, tx, ty] = transform ?? [1, 0, 0, 1, 0, 0];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ]) {
    xs.push(a * x + c * y + tx);
    ys.push(b * x + d * y + ty);
  }
  return {
    top: Math.min(...ys),
    left: Math.min(...xs),
    bottom: Math.max(...ys),
    right: Math.max(...xs),
  };
}

/** The box around every box, or `null` for none. */
export function unionBox(boxes: readonly PageBox[]): PageBox | null {
  if (boxes.length === 0) return null;
  return {
    top: Math.min(...boxes.map((b) => b.top)),
    left: Math.min(...boxes.map((b) => b.left)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
    right: Math.max(...boxes.map((b) => b.right)),
  };
}

/** The kinds whose inner box IS their geometry: an edge write on one of
 *  them moves exactly that edge. A line and a polygon are drawn from
 *  their anchors, which a bounds write leaves alone (§14). */
const BOX_KINDS: ReadonlySet<string> = new Set([
  "rectangle",
  "oval",
  "textFrame",
]);

/** One selected leaf, as the engine holds it. */
export interface PlacedLeaf {
  id: PageItemId;
  bounds: readonly number[];
  transform: readonly number[] | null;
}

/** Can this leaf's EDGES be written — is an inner-box write the edge the
 *  user is looking at? Only for a box kind with no rotation, scale or
 *  shear: then the page box is the inner box shifted by the translation. */
export function edgesWritable(leaf: PlacedLeaf | null): leaf is PlacedLeaf {
  if (!leaf || !BOX_KINDS.has(leaf.id.kind)) return false;
  const [a, b, c, d] = leaf.transform ?? [1, 0, 0, 1];
  return a === 1 && b === 0 && c === 0 && d === 1;
}

/** The inner `frameBounds` whose page box is `box`, for a leaf
 *  `edgesWritable` accepted. */
export function innerBoundsFor(
  leaf: PlacedLeaf,
  box: PageBox,
): [number, number, number, number] {
  const tx = leaf.transform?.[4] ?? 0;
  const ty = leaf.transform?.[5] ?? 0;
  return [box.top - ty, box.left - tx, box.bottom - ty, box.right - tx];
}

