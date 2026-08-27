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

// Ch.12 opener (p65, C-Opener recto) — the number, the title, and a
// deck that promises the break: a table that continues across pages
// with its bands repeating.

import { plate, proseFrame, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const page = p(65);

  const number = await proseFrame(ctx, page, [48, 100, 220, 196], [
    { text: "12", style: STYLE.chapterNumber },
  ]);
  const title = await proseFrame(ctx, page, [48, 200, 480, 252], [
    { text: "The Table", style: STYLE.chapterTitle },
  ]);
  const deck = await proseFrame(ctx, page, [48, 264, 448, 400], [
    {
      text:
        "A table is not a grid of rectangles that happen to align; it is a " +
        "structure the text owns — rows and columns inside a story, with a " +
        "header that knows to say itself again. This chapter builds one " +
        "taller than its frame and lets it walk across the gutter, its " +
        "header and footer repeating at the break; then it takes a cell " +
        "apart property by property, rebuilds the grid live, and dresses " +
        "the whole thing in styles.",
      style: STYLE.deck,
    },
  ]);
  const rule = await plate(ctx, page, [48, 410, 300, 412], SWATCH.vermilion);

  const label = await specLabel(ctx, page, [
    "Specimen No. 100",
    "chapter opener",
    "C-Opener master",
  ]);

  return {
    title: "Ch.12 opener — The Table",
    covers: [],
    elements: [number.frameId, title.frameId, deck.frameId, rule, label],
  };
}
