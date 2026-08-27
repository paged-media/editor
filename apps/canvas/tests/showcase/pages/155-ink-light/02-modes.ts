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

// The blend-mode plate — D-Plate spread, p54–p55. One constant motif
// per tile (a slate oval and a vermilion oval overlapping on the Paper
// Warm field), sixteen times, with the marigold overlay square the only
// thing that changes: each carries one `frameBlendMode` value. A 4×4
// grid across the spread — two columns per page, four rows, 12 pt
// gutters on the book's own 54 pt plate margin — labels in small caps
// under every tile.
//
// The sixteen strings are the engine's whole IDML BlendMode vocabulary,
// verbatim from paged-renderer's `blend_mode_from_idml` match (and the
// Effects panel's select): an out-of-list string silently composites as
// Normal, so the plate enumerates rather than improvises.

import { plate, proseFrame, specLabel } from "../../annual-support";
import {
  CHAR,
  LAYER,
  STYLE,
  SWATCH,
  TRIM_H_PT,
  TRIM_W_PT,
  p,
} from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

/** The full IDML blend-mode vocabulary, Adobe's PDF catalogue order. */
const MODES = [
  "Normal",
  "Multiply",
  "Screen",
  "Overlay",
  "Darken",
  "Lighten",
  "ColorDodge",
  "ColorBurn",
  "HardLight",
  "SoftLight",
  "Difference",
  "Exclusion",
  "Hue",
  "Saturation",
  "Color",
  "Luminosity",
] as const;

// Plate grid: 2 columns × 4 rows per page (4×4 across the spread).
const GRID_X = 54;
const GRID_Y = 118;
const TILE_W = 210;
const TILE_H = 100;
const GUTTER = 12;
const PITCH = 128; // tile + label + gap

/** One page-half of the plate: field, header, eight tiles. */
async function half(
  ctx: PageContext,
  pageIndex: number,
  pageId: string,
  contentLayerId: string,
  swatchIds: { slate: string; vermilion: string; marigold: string },
  modes: readonly string[],
  numberOffset: number,
  header: { title: string; caption: string },
): Promise<string[]> {
  const { doc } = ctx;
  const elements: string[] = [];

  // The Paper Warm field, full trim — D-Plate carries no furniture.
  elements.push(
    await plate(ctx, pageIndex, [0, 0, TRIM_W_PT, TRIM_H_PT], SWATCH.paperWarm),
  );

  const head = await proseFrame(ctx, pageIndex, [54, 40, 486, 76], [
    { text: header.title, style: STYLE.head1 },
  ]);
  elements.push(head.frameId);
  const caption = await proseFrame(ctx, pageIndex, [54, 80, 486, 112], [
    { text: header.caption, style: STYLE.caption },
  ]);
  elements.push(caption.frameId);

  for (const [i, mode] of modes.entries()) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = GRID_X + col * (TILE_W + GUTTER);
    const y = GRID_Y + row * PITCH;

    // The constant motif: slate under, vermilion over, both soft ovals.
    const ovalA = await doc.oval(pageId, [x + 8, y + 18, x + 118, y + 92]);
    const ovalB = await doc.oval(pageId, [x + 58, y + 8, x + 168, y + 82]);
    // The overlay square — the only variable on the plate.
    const top = await doc.rectangle(pageId, [x + 88, y + 22, x + 200, y + 94]);
    elements.push(ovalA, ovalB, top);

    const fill = (kind: string, id: string, value: string) => ({
      op: "setElementProperty",
      args: {
        elementId: { kind, id },
        path: "frameFillColor",
        value: { type: "colorRef", value },
      },
    });
    const layer = (kind: string, id: string) => ({
      op: "setElementProperty",
      args: {
        elementId: { kind, id },
        path: "itemLayer",
        value: { type: "text", value: contentLayerId },
      },
    });
    await doc.batch([
      fill("oval", ovalA, swatchIds.slate),
      fill("oval", ovalB, swatchIds.vermilion),
      fill("rectangle", top, swatchIds.marigold),
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "rectangle", id: top },
          // The IDML enum string, verbatim — an unknown string would
          // composite as Normal without a word of complaint.
          path: "frameBlendMode",
          value: { type: "text", value: mode },
        },
      },
      layer("oval", ovalA),
      layer("oval", ovalB),
      layer("rectangle", top),
      // LAST, after the layer writes: ovals z-slot above a rectangle
      // inserted after them (the first preview showed every overlay
      // square swallowed by the motif), so the overlay is reordered to
      // the front explicitly — it must blend over BOTH ovals and the
      // field, or the plate compares nothing.
      {
        op: "reorderElement",
        args: { elementId: { kind: "rectangle", id: top }, to: "front" },
      },
    ]);

    const label = await proseFrame(
      ctx,
      pageIndex,
      [x, y + TILE_H + 3, x + TILE_W, y + TILE_H + 23],
      [
        {
          text: `${numberOffset + i + 1} · ${mode}`,
          style: STYLE.caption,
          charRanges: [
            {
              start: 0,
              end: `${numberOffset + i + 1} · ${mode}`.length,
              style: CHAR.smallCaps,
            },
          ],
        },
      ],
    );
    elements.push(label.frameId);
  }

  return elements;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const contentLayerId = await doc.layerId(LAYER.content);
  const swatchIds = {
    slate: await doc.swatch(SWATCH.slate),
    vermilion: await doc.swatch(SWATCH.vermilion),
    marigold: await doc.swatch(SWATCH.labMarigold),
  };

  const elements = [
    ...(await half(
      ctx,
      p(54),
      ctx.pageIds[0],
      contentLayerId,
      swatchIds,
      MODES.slice(0, 8),
      0,
      {
        title: "The sixteen modes",
        caption:
          "One motif, sixteen compositors. Two soft shapes and a marigold square, identical on every tile; only frameBlendMode changes.",
      },
    )),
    ...(await half(
      ctx,
      p(55),
      ctx.pageIds[1],
      contentLayerId,
      swatchIds,
      MODES.slice(8),
      8,
      {
        title: "Hard Light to Luminosity",
        caption:
          "The second eight trade tone for colour: the last four blend hue, saturation, colour and luminosity rather than darkness.",
      },
    )),
  ];

  elements.push(
    await specLabel(ctx, p(54), [
      "Specimen No. 81",
      "frameBlendMode ×16 · Normal → Luminosity",
      "insertOval / insertFrame / batch",
      "D-Plate",
    ]),
  );

  return {
    title: "The sixteen blend modes",
    covers: ["effects-transparency.blend-modes"],
    elements,
  };
}
