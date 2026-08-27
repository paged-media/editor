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

// Ch.6 opener (p41, C-Opener recto) — Scripts of the World.

import { plate, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { prose } from "../135-story/00-support";

export async function build(ctx: PageContext): Promise<PageReport> {
  const page = p(41);

  const number = await prose(ctx, page, [48, 110, 220, 210], [
    { text: "6", style: STYLE.chapterNumber },
  ]);
  const title = await prose(ctx, page, [48, 214, 480, 266], [
    { text: "Scripts of the World", style: STYLE.chapterTitle },
  ]);
  const deck = await prose(ctx, page, [48, 280, 430, 400], [
    {
      text:
        "Latin is one script among many, and a composing engine that " +
        "stops at it has stopped early. In this chapter the text runs the " +
        "other way — Arabic and Hebrew from right to left, with digits " +
        "and Latin nested inside — and then turns on its side, in the " +
        "vertical Japanese the fixture carries. Where a lane is partial, " +
        "the margin says exactly how.",
      style: STYLE.deck,
    },
  ]);
  const rule = await plate(ctx, page, [48, 408, 300, 410], SWATCH.vermilion);

  const label = await specLabel(ctx, page, [
    "Specimen No. 60",
    "chapter opener",
    "C-Opener master",
  ]);

  return {
    title: "Ch.6 opener — Scripts of the World",
    covers: [],
    elements: [number.frameId, title.frameId, deck.frameId, rule, label],
  };
}
