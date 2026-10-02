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

/**
 * IDML stores affine transforms as `[a, b, c, d, tx, ty]`. The
 * mapping is:
 *
 *     x' = a*x + c*y + tx
 *     y' = b*x + d*y + ty
 *
 * Used by every selection-chrome contribution that needs to project
 * page-local corners through an element's `item_transform`.
 */
export type IdmlAffine = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

export function applyAffine(
  m: IdmlAffine | null | undefined,
  x: number,
  y: number,
): [number, number] {
  if (!m) return [x, y];
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
