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

// The cover — a full-bleed plate set by the machine it advertises:
// the fixture's Annual Ramp gradient as the field, the display chain
// for the lockup, one vermilion bar. D-Plate carries no furniture, so
// everything here is authored.

import { plate, proseFrame, assignLayer } from "../../annual-support";
import { GRADIENT_RAMP, LAYER, STYLE, SWATCH, TRIM_H_PT, TRIM_W_PT, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];

  // The gradient field. frameFillColor takes a colorRef to ANY palette
  // entry — a gradient's self-id included; the lookup resolves it by
  // name so a fixture rename fails loudly.
  const field = await doc.rectangle(pageId, [0, 0, TRIM_W_PT, TRIM_H_PT]);
  await doc.setProperty("rectangle", field, "frameFillColor", {
    type: "colorRef",
    value: await doc.gradient(GRADIENT_RAMP),
  });
  await assignLayer(ctx, "rectangle", field, LAYER.background);

  const bar = await plate(
    ctx,
    p(1),
    [54, 468, 306, 476],
    SWATCH.vermilion,
    LAYER.content,
  );

  const lockup = await proseFrame(ctx, p(1), [54, 356, 486, 460], [
    { text: "THE PAGED", style: STYLE.chapterNumber },
    { text: "ANNUAL", style: STYLE.chapterNumber },
  ]);
  const deck = await proseFrame(ctx, p(1), [54, 490, 486, 560], [
    {
      text: "Volume One — a specimen of the composing engine, set entirely by the engine it describes.",
      style: STYLE.deck,
    },
  ]);

  return {
    title: "Cover",
    covers: [
      "color-swatches.gradients",
      "color-swatches.fill-stroke-apply",
      "layers.item-assignment",
    ],
    elements: [field, bar, lockup.frameId, deck.frameId],
  };
}
