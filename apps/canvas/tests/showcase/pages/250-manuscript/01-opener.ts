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

// Ch.19 opener (p115, C-Opener recto) — the provenance thesis: a placed
// Word document is a PLACE, not an open. The source file travels inside
// the container as a part; its content lowers to native paragraphs,
// runs and synthesized styles; and the two never lose each other —
// which is what makes an edited save-back a patch instead of a rewrite.

import { plate, proseFrame, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const page = p(115);

  const number = await proseFrame(ctx, page, [48, 100, 220, 196], [
    { text: "19", style: STYLE.chapterNumber },
  ]);
  const title = await proseFrame(ctx, page, [48, 200, 480, 252], [
    { text: "The Manuscript", style: STYLE.chapterTitle },
  ]);
  const deck = await proseFrame(ctx, page, [48, 264, 456, 452], [
    {
      text:
        "A manuscript arrives as a .docx, and this chapter treats that " +
        "arrival as a PLACE, not an open: the Word file is poured into the " +
        "open layout as native Paged content — real paragraphs, real " +
        "character runs, styles synthesized from the document's own " +
        "word/styles.xml — while the source bytes travel beside it as a " +
        "container part. Nothing about the result needs the plugin to " +
        "render, and nothing about the source is thrown away. The spread " +
        "that follows pours a full circulation report and reads it here, " +
        "tier by tier; the closing page tells the save-back story straight " +
        "— what patches, what carries verbatim, and how to tell which " +
        "happened.",
      style: STYLE.deck,
    },
  ]);
  const rule = await plate(ctx, page, [48, 462, 300, 464], SWATCH.vermilion);

  const label = await specLabel(ctx, page, [
    "Specimen No. 182",
    "chapter opener",
    "C-Opener master",
    "paged.doc — Word documents as placed, patchable sources",
  ]);

  return {
    title: "Ch.19 opener — The Manuscript",
    covers: [],
    elements: [number.frameId, title.frameId, deck.frameId, rule, label],
  };
}
