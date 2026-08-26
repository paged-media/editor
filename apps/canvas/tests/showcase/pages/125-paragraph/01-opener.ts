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

// Ch.3 opener — p23, C-Opener recto. The display chain the fixture
// declares (Chapter Number, Chapter Title, Deck) carries the whole
// page; the deck states the chapter's argument: line breaking is the
// heart of composition.

import { proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];

  const deck =
    "Letters make words; the paragraph is where they start to argue. " +
    "A composer worth the name does not break lines one at a time - it " +
    "weighs the whole paragraph at once. This chapter watches it do so: " +
    "the breaks, the keeps, the caps, and the parameters that steer them.";

  const title = await proseFrame(ctx, p(23), [48, 140, 440, 470], [
    { text: "3", style: STYLE.chapterNumber },
    { text: "The Paragraph", style: STYLE.chapterTitle },
    { text: deck, style: STYLE.deck },
  ]);
  elements.push(title.frameId);

  elements.push(
    await specLabel(ctx, p(23), [
      "Specimen No. 20",
      "C-Opener",
      "Chapter Number",
      "Chapter Title",
      "Deck",
    ]),
  );

  return {
    title: "Ch.3 opener — The Paragraph",
    covers: ["stories-text.style-apply-range"],
    elements,
  };
}
