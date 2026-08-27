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

// Chapter 9 opener — Ink & Light. The terms of the compositing chapter:
// what the plate overleaf holds itself to, and what the closing page
// will and will not pretend to do.
//
// Geometry is page-space (x0, y0, x1, y1) per the driver helpers.

import { proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];

  const number = await proseFrame(ctx, p(53), [48, 54, 480, 132], [
    { text: "9", style: STYLE.chapterNumber },
  ]);
  elements.push(number.frameId);

  const title = await proseFrame(ctx, p(53), [48, 140, 480, 208], [
    { text: "Ink & Light", style: STYLE.chapterTitle },
  ]);
  elements.push(title.frameId);

  const deck = await proseFrame(ctx, p(53), [48, 218, 480, 288], [
    {
      text: "Ink is subtractive and patient; light is additive and quick. Where the two share a page, the page needs arithmetic — sixteen kinds of it.",
      style: STYLE.deck,
    },
  ]);
  elements.push(deck.frameId);

  const prose = await proseFrame(ctx, p(53), [48, 300, 480, 580], [
    {
      text: "The plate overleaf is one motif set sixteen times: two soft shapes and a marigold square, identical to the last point, except for the compositing arithmetic the square carries. The engine speaks the full InDesign blend vocabulary — Normal through Luminosity — and the plate names every member rather than sampling the flattering ones.",
      style: STYLE.bodyFirst,
    },
    {
      text: "The closing page turns to light's other instruments. Two gradients are minted live on the wire and one is edited in place, to prove the ramp is data rather than ink. An opacity ramp steps a vermilion chip down into the paper. And two opacity masks — one reading luminance, one reading alpha — do what no IDML element can. The margin says so plainly, and the export ledger counts the loss out loud.",
      style: STYLE.body,
    },
  ]);
  elements.push(prose.frameId);

  elements.push(
    await specLabel(ctx, p(53), [
      "Specimen No. 80",
      "C-Opener battery",
      "the compositing terms",
    ]),
  );

  return {
    title: "Chapter 9 opener — Ink & Light",
    covers: ["stories-text.style-apply-range"],
    elements,
  };
}
