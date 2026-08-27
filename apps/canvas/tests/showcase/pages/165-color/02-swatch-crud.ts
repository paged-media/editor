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

// Swatch + group surgery, live (p62, B-Body verso).
//
// Two Press Greys are minted through createSwatch; one is then EDITED
// in place, so the pair of chips shows the before and the after of the
// same operation instead of asserting that an edit happened. A scratch
// swatch and a scratch group run the full create → delete triple,
// transiently. The colour group holding the greys is created and then
// RENAMED through editColorGroup. The headline wears its own subject:
// characterFillColor paints the words "PRESS GREY" in the ink they
// name. The closing exhibit sets frameOverprintFill/Stroke on a square
// straddling a vermilion band, beside an identical square without
// them, and the margin note says where overprint is actually honoured.

import { expect } from "@playwright/test";

import {
  assignLayer,
  marginNote,
  plate,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER } from "../../names-annual";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { chip, groupList, swatchList, transient } from "./00-support";

const AS_MINTED_ID = "Color/AnnualPressGreyAsMinted";
const PRESS_GREY_ID = "Color/AnnualPressGrey";
const GROUP_ID = "ColorGroup/AnnualLive";

/** The birth build both greys share, and the edit's replacement. */
const BORN = [0, 0, 0, 55];
const EDITED = [26, 18, 12, 62];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const page = p(62);
  const elements: string[] = [];

  // ── the wire work first, so the prose can state what HAPPENED ────
  const mint = (selfId: string, name: string, value: number[]) =>
    doc.mutate("createSwatch", {
      spec: {
        selfId,
        name,
        space: "CMYK",
        value,
        model: "Process",
        alternateSpace: null,
        alternateValue: [],
        tint: null,
        alpha: null,
      },
    });

  await mint(AS_MINTED_ID, "Press Grey (as minted)", BORN);
  await mint(PRESS_GREY_ID, "Press Grey", BORN);
  // The edit: a whole-spec replace on the same identity. Every chip
  // referencing the id repaints; the name survives because the spec
  // carries it.
  await doc.mutate("editSwatch", {
    swatchId: PRESS_GREY_ID,
    spec: {
      selfId: PRESS_GREY_ID,
      name: "Press Grey",
      space: "CMYK",
      value: EDITED,
      model: "Process",
      alternateSpace: null,
      alternateValue: [],
      tint: null,
      alpha: null,
    },
  });

  // Scratch pair — the full create → delete triple, transiently. The
  // deletions are real wire ops; the checkpoint carries no trace.
  await transient(doc, async () => {
    await mint("Color/AnnualScratchCyan", "Scratch Cyan", [85, 10, 0, 0]);
    await doc.mutate("deleteSwatch", { swatchId: "Color/AnnualScratchCyan" });
    await doc.mutate("createColorGroup", {
      spec: { selfId: "ColorGroup/AnnualScratch", name: "Scratch Group", members: [] },
    });
    await doc.mutate("deleteColorGroup", {
      groupId: "ColorGroup/AnnualScratch",
    });
  });

  // The resident group: created holding both greys, then renamed —
  // editColorGroup is a whole-spec replace too, so the members ride
  // along with the new name.
  await doc.mutate("createColorGroup", {
    spec: {
      selfId: GROUP_ID,
      name: "Annual Live",
      members: [AS_MINTED_ID, PRESS_GREY_ID],
    },
  });
  await doc.mutate("editColorGroup", {
    groupId: GROUP_ID,
    spec: {
      selfId: GROUP_ID,
      name: "Annual Live Inks",
      members: [AS_MINTED_ID, PRESS_GREY_ID],
    },
  });

  // The oracle: the collection a reader's Swatches panel shows.
  const names = (await swatchList(doc)).map((s) => s.name);
  expect(names).toContain("Press Grey");
  expect(names).toContain("Press Grey (as minted)");
  expect(names).not.toContain("Scratch Cyan");
  const groups = await groupList(doc);
  const liveGroup = groups.find((g) => g.name === "Annual Live Inks");
  expect(liveGroup?.members ?? []).toHaveLength(2);
  expect(groups.map((g) => g.name)).not.toContain("Scratch Group");

  // ── the page ─────────────────────────────────────────────────────
  const head = await proseFrame(ctx, page, [60, 58, 492, 90], [
    { text: "Minting ink", style: STYLE.head1 },
  ]);
  // The headline that wears its subject: characterFillColor on the
  // words PRESS GREY, in Press Grey.
  const strapText = "SEVEN INKS, AND NOW A PRESS GREY";
  const strap = await proseFrame(ctx, page, [60, 94, 492, 120], [
    { text: strapText, style: STYLE.head2 },
  ]);
  await doc.setProperty(
    "storyRange",
    doc.storyRangeId(
      strap.storyId,
      strapText.indexOf("PRESS GREY"),
      strapText.length,
    ),
    "characterFillColor",
    { type: "colorRef", value: PRESS_GREY_ID },
  );
  elements.push(head.frameId, strap.frameId);

  const intro = await proseFrame(ctx, page, [60, 128, 492, 240], [
    {
      text:
        "Two swatches were created on this page and one of them was then " +
        "edited in place. Both were born as the same flat 55% black; the " +
        "right-hand chip's definition was replaced with a cooler " +
        "26/18/12/62 build through editSwatch, and every reference to it — " +
        "including the words PRESS GREY above — repainted, because a chip " +
        "holds an identity, not a colour. A third swatch, Scratch Cyan, and " +
        "a Scratch Group ran the whole create-then-delete round transiently: " +
        "demonstrated, not resident. The group holding the greys was born " +
        "Annual Live and renamed Annual Live Inks through editColorGroup " +
        "without disturbing its two members.",
      style: STYLE.body,
    },
  ]);
  elements.push(intro.frameId);

  elements.push(
    ...(await chip(
      ctx,
      page,
      [60, 252, 122, 280],
      { id: AS_MINTED_ID },
      [60, 284, 264, 322],
      "Press Grey (as minted) · CMYK 0/0/0/55 — the birth build, untouched.",
    )),
    ...(await chip(
      ctx,
      page,
      [288, 252, 350, 280],
      { id: PRESS_GREY_ID },
      [288, 284, 492, 322],
      "Press Grey · CMYK 26/18/12/62 — the same identity after editSwatch.",
    )),
  );

  // ── overprint ────────────────────────────────────────────────────
  const overHead = await proseFrame(ctx, page, [60, 338, 492, 366], [
    { text: "Overprint, declared", style: STYLE.head2 },
  ]);
  elements.push(overHead.frameId);
  const band = await plate(ctx, page, [60, 408, 492, 452], SWATCH.vermilion);
  elements.push(band);

  const knockout = await doc.rectangle(ctx.pageIds[0], [96, 378, 156, 438]);
  await doc.setProperty("rectangle", knockout, "frameFillColor", {
    type: "colorRef",
    value: PRESS_GREY_ID,
  });
  const overprinted = await doc.rectangle(ctx.pageIds[0], [246, 378, 306, 438]);
  await doc.batch([
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: overprinted },
        path: "frameFillColor",
        value: { type: "colorRef", value: PRESS_GREY_ID },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: overprinted },
        path: "frameStrokeColor",
        value: { type: "colorRef", value: await doc.swatch(SWATCH.slate) },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: overprinted },
        path: "frameStrokeWeight",
        value: { type: "length", value: 2 },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: overprinted },
        path: "frameOverprintFill",
        value: { type: "bool", value: true },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: overprinted },
        path: "frameOverprintStroke",
        value: { type: "bool", value: true },
      },
    },
  ]);
  await assignLayer(ctx, "rectangle", knockout, LAYER.content);
  await assignLayer(ctx, "rectangle", overprinted, LAYER.content);
  elements.push(knockout, overprinted);

  const overCaption = await proseFrame(ctx, page, [60, 462, 492, 512], [
    {
      text:
        "Two identical Press Grey squares straddle the vermilion band. The " +
        "left one knocks out, as every fill does by default; the right one " +
        "carries frameOverprintFill and frameOverprintStroke, so at the " +
        "press its grey lays down ON TOP of the vermilion instead of " +
        "punching a hole in that plate.",
      style: STYLE.caption,
    },
  ]);
  elements.push(overCaption.frameId);

  await marginNote(
    ctx,
    page,
    "Overprint is honoured plane-aware on the CPU composite; this RGB proof approximates the ink build-up, and the separations are the real evidence. Scratch swatch and group: demonstrated, not resident. → Appendix A",
  );
  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 91",
      "createSwatch ×3",
      "editSwatch",
      "deleteSwatch (transient)",
      "createColorGroup ×2 · editColorGroup · deleteColorGroup (transient)",
      "characterFillColor",
      "frameOverprintFill/Stroke",
    ]),
  );

  return {
    title: "Minting ink — swatch and group CRUD",
    covers: [
      "color-swatches.swatch.crud",
      "color-swatches.color-groups",
      "color-swatches.character-fill",
      "color-swatches.overprint",
      "color-swatches.fill-stroke-apply",
    ],
    elements,
  };
}
