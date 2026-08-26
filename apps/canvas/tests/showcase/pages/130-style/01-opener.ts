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

// Ch.4 opener — p27, C-Opener recto. The style system turned on
// itself: every paragraph in this book wears a named style, and this
// chapter shows where those names come from and what they carry.

import { proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];

  const deck =
    "Nothing in this book is formatted by hand. Every paragraph wears " +
    "a named style, and every style stands in a chain of inheritance " +
    "that ends at Annual Body. This chapter turns the system on " +
    "itself: the cascade, live creation and deletion, nested styles, " +
    "numbered lists, and the rules and tab stops a paragraph can carry.";

  const title = await proseFrame(ctx, p(27), [48, 140, 440, 470], [
    { text: "4", style: STYLE.chapterNumber },
    { text: "The Style", style: STYLE.chapterTitle },
    { text: deck, style: STYLE.deck },
  ]);
  elements.push(title.frameId);

  elements.push(
    await specLabel(ctx, p(27), [
      "Specimen No. 30",
      "C-Opener",
      "the style system",
    ]),
  );

  return {
    title: "Ch.4 opener — The Style",
    covers: ["stories-text.style-apply-range"],
    elements,
  };
}
