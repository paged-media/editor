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

// Page 1 — the cover.
//
// A cover is the smallest page that still has to do everything a DTP
// page does: paint to the trim edge, place type at display size, sit
// one element on top of another, and put a soft shadow between them.
// So this page is the showcase's first honest end-to-end check —
// insert, fill, transform, blend, style — on a surface where a reader
// would notice any of it going wrong.
//
// The five items, back to front:
//
//   bleed     a full-page rectangle in the accent ink — the page has no
//             white margin, which is exactly the case a renderer that
//             quietly clips to the live area gets wrong
//   panel     a tint plate, rotated a couple of degrees about its own
//             centre and dropped to 60% opacity, carrying the shadow
//   title     "paged", set in the fixture's Showcase Title style
//   rule      a 1.5pt bar — thin geometry is where rasterisation error
//             shows up first
//   subtitle  the line that says what the document is
//
// Everything is addressed BY NAME (`SWATCH.accent`, `STYLE.title`);
// a drifted base fixture fails here, on page one, rather than as a
// cover that renders in the wrong colour fifteen pages later.

import { PAGE, STYLE, SWATCH } from "../names";
import type { PageContext, PageReport } from "../types";

/** Where the title block sits, in page points. Shared by the title, the
 *  rule and the subtitle so the three stay optically aligned. */
const BLOCK = { left: 96, right: PAGE.widthPt - 96 } as const;

/**
 * The IDML `ItemTransform` for a rotation of `deg` about `(cx, cy)`.
 *
 * IDML packs the affine as `[a, b, c, d, tx, ty]` and maps a point as
 * `(a*x + c*y + tx, b*x + d*y + ty)`. A bare rotation matrix turns the
 * item about the SPREAD origin, which on a Letter page throws it off
 * the paper entirely; the translation terms below cancel that by
 * pinning `(cx, cy)` to itself. `cx`/`cy` are in the item's own bounds
 * space — the space `frameBounds` is expressed in — so this is
 * independent of where the page sits on its spread.
 */
function rotateAbout(deg: number, cx: number, cy: number): number[] {
  const t = (deg * Math.PI) / 180;
  const a = Math.cos(t);
  const b = Math.sin(t);
  const c = -Math.sin(t);
  const d = Math.cos(t);
  return [a, b, c, d, cx - (a * cx + c * cy), cy - (b * cx + d * cy)];
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];

  const accent = await doc.swatch(SWATCH.accent);
  const accentTint = await doc.swatch(SWATCH.accentTint);
  const ink = await doc.swatch(SWATCH.ink);

  // Back to front. Insert order IS paint order here (no explicit
  // arrange), and it also decides what a hit test at a point returns —
  // which matters because `storyOf` below resolves a story by hitting
  // the frame's centre, and only the topmost item at that point
  // answers. Each text frame is therefore interrogated immediately
  // after it is created, while nothing overlaps it yet.
  const bleed = await doc.rectangle(pageId, [
    0,
    0,
    PAGE.heightPt,
    PAGE.widthPt,
  ]);
  const panel = await doc.rectangle(pageId, [180, 72, 612, PAGE.widthPt - 72]);

  const titleBounds: [number, number, number, number] = [
    252,
    BLOCK.left,
    392,
    BLOCK.right,
  ];
  const title = await doc.textFrame(pageId, titleBounds);
  const titleStory = await doc.storyOf(pageId, titleBounds);

  const rule = await doc.rectangle(pageId, [
    404,
    BLOCK.left,
    405.5,
    BLOCK.right,
  ]);

  const subtitleBounds: [number, number, number, number] = [
    420,
    BLOCK.left,
    520,
    BLOCK.right,
  ];
  const subtitle = await doc.textFrame(pageId, subtitleBounds);
  const subtitleStory = await doc.storyOf(pageId, subtitleBounds);

  // The appearance, as ONE undo step. These are all property writes on
  // the frame lane, which is the only lane `Operation::Batch` carries —
  // text edits are a separate lane and would take the whole batch down
  // with them, so the two pours below stay outside it.
  const panelCentreX = (72 + (PAGE.widthPt - 72)) / 2;
  const panelCentreY = (180 + 612) / 2;
  await doc.batch([
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: bleed },
        path: "frameFillColor",
        value: { type: "colorRef", value: accent },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: panel },
        path: "frameFillColor",
        value: { type: "colorRef", value: accentTint },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: panel },
        path: "frameOpacity",
        value: { type: "length", value: 60 },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: panel },
        path: "frameTransform",
        value: {
          type: "transform",
          value: rotateAbout(-2.5, panelCentreX, panelCentreY),
        },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: rule },
        path: "frameFillColor",
        value: { type: "colorRef", value: ink },
      },
    },
  ]);

  // The shadow rides the tinted plate rather than the type: effects are
  // fill-based, so a shadow on an unfilled text frame has nothing to
  // cast. Two mutations (enable + size) — the Effects panel's own pair.
  await doc.designer.applyDropShadow("rectangle", panel, 18);

  // One insert per story, at offset 0 into an empty story. `insertText`
  // addresses the BYTE space; `applyStyle` addresses the contiguous
  // CHARACTER space. Single-paragraph pours at offset 0 make the two
  // coincide, which is why the cover can style by string length while
  // the editorial spread has to track the two separately.
  const titleText = "paged";
  await doc.insertText(titleStory, titleText);
  await doc.applyStyle(
    titleStory,
    0,
    [...titleText].length,
    await doc.paragraphStyle(STYLE.title),
    "paragraph",
  );

  const subtitleText =
    "A reference document for the paged engine — sixteen pages, set and " +
    "rendered by the software they describe.";
  await doc.insertText(subtitleStory, subtitleText);
  await doc.applyStyle(
    subtitleStory,
    0,
    [...subtitleText].length,
    await doc.paragraphStyle(STYLE.body),
    "paragraph",
  );

  if ((await doc.storyChars(titleStory)) !== [...titleText].length) {
    notes.push(
      "the title story's character count disagrees with the text poured " +
        "into it — the wordmark may be rendering short",
    );
  }

  return {
    title: "Cover",
    covers: [
      "frames-paths.frame.insert",
      "frames-paths.page-item-kinds",
      "color-swatches.fill-stroke-apply",
      "geometry-coordinates.item-transform",
      "effects-transparency.opacity",
      "effects-transparency.drop-shadow",
      "stories-text.text.insert",
      "stories-text.style-apply-range",
    ],
    elements: [bleed, panel, title, rule, subtitle],
    notes: notes.length > 0 ? notes : undefined,
  };
}
