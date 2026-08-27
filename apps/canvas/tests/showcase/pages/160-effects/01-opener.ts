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

// Chapter 10 opener — The Effects. The terms: eight families, one
// square, every knob turned at least once, and the two limits the
// margin will not let the reader miss.
//
// Geometry is page-space (x0, y0, x1, y1) per the driver helpers.

import { proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];

  const number = await proseFrame(ctx, p(57), [48, 54, 480, 132], [
    { text: "10", style: STYLE.chapterNumber },
  ]);
  elements.push(number.frameId);

  const title = await proseFrame(ctx, p(57), [48, 140, 480, 208], [
    { text: "The Effects", style: STYLE.chapterTitle },
  ]);
  elements.push(title.frameId);

  const deck = await proseFrame(ctx, p(57), [48, 218, 480, 288], [
    {
      text: "Eight families of borrowed light and manufactured shadow, some sixty property paths between them — and one honest contact sheet.",
      style: STYLE.deck,
    },
  ]);
  elements.push(deck.frameId);

  const prose = await proseFrame(ctx, p(57), [48, 300, 480, 580], [
    {
      text: "The verso overleaf is the contact sheet: the same vermilion square eight times, each carrying one family at full expressive settings — drop shadow, inner shadow, outer glow, inner glow, bevel and emboss, satin, feather, directional feather. The recto answers with two compositions that use them in anger, and gives the gradient feather, the ninth instrument, an exhibit of its own.",
      style: STYLE.bodyFirst,
    },
    {
      text: "The closing page is the parameter table: for every family, a row of small squares that turn one knob at a time, so the reader can see what each path buys rather than take the panel's word for it. Two limits are recorded where they occur — satin stores an invert flag the rasterizer ignores, and a transparency group's raster bounds can clip a wide overhang that the PDF path keeps. Both stand in the margin and again in Appendix A.",
      style: STYLE.body,
    },
  ]);
  elements.push(prose.frameId);

  elements.push(
    await specLabel(ctx, p(57), [
      "Specimen No. 84",
      "C-Opener battery",
      "the effect terms",
    ]),
  );

  return {
    title: "Chapter 10 opener — The Effects",
    covers: ["stories-text.style-apply-range"],
    elements,
  };
}
