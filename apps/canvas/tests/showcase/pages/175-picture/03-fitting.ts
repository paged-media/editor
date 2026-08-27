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

// Fitting + the inline lane (p74, B-Body verso).
//
// One photograph, four fittings — contain, cover, stretch, and a
// pan/zoom through the inner image transform — each labeled with the
// exact properties that produced it. The fitting ENUM is persisted
// intent; what moves pixels is the CROPS (IDML spells "cover" as
// negative crops, and this engine draws that overhang unclipped, so
// the left exhibit shows its spill rather than hiding it) and the
// inner transform (the one fitting that IS clipped to the frame).
//
// The bottom band is the persistence argument: a frame whose link
// cannot resolve renders InDesign's grey placeholder once it is an
// image element; its neighbour started as the same unresolvable link
// and then took the bytes INLINE through replaceImageBytes — the lane
// that needs no asset resolver and survives the `.paged` round trip.

import { expect } from "@playwright/test";

import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import {
  clearImageBytes,
  derived,
  frameBoundsOf,
  photo,
  replaceBytesFromFile,
} from "./00-support";

const RIDGELINES = photo("pexels-1323550-ridgelines.jpg");
const RIDGE_URI = "assets/photos/pexels-1323550-ridgelines.jpg";
/** 2400 × 1543 px (checked against the committed file). */
const IMG_W = 2400;
const IMG_H = 1543;

/** Exhibit frame: 190 × 150 pt — deliberately NOT the image's aspect,
 *  so contain shows bands and cover shows overhang. */
const FRAME_W = 190;
const FRAME_H = 150;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg = ctx.pageIds[0];
  const page = p(74);
  const elements: string[] = [];

  const head = await proseFrame(ctx, page, [60, 58, 492, 84], [
    { text: "The fitting model, and the lane that lasts", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, page, [60, 88, 492, 140], [
    {
      text:
        "The same mountain ridge four times, in frames cut against its " +
        "aspect on purpose. Each label names the properties that produced " +
        "the geometry — the enum records the intent, the crops and the " +
        "inner transform do the work.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  /** A placed exhibit: link + inline bytes + the given fitting decor. */
  const exhibit = async (
    box: [number, number, number, number],
    decor: Array<{ path: string; value: unknown }>,
    labelBox: [number, number, number, number],
    label: string,
  ): Promise<string> => {
    const frame = await doc.rectangle(pg, box);
    await assignLayer(ctx, "rectangle", frame, LAYER.content);
    await doc.mutate("placeImage", {
      elementId: frame,
      uri: RIDGE_URI,
      fit: null,
    });
    await replaceBytesFromFile(ctx, frame, RIDGELINES);
    for (const d of decor) {
      await doc.setProperty("rectangle", frame, d.path, d.value);
    }
    const caption = await proseFrame(ctx, page, labelBox, [
      { text: label, style: STYLE.specValue },
    ]);
    elements.push(frame, caption.frameId);
    return frame;
  };

  const aspect = IMG_W / IMG_H;
  // Contain: the drawn rect keeps the image's aspect INSIDE the frame;
  // the slack becomes positive top/bottom crops (bands of paper).
  const containH = FRAME_W / aspect;
  const containBand = (FRAME_H - containH) / 2;
  // Cover: the drawn rect keeps the aspect OVER the frame; IDML spells
  // the overhang as NEGATIVE left/right crops.
  const coverW = FRAME_H * aspect;
  const coverOverhang = (coverW - FRAME_W) / 2;

  // (a) cover, left — its spill into the margin is shown, not hidden.
  await exhibit(
    [60, 150, 60 + FRAME_W, 150 + FRAME_H],
    [
      { path: "frameFittingType", value: { type: "text", value: "FillProportionally" } },
      {
        path: "frameFittingCrops",
        value: { type: "bounds", value: [0, -coverOverhang, 0, -coverOverhang] },
      },
    ],
    [60, 304, 250, 352],
    `a · FillProportionally — cover. Crops 0 / ${-coverOverhang.toFixed(1)} / 0 / ${-coverOverhang.toFixed(1)}: the overhang is negative crop, drawn unclipped — the spill is the demonstration.`,
  );

  // (b) contain, right.
  await exhibit(
    [292, 150, 292 + FRAME_W, 150 + FRAME_H],
    [
      { path: "frameFittingType", value: { type: "text", value: "Proportionally" } },
      {
        path: "frameFittingCrops",
        value: { type: "bounds", value: [containBand, 0, containBand, 0] },
      },
    ],
    [292, 304, 482, 352],
    `b · Proportionally — contain. Crops ${containBand.toFixed(1)} / 0 / ${containBand.toFixed(1)} / 0: the slack becomes bands of paper.`,
  );

  // (c) stretch, with reference point + auto-fit riding along.
  await exhibit(
    [60, 364, 60 + FRAME_W, 364 + FRAME_H],
    [
      { path: "frameFittingType", value: { type: "text", value: "FitContentToFrame" } },
      { path: "frameFittingReferencePoint", value: { type: "text", value: "BottomRightPoint" } },
      { path: "frameAutoFit", value: { type: "bool", value: true } },
    ],
    [60, 518, 250, 566],
    "c · FitContentToFrame — the stretch, distortion and all. frameFittingReferencePoint: BottomRightPoint; frameAutoFit: true — both persisted intent for future fits and resizes.",
  );

  // (d) pan/zoom through the inner image transform — the one fitting
  // that IS clipped to the frame. The transform is expressed in the
  // model's own coordinate space, read back from frameBounds rather
  // than recomputed from layout arithmetic.
  const zoomFrame = await exhibit(
    [292, 364, 292 + FRAME_W, 364 + FRAME_H],
    [],
    [292, 518, 482, 566],
    "d · imageContentTransform — a 2× cover, panned to the ridge. The inner transform maps image pixels into the frame; the frame's path clips the excess.",
  );
  const [top, left] = await frameBoundsOf(ctx, zoomFrame);
  const s = ((FRAME_H * aspect) / IMG_W) * 2; // 2× the cover scale.
  const drawnW = IMG_W * s;
  const drawnH = IMG_H * s;
  await doc.setProperty("rectangle", zoomFrame, "imageContentTransform", {
    type: "transform",
    value: [
      s,
      0,
      0,
      s,
      left - (drawnW - FRAME_W) / 2,
      top - (drawnH - FRAME_H) / 2,
    ],
  });

  // ── the bottom band: the placeholder, and the lane that lasts ────
  // (e) the missing-image placeholder, authored live: the frame is an
  // image element (bytes made it one), its bytes were then CLEARED,
  // and its link resolves to nothing — the engine answers with the
  // grey diagonal-X placeholder rather than silence.
  const lost = await doc.rectangle(pg, [60, 578, 160, 638]);
  await assignLayer(ctx, "rectangle", lost, LAYER.content);
  await doc.mutate("placeImage", {
    elementId: lost,
    uri: "assets/photos/annual-lost-plate.tif",
    fit: null,
  });
  await replaceBytesFromFile(ctx, lost, derived("apples.webp"));
  await clearImageBytes(ctx, lost);
  elements.push(lost);

  // (f) the same unresolvable-link start, rescued by the inline lane.
  const inline = await doc.rectangle(pg, [190, 578, 290, 638]);
  await assignLayer(ctx, "rectangle", inline, LAYER.content);
  await doc.mutate("placeImage", {
    elementId: inline,
    uri: "assets/photos/derived/apples.webp",
    fit: null,
  });
  const beforeReplace = await doc.renderPage(page);
  const inlineBytes = await replaceBytesFromFile(ctx, inline, derived("apples.webp"));
  // Attribution: the pixels that arrive now are the REPLACE's.
  await doc.expectRenderChanged(page, beforeReplace);
  elements.push(inline);

  const bandCaption = await proseFrame(ctx, page, [302, 570, 492, 638], [
    {
      text:
        "Left: an image element whose link resolves to nothing — the " +
        "placeholder is the engine saying so. Right: the same start, then " +
        `${inlineBytes.toLocaleString("en-US")} bytes inline through ` +
        "replaceImageBytes. The inline lane needs no resolver and " +
        "survives the container round trip; every photograph in this " +
        "chapter rides it.",
      style: STYLE.specValue,
    },
  ]);
  elements.push(bandCaption.frameId);
  expect(inlineBytes).toBeGreaterThan(0);

  await marginNote(
    ctx,
    page,
    "Fitting enums, the reference point and auto-fit are persisted intent — the geometry above comes from the crops and the inner transform; the cover fit draws its overhang unclipped, shown rather than hidden. → Appendix A",
  );
  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 113",
      "frameFittingType ×3 · frameFittingCrops ×2",
      "frameFittingReferencePoint · frameAutoFit",
      "imageContentTransform",
      "replaceImageBytes (inline + clear) · the placeholder, live",
    ]),
  );

  return {
    title: "Fitting and the inline lane",
    covers: [
      "images-graphics.frame-fitting",
      "images-graphics.placed-images",
      "images-graphics.missing-image-placeholder",
    ],
    elements,
  };
}
