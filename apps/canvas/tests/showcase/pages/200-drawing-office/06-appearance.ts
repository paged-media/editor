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

// The appearance stack + graphic styles — p81, B-Body recto.
//
// AN IDML FRAME HAS ONE FILL AND ONE STROKE, and this page does not
// pretend otherwise. paged.draw's appearance is a metadata STACK on
// the element's own envelope plus a front-most-layer bake to the
// frame's real paint; the faithful N-layer lowering (B-24) is a GROUP
// of stacked single-paint page items sharing the source's geometry —
// ordinary IDML, which is why it exports. The page builds the same
// stack twice: the LIVE twin keeps the metadata form, the second is
// group-BAKED, and the two render alike — that likeness is the
// exhibit.
//
// GRAPHIC STYLES are the LINK, not a clipboard: three tiles share one
// saved style, a redefine propagates through the link (overrides
// overwritten, as the command warns), and a broken link keeps its
// appearance while the others move on.

import { expect } from "@playwright/test";

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import { newRefs, partitionByPage, settle } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  corner,
  draw,
  path,
  polygons,
  propOf,
  readDrawPart,
  spreadOffset,
} from "./00-support";

interface GraphicStyleLibrary {
  styles: Array<{ id: string; name: string }>;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const covers: string[] = ["plugin-draw.appearance"];
  const page = p(81);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];
  const offset = await spreadOffset(ctx, pageId);
  // eslint-disable-next-line no-console
  console.log(`[200] p81 spread offset measured: [${offset.join(", ")}]`);

  const ink = await doc.swatch(SWATCH.ink);
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const marigold = await doc.swatch(SWATCH.labMarigold);
  const screenBlue = await doc.swatch(SWATCH.screenBlue);
  const slate = await doc.swatch(SWATCH.slate);
  const layerContent = await doc.layerId(LAYER.content);

  const head = await proseFrame(ctx, page, [left, 54, right, 82], [
    { text: "The appearance stack", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, page, [left, 86, right, 126], [
    {
      text:
        "An IDML frame owns one fill and one stroke. The stack below is plugin metadata plus a bake: the left blob is LIVE (stack on the envelope, front-most layer on the frame), the right one is the same stack lowered to a carrier group of single-paint items.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the twins ────────────────────────────────────────────────────
  const blob = async (cx: number, cy: number): Promise<string> => {
    const r = 52;
    const id = await path(
      ctx,
      pageId,
      [
        { anchor: [cx, cy - r], left: [cx - 30, cy - r], right: [cx + 30, cy - r] },
        { anchor: [cx + r, cy], left: [cx + r, cy - 30], right: [cx + r, cy + 30] },
        { anchor: [cx, cy + r], left: [cx + 30, cy + r], right: [cx - 30, cy + r] },
        { anchor: [cx - r, cy], left: [cx - r, cy + 30], right: [cx - r, cy - 30] },
      ],
      false,
      { fill: vermilion, stroke: ink, weight: 6 },
    );
    await doc.setProperty("polygon", id, "itemLayer", {
      type: "text",
      value: layerContent,
    });
    elements.push(id);
    return id;
  };

  const stackOn = async (id: string): Promise<void> => {
    await doc.select("polygon", id);
    // Two extra strokes + one extra fill, seeded from the element's own
    // paint, then the top stroke walked one step down the stack.
    await draw(ctx, "appearanceAddStroke");
    await draw(ctx, "appearanceAddStroke");
    await draw(ctx, "appearanceAddFill");
    await draw(ctx, "appearanceMoveLayer", {
      kind: "stroke",
      index: 1,
      direction: "down",
    });
  };

  const liveTwin = await blob(140, 210);
  await stackOn(liveTwin);

  const bakedTwin = await blob(330, 210);
  await stackOn(bakedTwin);

  // ── the B-24 group bake, verified where it landed ────────────────
  let bakedLayers = 0;
  const beforeBake = await polygons(ctx);
  await doc.select("polygon", bakedTwin);
  await draw(ctx, "bakeAppearance");
  const bakeGrew = await settle(
    ctx.page,
    async () => (await polygons(ctx)).length > beforeBake.length,
    15_000,
  );
  if (bakeGrew) {
    const derived = await newRefs(ctx.page, "polygon", beforeBake);
    const where = await partitionByPage(ctx.page, derived, pageId);
    if (where.elsewhere.length > 0) {
      // The read-then-reinsert seam (measured on the versos) — if it
      // bites here too, release rather than leave stray artwork.
      await draw(ctx, "releaseAppearance");
      notes.push(
        `appearance bake landed ${where.elsewhere.length} derived layer(s) off this page — released, recorded, not shown`,
      );
    } else {
      bakedLayers = derived.length;
      for (const ref of derived) elements.push(ref.id);
    }
  } else {
    notes.push("appearance bake minted nothing — recorded");
  }

  const twinCaption = await proseFrame(ctx, page, [left, 286, right, 336], [
    {
      text:
        bakedLayers > 0
          ? `Two identical blobs, each carrying +1 fill and +2 strokes over their own paint, one stroke reordered by Appearance: Reorder layer. The left is live metadata; the right was group-baked into a carrier plus ${bakedLayers} derived single-paint layers. They render alike - that is the bake's whole claim, and release restores the carrier exactly.`
          : "Two identical blobs carrying the same appearance stack; the group bake's derived layers are recorded in the notes for this page.",
      style: STYLE.caption,
    },
  ]);
  elements.push(twinCaption.frameId);

  // ── graphic styles: save / apply / redefine / break link ─────────
  const tile = async (x: number): Promise<string> => {
    const id = await path(
      ctx,
      pageId,
      [corner(x, 380), corner(x + 88, 380), corner(x + 88, 448), corner(x, 448)],
      false,
      { fill: marigold, stroke: ink, weight: 2 },
    );
    await doc.setProperty("polygon", id, "itemLayer", {
      type: "text",
      value: layerContent,
    });
    elements.push(id);
    return id;
  };
  const t1 = await tile(70);
  const t2 = await tile(196);
  const t3 = await tile(322);

  await doc.select("polygon", t1);
  await draw(ctx, "saveGraphicStyle", { name: "Annual Tile" });
  const gsLib = await readDrawPart<GraphicStyleLibrary>(
    ctx,
    "graphic-styles.json",
  );
  const style = gsLib?.styles.find((s) => s.name === "Annual Tile");
  expect(style, "the graphic-style library holds Annual Tile").toBeTruthy();

  await doc.designer.selectElements([
    { kind: "polygon", id: t2 },
    { kind: "polygon", id: t3 },
  ]);
  await draw(ctx, "applyGraphicStyle", { styleId: style!.id });
  await expect
    .poll(
      async () =>
        (await propOf(ctx, { kind: "polygon", id: t2 }, "frameFillColor"))
          ?.value ?? "",
      { message: "apply linked tile 2 to the style", timeout: 10_000 },
    )
    .toBe(marigold);

  // Redefine: restyle the source directly (an OVERRIDE — the link
  // survives), then push the new look through the link.
  await doc.setProperty("polygon", t1, "frameFillColor", {
    type: "colorRef",
    value: screenBlue,
  });
  await doc.select("polygon", t1);
  await draw(ctx, "redefineGraphicStyle", { styleId: style!.id });
  await expect
    .poll(
      async () =>
        (await propOf(ctx, { kind: "polygon", id: t3 }, "frameFillColor"))
          ?.value ?? "",
      { message: "redefine propagated to tile 3", timeout: 10_000 },
    )
    .toBe(screenBlue);

  // Break tile 3's link, then redefine again — tile 2 follows, tile 3
  // keeps the blue it had when it left.
  await doc.select("polygon", t3);
  await draw(ctx, "breakGraphicStyleLink");
  await doc.setProperty("polygon", t1, "frameFillColor", {
    type: "colorRef",
    value: slate,
  });
  await doc.select("polygon", t1);
  await draw(ctx, "redefineGraphicStyle", { styleId: style!.id });
  await expect
    .poll(
      async () =>
        (await propOf(ctx, { kind: "polygon", id: t2 }, "frameFillColor"))
          ?.value ?? "",
      { message: "second redefine reached the still-linked tile 2", timeout: 10_000 },
    )
    .toBe(slate);
  expect(
    (await propOf(ctx, { kind: "polygon", id: t3 }, "frameFillColor"))?.value,
    "the broken link kept its appearance",
  ).toBe(screenBlue);
  covers.push("plugin-draw.graphic-styles");

  const gsCaption = await proseFrame(ctx, page, [left, 458, right, 516], [
    {
      text:
        "Three tiles, one saved style. Apply linked all three; a direct recolour of the first marked it overridden without breaking its link; Redefine pushed first blue, then slate, through every link it found. The third tile broke its link after the blue pass - it keeps that appearance while its neighbours moved on. A style that only copied values would be a clipboard; the link is the feature.",
      style: STYLE.caption,
    },
  ]);
  elements.push(gsCaption.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 119",
      "appearanceAddFill/AddStroke/MoveLayer",
      "bakeAppearance (B-24 carrier group)",
      "saveGraphicStyle/apply/redefine/breakLink",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "the front-most-layer bake is NOT a composite of N fills - it lowers the top opaque layer to the frame's single fill/stroke slots; the carrier-group bake is the faithful form, at 2 undo steps because insertPath mints ids a batch cannot address in itself → Appendix A",
    ),
  );

  return {
    title: "The appearance stack",
    covers,
    elements,
    notes,
  };
}
