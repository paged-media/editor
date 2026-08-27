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

// Ch.16 opener (p95, C-Opener recto) — the number, the title, and the
// honesty deck this chapter is built on: what you can TOUCH in a
// spreadsheet here is session state, and what PERSISTS is the workbook
// part plus everything lowered to native page content. The chapter then
// spends seven pages proving both halves.

import { plate, proseFrame, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const page = p(95);

  const number = await proseFrame(ctx, page, [48, 100, 220, 196], [
    { text: "16", style: STYLE.chapterNumber },
  ]);
  const title = await proseFrame(ctx, page, [48, 200, 480, 252], [
    { text: "The Ledger", style: STYLE.chapterTitle },
  ]);
  const deck = await proseFrame(ctx, page, [48, 264, 448, 430], [
    {
      text:
        "A spreadsheet in a page document leads two lives, and this chapter " +
        "refuses to blur them. The live grid you can type into — the one " +
        "that recalculates under your fingers — is a scene-layer session: " +
        "it dies the moment the file is saved and reopened. What persists " +
        "is the workbook itself, travelling in the container as a part, and " +
        "everything the plugin LOWERS to native content: tables that are " +
        "real tables, charts that are real paths and label frames. The " +
        "pages that follow lower ten charts, pour a range, spill a formula, " +
        "walk a day-book across a gutter, and end by asking the container " +
        "what it actually carries.",
      style: STYLE.deck,
    },
  ]);
  const rule = await plate(ctx, page, [48, 440, 300, 442], SWATCH.vermilion);

  const label = await specLabel(ctx, page, [
    "Specimen No. 150",
    "chapter opener",
    "C-Opener master",
    "paged.sheet — the workbook chapter",
  ]);

  return {
    title: "Ch.16 opener — The Ledger",
    covers: [],
    elements: [number.frameId, title.frameId, deck.frameId, rule, label],
  };
}
