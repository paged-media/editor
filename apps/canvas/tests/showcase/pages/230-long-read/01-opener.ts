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

// Ch.17 opener (p103, C-Opener recto) — the source-beside-render
// thesis: a web frame is a rectangle carrying its own source, and this
// chapter keeps source and rendering on the page together, so the
// reader can always see what the engine was told next to what it did.

import { plate, proseFrame, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const page = p(103);

  const number = await proseFrame(ctx, page, [48, 100, 220, 196], [
    { text: "17", style: STYLE.chapterNumber },
  ]);
  const title = await proseFrame(ctx, page, [48, 200, 480, 252], [
    { text: "The Long Read", style: STYLE.chapterTitle },
  ]);
  const deck = await proseFrame(ctx, page, [48, 264, 448, 434], [
    {
      text:
        "HTML and CSS are a writing system for documents, and this chapter " +
        "treats them as content: an article authored as markup, placed in a " +
        "frame, laid out by a real browser engine, and printed here beside " +
        "its own source. The pages that follow thread one source across " +
        "many frames — including a named sidebar flow — break a forty-row " +
        "table across three frames with its two-row header repeating, and " +
        "close on the honest asymmetry of the whole affair: a live render " +
        "is session state, and only what is baked to native content " +
        "survives the file being closed.",
      style: STYLE.deck,
    },
  ]);
  const rule = await plate(ctx, page, [48, 444, 300, 446], SWATCH.vermilion);

  const label = await specLabel(ctx, page, [
    "Specimen No. 170",
    "chapter opener",
    "C-Opener master",
    "paged.web — HTML/CSS as placed content",
  ]);

  return {
    title: "Ch.17 opener — The Long Read",
    covers: [],
    elements: [number.frameId, title.frameId, deck.frameId, rule, label],
  };
}
