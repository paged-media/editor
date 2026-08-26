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

// Part I divider — the quietest pages in the book, on the loudest
// master. D-Plate carries no furniture and no margins, so everything
// here is authored: a Paper Warm field with the part title on the
// recto (p11), and the epigraph on its back (p12). Deliberately
// simple; the next seven pages take the machine apart.
//
// Geometry is page-space (x0, y0, x1, y1) per the driver helpers.

import { plate, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, TRIM_H_PT, TRIM_W_PT, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];

  // Recto p11 — the full-bleed field, then the part title on it.
  const field = await plate(
    ctx,
    p(11),
    [0, 0, TRIM_W_PT, TRIM_H_PT],
    SWATCH.paperWarm,
    LAYER.background,
  );
  elements.push(field);

  const rule = await plate(
    ctx,
    p(11),
    [60, 286, 200, 289],
    SWATCH.vermilion,
    LAYER.content,
  );
  elements.push(rule);

  const title = await proseFrame(ctx, p(11), [60, 300, 480, 430], [
    { text: "Part I — The Document", style: STYLE.partTitle },
  ]);
  elements.push(title.frameId);

  // Verso p12 — the epigraph, in the annual's own voice.
  const epigraph = await proseFrame(ctx, p(12), [60, 280, 480, 430], [
    {
      text: "A book that sets itself owes its reader an account of how. The next eight pages are that account: the grid this page hangs on, the masters that stamp its furniture, the layers it stacks, and the conditions under which any of it is visible.",
      style: STYLE.deck,
    },
  ]);
  elements.push(epigraph.frameId);

  elements.push(
    await specLabel(ctx, p(11), [
      "Specimen No. 6",
      "D-Plate — no furniture",
      "authored field + title",
    ]),
  );

  return {
    title: "Part I divider",
    covers: ["color-swatches.fill-stroke-apply", "stories-text.text.insert"],
    elements,
  };
}
