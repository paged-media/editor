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

// Chapter 2 opener — The Letter. What a type specimen proves, and the
// terms the next three pages hold themselves to: every row names the
// property path it used, and a row that changes nothing says so.
//
// Geometry is page-space (x0, y0, x1, y1) per the driver helpers.

import { proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];

  const number = await proseFrame(ctx, p(19), [48, 54, 480, 132], [
    { text: "2", style: STYLE.chapterNumber },
  ]);
  elements.push(number.frameId);

  const title = await proseFrame(ctx, p(19), [48, 140, 480, 208], [
    { text: "The Letter", style: STYLE.chapterTitle },
  ]);
  elements.push(title.frameId);

  const deck = await proseFrame(ctx, p(19), [48, 218, 480, 288], [
    {
      text: "A type specimen does not prove that a face is beautiful. It proves that the engine can ask the face the right questions.",
      style: STYLE.deck,
    },
  ]);
  elements.push(deck.frameId);

  const prose = await proseFrame(ctx, p(19), [48, 300, 480, 580], [
    {
      text: "The faces in this book carry real feature tables: EB Garamond answers for swashes, small capitals, old-style figures and seven stylistic sets; JetBrains Mono for the slashed zero; Space Grotesk for tabular figures. The next spread asks for each feature by its property path and shows both states side by side.",
      style: STYLE.bodyFirst,
    },
    {
      text: "The terms are strict. A row whose feature the composer actually drives — ligatures, case, position, and every metric transform on the closing page — shows a genuine difference. A row whose feature the wire can only record is printed anyway, twice and identically, with the margin naming the limit. A specimen that hid its second kind of row would be an advertisement.",
      style: STYLE.body,
    },
  ]);
  elements.push(prose.frameId);

  elements.push(
    await specLabel(ctx, p(19), [
      "Specimen No. 13",
      "C-Opener battery",
      "the specimen's terms",
    ]),
  );

  return {
    title: "Chapter 2 opener — The Letter",
    covers: ["stories-text.style-apply-range"],
    elements,
  };
}
