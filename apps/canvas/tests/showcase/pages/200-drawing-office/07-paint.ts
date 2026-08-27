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

// Draw paint — p82, B-Body verso. Three registers of paged.draw's
// paint vocabulary:
//
//   · GRADIENTS as commands. A gradient assignment is a multi-mutation
//     flow (two stop swatches, a GradientSpec over them, a colorRef at
//     the result) — above the schema panel's scalar binding ceiling,
//     which is why each preset is a COMMAND.
//   · PATTERN as a tile FIELD, not a swatch — and the page says why:
//     the engine has no pattern paint type (RFI C-31), so Make bakes a
//     re-plannable field of real copies, and Release keeps every copy
//     while dropping the recipe.
//   · The four DASH presets on four lines.

import { expect } from "@playwright/test";

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import { newRefs, settle } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  corner,
  draw,
  path,
  polygons,
  propOf,
  readDrawPart,
  reseat,
  spreadOffset,
} from "./00-support";

interface PatternLibrary {
  fields: Array<{ id: string; name: string }>;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(82);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];
  const offset = await spreadOffset(ctx, pageId);

  const ink = await doc.swatch(SWATCH.ink);
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const layerContent = await doc.layerId(LAYER.content);

  const head = await proseFrame(ctx, page, [left, 54, right, 82], [
    { text: "Paint, three ways", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, page, [left, 86, right, 126], [
    {
      text:
        "Gradient fills minted by command, a pattern that is honestly a field of copies, and the dash presets. Everything is swatches, stops and stroke attributes the document itself owns.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── gradients — the two preset commands ──────────────────────────
  const gradTile = async (x: number): Promise<string> => {
    const id = await doc.rectangle(pageId, [x, 140, x + 140, 240]);
    await doc.setProperty("rectangle", id, "itemLayer", {
      type: "text",
      value: layerContent,
    });
    elements.push(id);
    return id;
  };
  const linTile = await gradTile(60);
  const radTile = await gradTile(230);

  await doc.select("rectangle", linTile);
  await draw(ctx, "fillGradientLinear");
  await expect
    .poll(
      async () =>
        String(
          (await propOf(ctx, { kind: "rectangle", id: linTile }, "frameFillColor"))
            ?.value ?? "",
        ),
      { message: "the linear preset pointed the fill at a gradient", timeout: 10_000 },
    )
    .toContain("Gradient/");
  await doc.select("rectangle", radTile);
  await draw(ctx, "fillGradientRadial");
  await expect
    .poll(
      async () =>
        String(
          (await propOf(ctx, { kind: "rectangle", id: radTile }, "frameFillColor"))
            ?.value ?? "",
        ),
      { message: "the radial preset pointed the fill at a gradient", timeout: 10_000 },
    )
    .toContain("Gradient/");

  const gradCaption = await proseFrame(ctx, page, [left, 250, right, 288], [
    {
      text:
        "Fill: Linear gradient and Fill: Radial gradient. Each invocation created two stop swatches and a real GradientSpec, then pointed the frame's fill reference at it - collection creates return no id on the wire, so the bundle names its swatches up front and refers by name.",
      style: STYLE.caption,
    },
  ]);
  elements.push(gradCaption.frameId);

  // ── pattern — make a brick field from a motif, then release ──────
  const motif = await path(
    ctx,
    pageId,
    [corner(75, 316), corner(90, 331), corner(75, 346), corner(60, 331)],
    false,
    { fill: vermilion, stroke: ink, weight: 1.5 },
  );
  await doc.setProperty("polygon", motif, "itemLayer", {
    type: "text",
    value: layerContent,
  });
  elements.push(motif);

  const beforePattern = await polygons(ctx);
  await doc.select("polygon", motif);
  // fitToArtboard OFF on this verso: the planner tests plan coordinates
  // against the page rect, and on the offset page of a facing spread
  // those disagree by one page width (the measured seam — margin note).
  await draw(ctx, "makePatternFromSelection", {
    name: "Annual weave",
    layout: "brick",
    rows: 3,
    columns: 8,
    spacing: [6, 6],
    dim: 70,
    fitToArtboard: false,
  });
  const patterned = await settle(
    ctx.page,
    async () => (await polygons(ctx)).length > beforePattern.length,
    15_000,
  );
  expect(patterned, "the pattern field minted tiles").toBe(true);
  const tiles = await newRefs(ctx.page, "polygon", beforePattern);
  await reseat(ctx, tiles, offset);
  for (const ref of tiles) elements.push(ref.id);
  await doc.batch(
    tiles.map((ref) => ({
      op: "setElementProperty",
      args: {
        elementId: ref,
        path: "itemLayer",
        value: { type: "text", value: layerContent },
      },
    })),
  );

  const patLib = await readDrawPart<PatternLibrary>(ctx, "pattern.json");
  const field = patLib?.fields.find((f) => f.name === "Annual weave");
  expect(field, "the pattern recipe part records the field").toBeTruthy();
  await draw(ctx, "releasePatternField", { patternId: field!.id });
  const releasedField = await settle(
    ctx.page,
    async () => {
      const lib = await readDrawPart<PatternLibrary>(ctx, "pattern.json");
      return !(lib?.fields ?? []).some((f) => f.id === field!.id);
    },
    10_000,
  );
  expect(releasedField, "release dropped the pattern recipe").toBe(true);

  const patCaption = await proseFrame(ctx, page, [left, 452, right, 508], [
    {
      text:
        `One diamond motif became ${tiles.length} copies in a brick lattice - 8 columns, 3 rows, 6 pt gutters, the copies dimmed to 70% opacity. This is ARTWORK, not a pattern swatch: the engine has no pattern paint type, so the field is a recipe over real elements, re-plannable until Release - which kept every copy you see and dropped only the tracking.`,
      style: STYLE.caption,
    },
  ]);
  elements.push(patCaption.frameId);

  // ── the four dash presets ────────────────────────────────────────
  const dashLine = async (y: number): Promise<string> => {
    const id = await path(ctx, pageId, [corner(60, y), corner(460, y)], true, {
      stroke: ink,
      weight: 2.5,
    });
    await doc.setProperty("polygon", id, "itemLayer", {
      type: "text",
      value: layerContent,
    });
    elements.push(id);
    return id;
  };
  const presets = [
    "strokeDashSolid",
    "strokeDashDashed",
    "strokeDashDotted",
    "strokeDashDashDot",
  ] as const;
  const dashIds: string[] = [];
  for (const [i, preset] of presets.entries()) {
    const id = await dashLine(528 + i * 14);
    dashIds.push(id);
    await doc.select("polygon", id);
    await draw(ctx, preset);
  }
  await expect
    .poll(
      async () => {
        const v = await propOf(
          ctx,
          { kind: "polygon", id: dashIds[1] },
          "frameStrokeDashArray",
        );
        return v?.type === "lengths" ? (v.value as number[]) : [];
      },
      { message: "the Dashed preset committed its documented 6/3 run", timeout: 10_000 },
    )
    .toEqual([6, 3]);

  const dashCaption = await proseFrame(ctx, page, [left, 592, right, 622], [
    {
      text:
        "Solid, Dashed (6/3), Dotted, Dash-dot - the four stroke presets, each one command over the selected line's real dash-array attribute.",
      style: STYLE.caption,
    },
  ]);
  elements.push(dashCaption.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 120",
      "fillGradientLinear/Radial",
      "makePatternFromSelection · releasePatternField",
      "strokeDash Solid/Dashed/Dotted/DashDot",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "no pattern SWATCH exists to make (RFI C-31: no pattern paint type in IDML, the model or the wire) - the field above is the honest form; its tiles minted one page width off on this facing-spread verso (reads answer spread coordinates, inserts re-base page-local) and were re-homed by one transform batch → Appendix A",
    ),
  );
  notes.push(
    "plugin-draw.pattern-bake is registry-partial (core.renderer: planned) — demonstrated on this page, deliberately not claimed",
  );

  return {
    title: "Paint, three ways",
    covers: [
      "plugin-draw.stroke-dash-commands",
      "plugin-draw.pro-path-toolset",
    ],
    elements,
    notes,
  };
}
