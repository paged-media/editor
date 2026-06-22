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

// Length-unit conversion table. Internal canonical unit is points
// (pt) — IDML's native — so every conversion is `value × ratio` to
// reach pt from the source unit, or `value / ratio` to leave pt
// for the target unit.

export type LengthUnit = "pt" | "px" | "mm" | "cm" | "in";

/** Ratio table: how many points per one unit of `key`. */
export const POINTS_PER_UNIT: Record<LengthUnit, number> = {
  pt: 1,
  px: 1, // 1 CSS px ≈ 0.75 pt at the default 96 dpi; the editor
  // treats canvas pixels as points at 1:1 because the renderer
  // operates in points. Worth revisiting if a px-honest mode lands.
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
};

/** Convert a value from `from` to `to`. */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value;
  const inPoints = value * POINTS_PER_UNIT[from];
  return inPoints / POINTS_PER_UNIT[to];
}
