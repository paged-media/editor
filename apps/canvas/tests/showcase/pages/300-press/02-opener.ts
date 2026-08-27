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

// Ch.20 opener — p121, C-Opener recto, and the chapter's thesis: a
// document exits HONESTLY or it does not really exit. Two of the
// platform's doors — paged.pdf's PDF import and paged.publish's IDML
// open — swing INWARD, and both of them REPLACE the open document
// (host.nativeDocument.open hands the host a new one; there is no
// dirty-state guard in front of it). Running either inline here would
// end this book mid-sentence, so this chapter does not fake them: they
// are exercised as exit-and-return paths at assembly, and their import
// lanes are proven by their own journey specs. The margin note keeps
// that boundary where every other boundary in this book lives.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];
  const page = p(121);
  const [left, , right] = contentBox(page);

  // ── the opener block ─────────────────────────────────────────────
  const number = await proseFrame(ctx, page, [left, 56, 150, 128], [
    { text: "20", style: STYLE.chapterNumber },
  ]);
  const title = await proseFrame(ctx, page, [160, 60, right, 128], [
    { text: "Imposition & Proof", style: STYLE.chapterTitle },
  ]);
  elements.push(number.frameId, title.frameId);

  const deck = await proseFrame(ctx, page, [left, 150, right - 40, 240], [
    {
      text:
        "The last chapter of the body is about leaving well: what the press needs, what the container carries, and what every exit admits it cannot take.",
      style: STYLE.deck,
    },
  ]);
  elements.push(deck.frameId);

  // ── the thesis ───────────────────────────────────────────────────
  const thesis = await proseFrame(ctx, page, [left, 268, right, 560], [
    {
      text:
        "Six pages follow. A plate draws the sheet's anatomy — trim, bleed, marks — in the page's own native geometry. A preflight runs the real PDF export door against this very document and prints what it reported. The container is opened and its parts are listed, written and read back through the same doors a plugin uses. The loss ledger prints, verbatim, what the IDML interchange twin must leave behind. And the exit inventory names every artifact this book has already sent into other applications' hands.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        "Two doors are deliberately absent from those pages. paged.pdf's import opens a PDF as a new native document, and paged.publish's IDML open does the same for an interchange package — and both REPLACE the document they are invoked over. That is the correct shape for an import (a PDF becomes the document), and it is exactly why neither runs inline here: invoking either would end this book at this sentence. They are doors out of this build, exercised as exit paths at assembly — export, reopen, compare — and their import lanes are proven where imports are proven, by their own journeys. A demonstration that pretended otherwise would be a screenshot, not a specimen.",
      style: STYLE.body,
    },
  ]);
  elements.push(thesis.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 187",
      "C-Opener",
      "the exits, named — none simulated",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "paged.pdf's import and publish's IDML open REPLACE the open " +
        "document (host.nativeDocument.open, no dirty-state guard) - " +
        "doors out of this build, exercised as exit paths at assembly, " +
        "never simulated inline; their import lanes are proven by their " +
        "own journeys. → Appendix A",
    ),
  );

  return {
    title: "Ch.20 opener — the exits-honestly thesis",
    covers: [],
    elements,
  };
}
