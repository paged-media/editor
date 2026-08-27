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

// Ch.5 opener (p33, C-Opener recto) — the number, the title, and a
// deck that says what the chapter will prove.

import { plate, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { prose } from "./00-support";

export async function build(ctx: PageContext): Promise<PageReport> {
  const page = p(33);

  const number = await prose(ctx, page, [48, 110, 220, 210], [
    { text: "5", style: STYLE.chapterNumber },
  ]);
  const title = await prose(ctx, page, [48, 214, 480, 266], [
    { text: "The Story", style: STYLE.chapterTitle },
  ]);
  const deck = await prose(ctx, page, [48, 280, 430, 400], [
    {
      text:
        "A paragraph belongs to a story, and a story is not a frame: it is " +
        "the text itself, which merely stands in frames for as long as they " +
        "hold it. This chapter threads one story through four frames, lets " +
        "another overflow and says so, and teaches frames to balance their " +
        "columns, grow to fit, wrap around an island, and carry anchored " +
        "cargo through every edit.",
      style: STYLE.deck,
    },
  ]);
  const rule = await plate(ctx, page, [48, 408, 300, 410], SWATCH.vermilion);

  const label = await specLabel(ctx, page, [
    "Specimen No. 50",
    "chapter opener",
    "C-Opener master",
  ]);

  return {
    title: "Ch.5 opener — The Story",
    covers: [],
    elements: [number.frameId, title.frameId, deck.frameId, rule, label],
  };
}
