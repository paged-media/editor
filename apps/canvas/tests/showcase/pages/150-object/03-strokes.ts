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

// Stroke anatomy — p50, B-Body verso. Seven bands, each one axis of a
// stroke: weight, type (built-in names + the absolute-pt per-frame dash
// override), end caps, joins with the miter limit doing visible work,
// alignment, gap colour/tint, and arrowheads. Every band carries a
// full-width caption line — narrow legend columns were the first
// draft, and live-inserted frames under ~140 pt compose at a fraction
// of their width (the chapter notes carry the finding), so every text
// frame on this page is wide.
//
// The wire's kind boundaries, read from the apply layer and shown
// rather than smoothed over: `frameStrokeEndCap` and
// `frameStrokeAlignment` are RECTANGLE-addressed; caps are therefore
// demonstrated on dashed rectangle strokes (every dash segment wears
// the cap - the only place a closed outline can show one);
// `frameStrokeStartArrowhead`/`EndArrowhead` are GRAPHIC-LINE-only and
// take the IDML ArrowHead enumeration spellings. The margin note
// prints all three boundaries.
//
// The miter-limit band is built to make the limit BITE: a 24-degree
// spike has a miter ratio near 4.9, so limit 12 keeps the point and
// limit 1.5 shears it to a bevel - same geometry, one property apart.

import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { corner } from "./wire";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(50);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];
  const SPEC_X = left + 8; // specimens indent a hair from the margin

  const ink = await doc.swatch(SWATCH.ink);
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const marigold = await doc.swatch(SWATCH.labMarigold);
  const paperWarm = await doc.swatch(SWATCH.paperWarm);

  const head = await proseFrame(ctx, page, [left, 54, right, 82], [
    { text: "Stroke anatomy", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const bandCaption = async (
    y: number,
    text: string,
    tall = false,
  ): Promise<void> => {
    const cap = await proseFrame(ctx, page, [left, y, right, y + (tall ? 28 : 15)], [
      { text, style: STYLE.caption },
    ]);
    elements.push(cap.frameId);
  };

  const line = async (
    x0: number,
    y: number,
    x1: number,
    weight: number,
  ): Promise<string> => {
    const id = await doc.mutateId("insertLine", {
      pageId,
      start: [x0, y],
      end: [x1, y],
    });
    await doc.setProperty("graphicLine", id, "frameStrokeColor", {
      type: "colorRef",
      value: ink,
    });
    await doc.setProperty("graphicLine", id, "frameStrokeWeight", {
      type: "length",
      value: weight,
    });
    await assignLayer(ctx, "graphicLine", id, LAYER.content);
    elements.push(id);
    return id;
  };

  // ── band 1: the weight ramp ──────────────────────────────────────
  for (const [i, w] of [0.25, 0.5, 1, 2, 4, 8].entries()) {
    await line(SPEC_X, 92 + i * 9, right - 8, w);
  }
  await bandCaption(
    143,
    "frameStrokeWeight, a ramp: 0.25 / 0.5 / 1 / 2 / 4 / 8 pt.",
  );

  // ── band 2: stroke types + the per-frame dash override ───────────
  const TYPES = ["Solid", "Dashed", "Dotted", "Dashed4-4"];
  for (const [i, t] of TYPES.entries()) {
    const id = await line(SPEC_X, 168 + i * 14, right - 8, 2);
    await doc.setProperty("graphicLine", id, "frameStrokeType", {
      type: "text",
      value: `StrokeStyle/$ID/${t}`,
    });
  }
  // The override: absolute points, wins over any named style.
  const overrideId = await line(SPEC_X, 168 + 4 * 14, right - 8, 2);
  await doc.setProperty("graphicLine", overrideId, "frameStrokeDashArray", {
    type: "lengths",
    value: [6, 3],
  });
  await bandCaption(
    234,
    "frameStrokeType: Solid, Dashed, Dotted, Dashed4-4 - then " +
      "frameStrokeDashArray, a per-frame 6/3 pt override in absolute " +
      "points.",
  );

  // ── band 3: end caps, on dashed rectangle strokes ────────────────
  const CAPS = ["ButtEndCap", "RoundEndCap", "ProjectingEndCap"];
  for (const [i, cap] of CAPS.entries()) {
    const x = SPEC_X + i * 148;
    const id = await doc.rectangle(pageId, [x, 260, x + 116, 306]);
    await doc.setProperty("rectangle", id, "frameStrokeColor", {
      type: "colorRef",
      value: ink,
    });
    await doc.setProperty("rectangle", id, "frameStrokeWeight", {
      type: "length",
      value: 5,
    });
    await doc.setProperty("rectangle", id, "frameStrokeType", {
      type: "text",
      value: "StrokeStyle/$ID/Dashed",
    });
    await doc.setProperty("rectangle", id, "frameStrokeEndCap", {
      type: "text",
      value: cap,
    });
    await assignLayer(ctx, "rectangle", id, LAYER.content);
    elements.push(id);
  }
  await bandCaption(
    312,
    "frameStrokeEndCap on dashed rectangle strokes, left to right: " +
      "ButtEndCap, RoundEndCap, ProjectingEndCap - each dash segment " +
      "wears the cap.",
  );

  // ── band 4: joins, and the miter limit biting ────────────────────
  const spike = async (
    x: number,
    apexHalf: number,
    join: string,
    miterLimit: number | null,
  ): Promise<string> => {
    const id = await doc.mutateId("insertPath", {
      pageId,
      anchors: [
        corner(x + 32 - apexHalf * 32, 388),
        corner(x + 32, 340),
        corner(x + 32 + apexHalf * 32, 388),
      ],
      open: false,
    });
    await doc.setProperty("polygon", id, "frameFillColor", {
      type: "colorRef",
      value: null,
    });
    await doc.setProperty("polygon", id, "frameStrokeColor", {
      type: "colorRef",
      value: ink,
    });
    await doc.setProperty("polygon", id, "frameStrokeWeight", {
      type: "length",
      value: 4,
    });
    await doc.setProperty("polygon", id, "frameStrokeJoin", {
      type: "text",
      value: join,
    });
    if (miterLimit !== null) {
      await doc.setProperty("polygon", id, "frameStrokeMiterLimit", {
        type: "length",
        value: miterLimit,
      });
    }
    await assignLayer(ctx, "polygon", id, LAYER.content);
    elements.push(id);
    return id;
  };
  const JOINS = ["MiterEndJoin", "RoundEndJoin", "BevelEndJoin"];
  for (const [i, token] of JOINS.entries()) {
    await spike(SPEC_X + i * 84, 1, token, null);
  }
  await spike(SPEC_X + 3 * 84, 0.31, "MiterEndJoin", 12);
  await spike(SPEC_X + 4 * 84, 0.31, "MiterEndJoin", 1.5);
  await bandCaption(
    394,
    "frameStrokeJoin on a 45-degree apex: miter, round, bevel. Then " +
      "frameStrokeMiterLimit at work on a 24-degree spike: limit 12 " +
      "keeps the point, limit 1.5 shears it to a bevel.",
    true,
  );

  // ── band 5: alignment (rectangle-addressed) ──────────────────────
  const ALIGN = ["InsideAlignment", "CenterAlignment", "OutsideAlignment"];
  for (const [i, al] of ALIGN.entries()) {
    const x = SPEC_X + i * 148;
    const id = await doc.rectangle(pageId, [x, 432, x + 116, 478]);
    await doc.setProperty("rectangle", id, "frameFillColor", {
      type: "colorRef",
      value: paperWarm,
    });
    await doc.setProperty("rectangle", id, "frameStrokeColor", {
      type: "colorRef",
      value: vermilion,
    });
    await doc.setProperty("rectangle", id, "frameStrokeWeight", {
      type: "length",
      value: 6,
    });
    await doc.setProperty("rectangle", id, "frameStrokeAlignment", {
      type: "text",
      value: al,
    });
    await assignLayer(ctx, "rectangle", id, LAYER.content);
    elements.push(id);
  }
  await bandCaption(
    484,
    "frameStrokeAlignment on identical bounds, left to right: inside, " +
      "centre, outside - the six-point vermilion stroke sits within, " +
      "astride, or around the same rectangle.",
  );

  // ── band 6: gap colour and tint ──────────────────────────────────
  for (const [i, tint] of [100, 35].entries()) {
    const x0 = SPEC_X + i * 218;
    const id = await line(x0, 516, x0 + 198, 6);
    await doc.setProperty("graphicLine", id, "frameStrokeType", {
      type: "text",
      value: "StrokeStyle/$ID/Dashed",
    });
    await doc.setProperty("graphicLine", id, "frameStrokeGapColor", {
      type: "colorRef",
      value: marigold,
    });
    await doc.setProperty("graphicLine", id, "frameStrokeGapTint", {
      type: "length",
      value: tint,
    });
  }
  await bandCaption(
    526,
    "frameStrokeGapColor + frameStrokeGapTint: the dash gaps filled " +
      "with Lab Marigold at tint 100 (left) and 35 (right).",
  );

  // ── band 7: arrowheads (graphic-line-only; IDML spellings) ───────
  const ARROWS: Array<[string, string]> = [
    ["SimpleArrowHead", "TriangleWideArrowHead"],
    ["BarbedArrowHead", "CircleSolidArrowHead"],
    ["SquareArrowHead", "CurvedArrowHead"],
    ["BarArrowHead", "SimpleWideArrowHead"],
  ];
  for (const [i, [start, end]] of ARROWS.entries()) {
    const id = await line(SPEC_X + 14, 556 + i * 13, right - 22, 1.5);
    await doc.setProperty("graphicLine", id, "frameStrokeStartArrowhead", {
      type: "text",
      value: start,
    });
    await doc.setProperty("graphicLine", id, "frameStrokeEndArrowhead", {
      type: "text",
      value: end,
    });
  }
  await bandCaption(
    610,
    "Arrowheads, start and end per line: Simple/TriangleWide, " +
      "Barbed/CircleSolid, Square/Curved, Bar/SimpleWide - eight of the " +
      "IDML ArrowHead kinds.",
    true,
  );

  elements.push(
    await marginNote(
      ctx,
      page,
      "Kind boundaries on the wire: frameStrokeEndCap and " +
        "frameStrokeAlignment are rectangle-addressed (caps shown on " +
        "dash segments - a closed outline has no open end), and " +
        "arrowheads are graphic-line-only → Appendix A.",
    ),
  );
  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 68",
      "frameStrokeWeight/Type/DashArray",
      "EndCap · Join · MiterLimit · Alignment",
      "GapColor/GapTint · Start/EndArrowhead",
    ]),
  );

  notes.push(
    "8 arrowhead kinds enumerated live; miter limit demonstrated " +
      "biting (12 keeps a 24-degree spike, 1.5 shears it); caps and " +
      "alignment are rectangle-addressed on the wire, arrowheads " +
      "graphic-line-only",
  );

  return {
    title: "Stroke anatomy",
    covers: [
      "frames-paths.stroke-weight-caps-joins",
      "frames-paths.stroke-dashed",
      "frames-paths.stroke-gap-color",
      "frames-paths.stroke-alignment",
      "frames-paths.arrowheads",
    ],
    elements,
    notes,
  };
}
