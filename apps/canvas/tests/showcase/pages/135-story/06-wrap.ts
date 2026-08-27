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

// The wrap catalog (p39): a two-column backdrop of prose about
// wrapping, a central irregular polygon — rebuilt via framePath into
// two subpaths so it carries a genuine hole — wrapping by CONTOUR,
// four satellite tints wrapping by the other modes, and an inverse
// exhibit whose text keeps to the INSIDE of the outline.
//
// Oracle: everything is authored first, a baseline render is taken,
// and then ONE batch applies every wrap property. The pixels that
// move are the text being pushed.

import { expect } from "@playwright/test";

import { assignLayer, marginNote, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { caption, pourOne, prose, readEntry } from "./00-support";

const WRAP_TEXT_A =
  "Text wrap is the page's negotiation between type and object: the " +
  "object declares an exclusion, and every line that would have crossed " +
  "it is measured again against what remains. The mode is the shape of " +
  "the declaration. A bounding-box wrap excludes the object's rectangle " +
  "and nothing more; a contour wrap traces the outline itself, so the " +
  "text follows every bay and headland of the island sitting in the " +
  "middle of this measure — and because its inside edges are open, a " +
  "hole through the island is open water too.";
const WRAP_TEXT_C =
  "Every wrap on this page is symmetrical about one fact: the pushed " +
  "text and the pushing object know nothing of each other's content. " +
  "The columns re-measure; the island keeps its outline; delete the " +
  "island and the measure closes over the water without a seam. The " +
  "inverse case at the foot of the page proves the rule by turning it " +
  "around — there the outline is not an exclusion but the only " +
  "territory the text is allowed to hold, and everything outside it is " +
  "given up instead. Between those two poles sit the four tiles above: " +
  "each one a small weather system in the flow, each declared by a " +
  "single property on a single object, each undone by clearing it.";

const WRAP_TEXT_B =
  "A jump-object wrap concedes the whole band: no line shares a " +
  "baseline with the object, however narrow it is. A next-column wrap " +
  "concedes the rest of the column, sending the interrupted line to the " +
  "top of the following one. And a wrap of none concedes nothing — the " +
  "text runs beneath the tint as if it were not there, which is why the " +
  "fourth tile reads through its own veil. Each declaration here was " +
  "applied as a property, in one batch, after this prose was already " +
  "set: the reflow you are reading is the batch landing.";

// Central island: an irregular octagon, page-local corner anchors.
const OUTER: Array<[number, number]> = [
  [334, 322],
  [316, 280],
  [268, 264],
  [224, 284],
  [200, 324],
  [222, 366],
  [266, 382],
  [318, 362],
];
// The hole, wound the OPPOSITE way (NonZero leaves it open).
const INNER: Array<[number, number]> = [
  [286, 322],
  [276, 340],
  [256, 340],
  [246, 322],
  [256, 306],
  [276, 306],
];

const corner = (pt: [number, number]) => ({
  anchor: [pt[0], pt[1]] as [number, number],
  left: [pt[0], pt[1]] as [number, number],
  right: [pt[0], pt[1]] as [number, number],
});

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const page = p(39);
  const elements: string[] = [];

  const head = await prose(ctx, page, [48, 104, 480, 130], [
    { text: "The wrap catalog", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // ── the backdrop: two columns of prose that everything pushes ─────
  const backdrop = await prose(ctx, page, [48, 150, 480, 470], [
    { text: WRAP_TEXT_A, style: STYLE.bodySmall },
    { text: WRAP_TEXT_B, style: STYLE.bodySmall },
    { text: WRAP_TEXT_C, style: STYLE.bodySmall },
  ]);
  elements.push(backdrop.frameId);
  await doc.batch([
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "textFrame", id: backdrop.frameId },
        path: "textFrameColumnCount",
        value: { type: "length", value: 2 },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "textFrame", id: backdrop.frameId },
        path: "textFrameColumnGutter",
        value: { type: "length", value: 12 },
      },
    },
  ]);

  // ── the island: insertPath, then framePath to give it a hole ──────
  // insertPath takes page-local [x, y] anchors but cannot express
  // subpaths; the framePath property replaces the anchor list
  // wholesale in the item's STORED coordinate space, so the offset
  // between the two spaces is read off the polygon's own frameBounds
  // rather than assumed.
  const island = await doc.mutateId("insertPath", {
    pageId,
    anchors: OUTER.map(corner),
    open: false,
  });
  elements.push(island);
  await assignLayer(ctx, "polygon", island, LAYER.content);
  const stored = await readEntry(
    ctx.page,
    { kind: "polygon", id: island },
    "frameBounds",
  );
  if (!stored || stored.type !== "bounds") {
    throw new Error("the island polygon reports no frameBounds to anchor the hole");
  }
  const [sTop, sLeft] = stored.value as [number, number, number, number];
  const minX = Math.min(...OUTER.map((pt) => pt[0]));
  const minY = Math.min(...OUTER.map((pt) => pt[1]));
  const ox = sLeft - minX;
  const oy = sTop - minY;
  const shift = (pt: [number, number]): [number, number] => [pt[0] + ox, pt[1] + oy];
  await doc.setProperty("polygon", island, "framePath", {
    type: "framePath",
    value: {
      anchors: [...OUTER, ...INNER].map((pt) => corner(shift(pt))),
      subpathStarts: [0, OUTER.length],
    },
  });
  await doc.setProperty("polygon", island, "frameFillColor", {
    type: "colorRef",
    value: await doc.swatch(SWATCH.labMarigold),
  });

  // ── the satellites: one tint per remaining mode ───────────────────
  const tint = await doc.swatch(SWATCH.vermilionTint);
  const mkTint = async (box: [number, number, number, number]) => {
    const id = await doc.rectangle(pageId, box);
    await doc.setProperty("rectangle", id, "frameFillColor", {
      type: "colorRef",
      value: tint,
    });
    await assignLayer(ctx, "rectangle", id, LAYER.content);
    return id;
  };
  const boundingBox = await mkTint([92, 176, 156, 216]);
  const jumpObject = await mkTint([312, 176, 376, 216]);
  const nextColumn = await mkTint([92, 408, 156, 448]);
  const noneTile = await mkTint([312, 408, 376, 448]);
  elements.push(boundingBox, jumpObject, nextColumn, noneTile);

  // ── the inverse exhibit: its own prose, confined INSIDE a frame ───
  const inverse = await pourOne(
    ctx,
    page,
    [156, 536, 410, 610],
    "The inverse wrap turns the exclusion inside out: instead of keeping " +
      "text away from the outline, it keeps text within it, so this " +
      "paragraph paints only where it crosses the tinted plate it " +
      "overlaps — everything outside the outline is given up.",
    STYLE.bodySmall,
  );
  const inverseTile = await mkTint([170, 540, 330, 606]);
  elements.push(inverse.frameId, inverseTile);

  // ── ONE batch: every wrap declaration at once ─────────────────────
  const wrapSet = (
    kind: string,
    id: string,
    path: string,
    value: unknown,
  ) => ({
    op: "setElementProperty",
    args: { elementId: { kind, id }, path, value },
  });
  const before = await doc.renderPage(page);
  await doc.batch([
    wrapSet("polygon", island, "frameTextWrapMode", {
      type: "text",
      value: "ContourTextWrap",
    }),
    wrapSet("polygon", island, "frameTextWrapContourType", {
      type: "text",
      value: "SameAsClipping",
    }),
    wrapSet("polygon", island, "frameTextWrapOffsets", {
      type: "bounds",
      value: [8, 8, 8, 8],
    }),
    wrapSet("polygon", island, "frameTextWrapContourIncludeInside", {
      type: "bool",
      value: true,
    }),
    wrapSet("rectangle", boundingBox, "frameTextWrapMode", {
      type: "text",
      value: "BoundingBoxTextWrap",
    }),
    wrapSet("rectangle", boundingBox, "frameTextWrapOffsets", {
      type: "bounds",
      value: [4, 4, 4, 4],
    }),
    wrapSet("rectangle", jumpObject, "frameTextWrapMode", {
      type: "text",
      value: "JumpObjectTextWrap",
    }),
    wrapSet("rectangle", nextColumn, "frameTextWrapMode", {
      type: "text",
      value: "NextColumnTextWrap",
    }),
    wrapSet("rectangle", noneTile, "frameTextWrapMode", {
      type: "text",
      value: "None",
    }),
    wrapSet("rectangle", inverseTile, "frameTextWrapMode", {
      type: "text",
      value: "BoundingBoxTextWrap",
    }),
    wrapSet("rectangle", inverseTile, "textWrapInvert", {
      type: "bool",
      value: true,
    }),
  ]);
  await doc.expectRenderChanged(page, before);
  // The mode landed on the model too, not only on the render. (Read
  // back off a rectangle: the polygon's read surface does not carry
  // the wrap entries, the rectangle's does.)
  const mode = await readEntry(
    ctx.page,
    { kind: "rectangle", id: boundingBox },
    "frameTextWrapMode",
  );
  expect(mode?.value).toBe("BoundingBoxTextWrap");

  // ── the legend ────────────────────────────────────────────────────
  const legend = await caption(
    ctx,
    page,
    [156, 474, 480, 530],
    "Clockwise from top left: BoundingBox pushes the measure off the " +
      "tint's rectangle; JumpObject clears the full band; the marigold " +
      "island wraps to its own contour, hole open; None lets the text run " +
      "beneath the veil; NextColumn sends the interrupted line onward. " +
      "Below: the inverse wrap, text held inside the outline.",
  );
  elements.push(legend);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 56",
      "frameTextWrapMode ×6",
      "ContourType: SameAsClipping",
      "textWrapInvert · includeInside",
      "framePath: 2 subpaths (hole)",
    ]),
  );

  elements.push(
    await marginNote(
      ctx,
      ctx.pageIndexes[0],
      "A wrap contour excludes EVERY intersecting text frame — there is " +
        "no per-frame ignore-text-wrap door — so the classic pull quote " +
        "seated in its own wrap boundary is inexpressible; wrapped objects " +
        "here are shapes and panels. → Appendix A",
    ),
  );

  return {
    title: "The wrap catalog",
    covers: ["stories-text.text-wrap", "frames-paths.path.insert"],
    elements,
  };
}
