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

// Chapter 1 opener — number, title, deck, and the chapter's thesis:
// this chapter demonstrates the document's own structural machinery,
// on the pages you are holding while it does so. The opener paragraph
// the title sets in Chapter Title style is also load-bearing: it is
// the text the B-Body recto running-header variable picks up from
// here forward (FirstOnPage with carry-forward), which page 18
// returns to.
//
// Geometry is page-space (x0, y0, x1, y1) per the driver helpers.

import { proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];

  const number = await proseFrame(ctx, p(13), [48, 54, 480, 132], [
    { text: "1", style: STYLE.chapterNumber },
  ]);
  elements.push(number.frameId);

  const title = await proseFrame(ctx, p(13), [48, 140, 480, 208], [
    { text: "Anatomy of This Book", style: STYLE.chapterTitle },
  ]);
  elements.push(title.frameId);

  const deck = await proseFrame(ctx, p(13), [48, 218, 480, 288], [
    {
      text: "In which the volume opens itself on the table: margins, masters, layers, and the apparatus that decides what prints.",
      style: STYLE.deck,
    },
  ]);
  elements.push(deck.frameId);

  const prose = await proseFrame(ctx, p(13), [48, 300, 480, 560], [
    {
      text: "Every chapter after this one demonstrates something the engine does to content. This chapter demonstrates what the engine does to the book itself. The pages that follow are their own exhibit: a spread that draws its own grid, a page whose running head is a recorded act of disobedience, a page that is created, reshaped and destroyed without the book ever changing length, and a page that shows the same sentence three ways depending on who is looking.",
      style: STYLE.bodyFirst,
    },
    {
      text: "Nothing here is illustration. The hairlines on the next spread sit at the same coordinates the margin preferences declare; the master tiles on page 16 name the seven masters this file actually carries; the layer bands on page 17 are read from the document, not typed. Where the machinery has a limit, the margin says so and Appendix A holds the ledger.",
      style: STYLE.body,
    },
  ]);
  elements.push(prose.frameId);

  elements.push(
    await specLabel(ctx, p(13), [
      "Specimen No. 7",
      "C-Opener battery",
      "Chapter Number / Title / Deck",
    ]),
  );

  return {
    title: "Chapter 1 opener — Anatomy of This Book",
    covers: ["stories-text.style-apply-range"],
    elements,
  };
}
