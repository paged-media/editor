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

// The capability-map poster — a D-Plate double spread mapping the
// system: engine op groups on the verso, the plugin constellation on
// the recto, tiled in the brand palette. The counts printed here are
// the campaign's real targets; the colophon settles them.

import { plate, proseFrame } from "../../annual-support";
import { LAYER, STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

const ENGINE_TILES: Array<[string, string]> = [
  ["Text & stories", "7 ops"],
  ["Frames & pages", "12 ops"],
  ["Path topology", "8 ops"],
  ["Pathfinder", "8 ops"],
  ["Grouping", "6 ops"],
  ["Layers", "7 ops"],
  ["Colour & swatches", "13 ops"],
  ["Style CRUD", "16 ops"],
  ["Tables", "13 ops"],
  ["Threading", "2 ops"],
  ["Sections & guides", "6 ops"],
  ["Masks · path text", "4 ops"],
];

const PLUGIN_TILES: Array<[string, string]> = [
  ["paged.draw", "92 commands"],
  ["paged.image", "128 kernels"],
  ["paged.sheet", "224 functions"],
  ["paged.web", "7 commands"],
  ["paged.data", "42-fn DSL"],
  ["paged.doc", "DOCX both ways"],
  ["paged.pdf", "PDF in"],
  ["paged.publish", "IDML both ways"],
];

async function tiles(
  ctx: PageContext,
  page: number,
  heading: string,
  entries: Array<[string, string]>,
  columns: number,
): Promise<string[]> {
  const elements: string[] = [];
  const head = await proseFrame(ctx, page, [54, 60, 486, 112], [
    { text: heading, style: STYLE.head1 },
  ]);
  elements.push(head.frameId);
  const w = (432 - (columns - 1) * 12) / columns;
  for (const [i, [name, count]] of entries.entries()) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = 54 + col * (w + 12);
    const y = 140 + row * 120;
    elements.push(
      await plate(
        ctx,
        page,
        [x, y, x + w, y + 96],
        i % 3 === 0 ? SWATCH.vermilionTint : SWATCH.paperWarm,
        LAYER.background,
      ),
    );
    const label = await proseFrame(ctx, page, [x + 10, y + 12, x + w - 10, y + 84], [
      { text: name, style: STYLE.head2 },
      { text: count, style: STYLE.specValue },
    ]);
    elements.push(label.frameId);
  }
  return elements;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements = [
    ...(await tiles(ctx, p(9), "The engine, by op group", ENGINE_TILES, 3)),
    ...(await tiles(ctx, p(10), "The studios", PLUGIN_TILES, 2)),
  ];
  return {
    title: "The capability map",
    covers: ["color-swatches.process-spot-tint"],
    elements,
  };
}
