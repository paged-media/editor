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

// The names the base fixture declares and the page modules address.
//
// This file is the contract between `paged-gen`'s `showcase-base`
// sample and everything here. Both sides spell these strings, so both
// sides import the intent from one place — and `ShowcaseDoc`'s lookups
// THROW on a missing name, so a drift shows up on the page that first
// asks for it rather than as a document that renders subtly wrong.

export const STYLE = {
  title: "Showcase Title",
  heading: "Showcase Heading",
  body: "Showcase Body",
  caption: "Showcase Caption",
  pullquote: "Showcase Pullquote",
} as const;

export const CHAR_STYLE = {
  emphasis: "Showcase Emphasis",
  code: "Showcase Code",
} as const;

export const SWATCH = {
  ink: "Showcase Ink",
  accent: "Showcase Accent",
  accentTint: "Showcase Accent 20%",
} as const;

export const LAYER = {
  background: "Background",
  content: "Content",
  notes: "Notes",
} as const;

/** US Letter, the base fixture's page size. */
export const PAGE = { widthPt: 612, heightPt: 792 } as const;

/** The A-master's text column, in page points. */
export const MARGIN = { top: 72, left: 72, bottom: 72, right: 72 } as const;

export const COLUMN = {
  /** `[top, left, bottom, right]` of the full live area. */
  live: [
    MARGIN.top,
    MARGIN.left,
    PAGE.heightPt - MARGIN.bottom,
    PAGE.widthPt - MARGIN.right,
  ] as [number, number, number, number],
  gutterPt: 16,
  count: 3,
} as const;

/** `[top, left, bottom, right]` for column `i` of the 3-column grid. */
export function columnBounds(
  i: number,
  opts: { top?: number; bottom?: number } = {},
): [number, number, number, number] {
  const live = COLUMN.live;
  const width =
    (live[3] - live[1] - COLUMN.gutterPt * (COLUMN.count - 1)) / COLUMN.count;
  const left = live[1] + i * (width + COLUMN.gutterPt);
  return [opts.top ?? live[0], left, opts.bottom ?? live[2], left + width];
}
