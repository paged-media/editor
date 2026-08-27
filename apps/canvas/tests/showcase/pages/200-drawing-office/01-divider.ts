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

// Part II divider — p75/p76, D-Plate. The same design language as the
// Part I divider (110-anatomy/01-divider): a Paper Warm field with a
// vermilion rule and the part title on the recto, the epigraph on its
// back. Part II turns from the document to the STUDIOS — the plugin
// floors — and the epigraph says what that means for the next fifty
// pages.

import { plate, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, TRIM_H_PT, TRIM_W_PT, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];

  // Recto p75 — the full-bleed field, then the part title on it.
  const field = await plate(
    ctx,
    p(75),
    [0, 0, TRIM_W_PT, TRIM_H_PT],
    SWATCH.paperWarm,
    LAYER.background,
  );
  elements.push(field);

  const rule = await plate(
    ctx,
    p(75),
    [60, 286, 200, 289],
    SWATCH.vermilion,
    LAYER.content,
  );
  elements.push(rule);

  // Two paragraphs, not one: at Part Title size the single line breaks
  // as "Stu-dios", and a hyphenated part title is not a divider.
  const title = await proseFrame(ctx, p(75), [60, 300, 480, 470], [
    { text: "Part II —", style: STYLE.partTitle },
    { text: "The Studios", style: STYLE.partTitle },
  ]);
  elements.push(title.frameId);

  // Verso p76 — the epigraph, in the annual's own voice.
  const epigraph = await proseFrame(ctx, p(76), [60, 280, 480, 460], [
    {
      text:
        "Part I set type on a page the editor owns end to end. Part II walks the studios that rent space inside it: a drawing office, a darkroom, a ledger room — each a plugin speaking to the same engine through the same wire, minting the same native objects a hand would. The next chapter belongs to paged.draw, and everything it leaves on these pages is anchors, swatches and strokes; nothing is a picture of a drawing.",
      style: STYLE.deck,
    },
  ]);
  elements.push(epigraph.frameId);

  elements.push(
    await specLabel(ctx, p(75), [
      "Specimen No. 114",
      "D-Plate — no furniture",
      "authored field + part title",
    ]),
  );

  return {
    title: "Part II divider",
    covers: ["color-swatches.fill-stroke-apply", "stories-text.text.insert"],
    elements,
  };
}
