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

// Part III divider — p119/p120, D-Plate. The same design language as
// the Part I and Part II dividers (a Paper Warm field, the vermilion
// rule, the part title on the recto, the epigraph on its back). Part
// III turns from making the book to SENDING IT AWAY — the press pass,
// the container, and the honest ledger of what each exit can carry.

import { plate, proseFrame, specLabel } from "../../annual-support";
import {
  LAYER,
  STYLE,
  SWATCH,
  TRIM_H_PT,
  TRIM_W_PT,
  p,
} from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];

  // Recto p119 — the full-bleed field, then the part title on it.
  const field = await plate(
    ctx,
    p(119),
    [0, 0, TRIM_W_PT, TRIM_H_PT],
    SWATCH.paperWarm,
    LAYER.background,
  );
  elements.push(field);

  const rule = await plate(
    ctx,
    p(119),
    [60, 286, 200, 289],
    SWATCH.vermilion,
    LAYER.content,
  );
  elements.push(rule);

  const title = await proseFrame(ctx, p(119), [60, 300, 480, 430], [
    { text: "Part III — The Press", style: STYLE.partTitle },
  ]);
  elements.push(title.frameId);

  // Verso p120 — the epigraph, in the annual's own voice.
  const epigraph = await proseFrame(ctx, p(120), [60, 280, 480, 470], [
    {
      text:
        "Part I set the type and Part II ran the studios; Part III sends the book away. What follows is the press pass: the sheet's own anatomy drawn in the page's own geometry, a preflight the engine runs on itself, the container opened part by part, and the loss ledger — the exact list of what each exit can carry and what it must leave behind. Then the appendix, where every limit this book has recorded in its margins finally lands.",
      style: STYLE.deck,
    },
  ]);
  elements.push(epigraph.frameId);

  elements.push(
    await specLabel(ctx, p(119), [
      "Specimen No. 186",
      "D-Plate — no furniture",
      "authored field + part title",
    ]),
  );

  return {
    title: "Part III divider",
    covers: ["color-swatches.fill-stroke-apply", "stories-text.text.insert"],
    elements,
  };
}
