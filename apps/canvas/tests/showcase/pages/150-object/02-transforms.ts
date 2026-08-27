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

// Transforms and corners — the p48/p49 spread.
//
// VERSO (p48): a 3x3 matrix of identical pennant-shaped paths, each
// carrying exactly one single-knob transform write — rotation 15/45/90
// (frameRotationAngle), scale (frameScaleX / frameScaleY), and the two
// flips (frameFlipH / frameFlipV) — plus an untouched control and the
// frameTransform replace-pair. The pennant is asymmetric on both axes
// on purpose: a flipped rectangle looks like a rectangle, and a page
// that cannot show its own op has not demonstrated it.
//
// The pivot, measured rather than assumed: the engine's single-knob
// writes decompose/recompose the ItemTransform with the TRANSLATION
// preserved and the linear part applied about the item-space ORIGIN —
// so a bare rotation write swings a spread-coordinate shape around a
// point far off the page. Each tile therefore pre-seeds a translation
// t = c - M*c (c = the tile's stored centre, read back through
// requestElementGeometry, never computed from page arithmetic) so the
// knob's own recompose lands the shape rotated/scaled/flipped ABOUT
// ITS CENTRE. That is exactly the arithmetic a "rotate about centre"
// UI affordance performs; the margin note records it.
//
// RECTO (p49): the per-corner sampler — one rect per corner-option
// kind (Rounded / Inverse / Bevel / Inset / Fancy, IDML spellings),
// each written through ALL EIGHT corner paths (four options + four
// radii); a mixed rect carrying four DIFFERENT kinds on one outline;
// and the polygon attempt, where only the TopLeft slot steers geometry
// (uniformly, all corners) — the recorded B-23 residual.

import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { corner, elementCenter, elementGeometry, type WireId } from "./wire";

/** The pennant: asymmetric on both axes, 96 x 56, at page (x, y). */
const PENNANT = (
  x: number,
  y: number,
): Array<{ anchor: [number, number]; left: [number, number]; right: [number, number] }> => [
  corner(x, y),
  corner(x + 96, y + 8),
  corner(x + 68, y + 26),
  corner(x + 96, y + 40),
  corner(x, y + 56),
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const verso = p(48);
  const recto = p(49);
  const [vLeft, , vRight] = contentBox(verso);
  const [rLeft, , rRight] = contentBox(recto);
  const versoId = ctx.pageIds[0];
  const rectoId = ctx.pageIds[1];

  const vermilion = await doc.swatch(SWATCH.vermilion);
  const vermilionTint = await doc.swatch(SWATCH.vermilionTint);
  const slate = await doc.swatch(SWATCH.slate);
  const marigold = await doc.swatch(SWATCH.labMarigold);
  const ink = await doc.swatch(SWATCH.ink);

  // ── verso: head + intro ──────────────────────────────────────────
  const head = await proseFrame(ctx, verso, [vLeft, 54, vRight, 86], [
    { text: "Nine frames, one knob each", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);
  const intro = await proseFrame(ctx, verso, [vLeft, 92, vRight, 144], [
    {
      text:
        "The same pennant nine times. One cell is untouched; seven carry " +
        "a single transform property write apiece; the last carries the " +
        "replace-pair - two frames, two different frameTransform " +
        "histories, one silhouette.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(intro.frameId);

  // ── the pennant factory ──────────────────────────────────────────
  const pennant = async (
    x: number,
    y: number,
    fill: string,
  ): Promise<string> => {
    const id = await doc.mutateId("insertPath", {
      pageId: versoId,
      anchors: PENNANT(x, y),
      open: false,
    });
    await doc.setProperty("polygon", id, "frameFillColor", {
      type: "colorRef",
      value: fill,
    });
    await assignLayer(ctx, "polygon", id, LAYER.content);
    elements.push(id);
    return id;
  };

  /**
   * Pre-seed the compensating translation, then write the single knob.
   * `m` is the linear part the knob's recompose will produce
   * ([a, b, c, d] with x' = a x + c y, y' = b x + d y); the pre-seeded
   * frameTransform is a pure translation t = c - M*c, which recompose
   * PRESERVES, so the final map fixes the tile's centre.
   */
  const knob = async (
    id: string,
    m: [number, number, number, number],
    path: string,
    value: unknown,
  ): Promise<void> => {
    const [cx, cy] = await elementCenter(ctx, { kind: "polygon", id });
    const tx = cx - (m[0] * cx + m[2] * cy);
    const ty = cy - (m[1] * cx + m[3] * cy);
    await doc.setProperty("polygon", id, "frameTransform", {
      type: "transform",
      value: [1, 0, 0, 1, tx, ty],
    });
    await doc.setProperty("polygon", id, path, value);
  };

  const rot = (deg: number): [number, number, number, number] => {
    const r = (deg * Math.PI) / 180;
    return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r)];
  };

  // ── the 3x3 matrix ───────────────────────────────────────────────
  // Row pitch 128: the 90-degree tile swings 48 pt above/below its
  // centre and the 140% Y-scale grows 11 pt each way — the pitch is
  // sized so neither reaches the neighbouring row's label band.
  const cellX = (col: number): number => vLeft + col * 148;
  const cellY = (row: number): number => 152 + row * 128;
  const label = async (
    row: number,
    col: number,
    text: string,
  ): Promise<void> => {
    const x = cellX(col);
    const y = cellY(row);
    const cap = await proseFrame(ctx, verso, [x, y + 80, x + 136, y + 108], [
      { text, style: STYLE.caption },
    ]);
    elements.push(cap.frameId);
  };
  const tileAt = (row: number, col: number): [number, number] => [
    cellX(col) + 20,
    cellY(row),
  ];

  // (0,0) the control — untouched.
  {
    const [x, y] = tileAt(0, 0);
    await pennant(x, y, vermilionTint);
    await label(0, 0, "control - no transform");
  }
  // Rotations.
  for (const [i, deg] of [15, 45, 90].entries()) {
    const row = i < 2 ? 0 : 1;
    const col = i < 2 ? i + 1 : 0;
    const [x, y] = tileAt(row, col);
    const id = await pennant(x, y, vermilionTint);
    await knob(id, rot(deg), "frameRotationAngle", {
      type: "length",
      value: deg,
    });
    await label(row, col, `frameRotationAngle ${deg}`);
  }
  // Scales (1.4 keeps the scaled pennant inside its cell).
  {
    const [x, y] = tileAt(1, 1);
    const id = await pennant(x, y, vermilionTint);
    await knob(id, [1.4, 0, 0, 1], "frameScaleX", { type: "length", value: 1.4 });
    await label(1, 1, "frameScaleX 140%");
  }
  {
    const [x, y] = tileAt(1, 2);
    const id = await pennant(x, y, vermilionTint);
    await knob(id, [1, 0, 0, 1.4], "frameScaleY", { type: "length", value: 1.4 });
    await label(1, 2, "frameScaleY 140%");
  }
  // Flips — this is why the pennant is asymmetric.
  {
    const [x, y] = tileAt(2, 0);
    const id = await pennant(x, y, marigold);
    await knob(id, [-1, 0, 0, 1], "frameFlipH", { type: "bool", value: true });
    await label(2, 0, "frameFlipH - notch swaps sides");
  }
  {
    const [x, y] = tileAt(2, 1);
    const id = await pennant(x, y, marigold);
    await knob(id, [1, 0, 0, -1], "frameFlipV", { type: "bool", value: true });
    await label(2, 1, "frameFlipV - slopes trade places");
  }
  // (2,2) the replace-pair: P is written TWICE, Q once; they coincide.
  {
    const [x, y] = tileAt(2, 2);
    const pId = await pennant(x, y, vermilion);
    const qId = await pennant(x, y, slate);
    const w1: [number, number, number, number, number, number] = [
      1, 0, 0, 1, 0, -26,
    ];
    const w2: [number, number, number, number, number, number] = [
      1, 0, 0, 1, 12, 6,
    ];
    await doc.setProperty("polygon", pId, "frameTransform", {
      type: "transform",
      value: w1,
    });
    await doc.setProperty("polygon", pId, "frameTransform", {
      type: "transform",
      value: w2,
    });
    await doc.setProperty("polygon", qId, "frameTransform", {
      type: "transform",
      value: w2,
    });
    // Read P back: if frameTransform composed, P would carry w1*w2 and
    // sit 26 pt higher. It must carry w2 exactly.
    const g = await elementGeometry(ctx, { kind: "polygon", id: pId });
    const got = g.itemTransform ?? [1, 0, 0, 1, 0, 0];
    for (const [i, want] of w2.entries()) {
      if (Math.abs(got[i] - want) > 1e-4) {
        throw new Error(
          `frameTransform composed instead of replacing: P carries ` +
            `[${got.join(", ")}], expected [${w2.join(", ")}]`,
        );
      }
    }
    await label(2, 2, "frameTransform x2 vs x1 - one silhouette");
  }

  const versoProse = await proseFrame(ctx, verso, [vLeft, 524, vRight, 632], [
    {
      text:
        "The last cell holds two pennants. The vermilion one was moved " +
        "up 26 points and then given a second frameTransform; the slate " +
        "one was given only the second. They landed on the same spot - " +
        "read back, the vermilion frame carries exactly the second " +
        "matrix and no memory of the first. frameTransform replaces; it " +
        "never composes.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        "Every rotated, scaled and flipped tile above pre-seeds a " +
        "translation before its one knob write, because the knob pivots " +
        "about the item-space origin. The seed is read from the " +
        "element's own stored geometry, and it is the same arithmetic a " +
        "rotate-about-centre control performs.",
      style: STYLE.body,
    },
  ]);
  elements.push(versoProse.frameId);

  elements.push(
    await marginNote(
      ctx,
      verso,
      "frameTransform REPLACES the item transform (proved by the pair " +
        "above); the single-knob writes pivot about the item-space " +
        "origin with translation preserved, so each tile pre-seeds " +
        "t = c - Mc to hold its centre → Appendix A.",
    ),
  );
  elements.push(
    await specLabel(ctx, verso, [
      "Specimen No. 66",
      "frameRotationAngle 15/45/90",
      "frameScaleX/Y · frameFlipH/V",
      "frameTransform (replace, proved)",
    ]),
  );

  // ════ recto: the corner sampler ════════════════════════════════════
  const rHead = await proseFrame(ctx, recto, [rLeft, 54, rRight, 86], [
    { text: "The corner sampler", style: STYLE.head1 },
  ]);
  elements.push(rHead.frameId);
  const rIntro = await proseFrame(ctx, recto, [rLeft, 92, rRight, 132], [
    {
      text:
        "A frame's four corners are addressed by name - option and " +
        "radius each, eight property paths. Five kinds, one mixed " +
        "outline, and one polygon that shows where the addressing ends.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(rIntro.frameId);

  const CORNERS = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"] as const;
  const setCorners = async (
    kind: string,
    id: string,
    per: Array<{ option: string; radius: number }>,
  ): Promise<void> => {
    for (const [i, name] of CORNERS.entries()) {
      await doc.setProperty(kind, id, `frameCornerOption${name}`, {
        type: "text",
        value: per[i].option,
      });
      await doc.setProperty(kind, id, `frameCornerRadius${name}`, {
        type: "length",
        value: per[i].radius,
      });
    }
  };

  const dressed = async (
    box: [number, number, number, number],
    fill: string,
  ): Promise<string> => {
    const id = await doc.rectangle(rectoId, box);
    await doc.setProperty("rectangle", id, "frameFillColor", {
      type: "colorRef",
      value: fill,
    });
    await doc.setProperty("rectangle", id, "frameStrokeColor", {
      type: "colorRef",
      value: ink,
    });
    await doc.setProperty("rectangle", id, "frameStrokeWeight", {
      type: "length",
      value: 1,
    });
    await assignLayer(ctx, "rectangle", id, LAYER.content);
    elements.push(id);
    return id;
  };

  // One rect per kind, all four corners the same, radius 16.
  const KINDS: Array<[string, string]> = [
    ["RoundedCorner", "Rounded"],
    ["InverseRoundedCorner", "Inverse"],
    ["BevelCorner", "Bevel"],
    ["InsetCorner", "Inset"],
    ["FancyCorner", "Fancy"],
  ];
  for (const [i, [token, name]] of KINDS.entries()) {
    const x = rLeft + i * 89;
    const id = await dressed([x, 140, x + 76, 216], vermilionTint);
    await setCorners(
      "rectangle",
      id,
      CORNERS.map(() => ({ option: token, radius: 16 })),
    );
    const cap = await proseFrame(ctx, recto, [x, 222, x + 80, 246], [
      { text: name, style: STYLE.caption },
    ]);
    elements.push(cap.frameId);
  }

  // The mixed rect: four different kinds on ONE outline.
  const mixedId = await dressed([rLeft, 260, rLeft + 156, 376], vermilionTint);
  await setCorners("rectangle", mixedId, [
    { option: "RoundedCorner", radius: 28 },
    { option: "BevelCorner", radius: 28 },
    { option: "InsetCorner", radius: 18 },
    { option: "InverseRoundedCorner", radius: 18 },
  ]);
  const mixedCap = await proseFrame(ctx, recto, [216, 260, rRight, 376], [
    {
      text:
        "One rectangle, four kinds: rounded top-left at 28, bevel " +
        "top-right at 28, inset bottom-left at 18, inverse bottom-right " +
        "at 18. Per-corner addressing means the outline can disagree " +
        "with itself, on purpose.",
      style: STYLE.caption,
    },
  ]);
  elements.push(mixedCap.frameId);

  // The polygon attempt.
  const polyId = await doc.mutateId("insertPath", {
    pageId: rectoId,
    anchors: [
      corner(rLeft, 396),
      corner(rLeft + 156, 404),
      corner(rLeft + 132, 500),
      corner(rLeft + 18, 488),
    ],
    open: false,
  });
  await doc.setProperty("polygon", polyId, "frameFillColor", {
    type: "colorRef",
    value: marigold,
  });
  await doc.setProperty("polygon", polyId, "frameStrokeColor", {
    type: "colorRef",
    value: ink,
  });
  await doc.setProperty("polygon", polyId, "frameStrokeWeight", {
    type: "length",
    value: 1,
  });
  await assignLayer(ctx, "polygon", polyId, LAYER.content);
  elements.push(polyId);
  // TopLeft drives the polygon's (uniform) corner geometry; TopRight is
  // written too and stores without steering anything — the honest half
  // of the demonstration.
  await doc.setProperty("polygon", polyId, "frameCornerOptionTopLeft", {
    type: "text",
    value: "RoundedCorner",
  });
  await doc.setProperty("polygon", polyId, "frameCornerRadiusTopLeft", {
    type: "length",
    value: 18,
  });
  await doc.setProperty("polygon", polyId, "frameCornerOptionTopRight", {
    type: "text",
    value: "BevelCorner",
  });
  await doc.setProperty("polygon", polyId, "frameCornerRadiusTopRight", {
    type: "length",
    value: 18,
  });
  const polyCap = await proseFrame(ctx, recto, [216, 396, rRight, 500], [
    {
      text:
        "The same vocabulary on a polygon: the TopLeft slot rounds every " +
        "corner uniformly - the four names are rectangle-shaped " +
        "addressing, and IDML has no per-name mapping for a shape whose " +
        "corners are not four. The BevelCorner written to TopRight is " +
        "stored and round-trips; it steers nothing.",
      style: STYLE.caption,
    },
  ]);
  elements.push(polyCap.frameId);

  elements.push(
    await marginNote(
      ctx,
      recto,
      "Polygon corners: only the TopLeft slot (or the global pair) " +
        "drives geometry, uniformly across all corners; the other three " +
        "names store and round-trip without rendering - B-23's recorded " +
        "residual → Appendix A.",
    ),
  );
  elements.push(
    await specLabel(ctx, recto, [
      "Specimen No. 67",
      "frameCornerOption x4 / frameCornerRadius x4",
      "5 kinds + mixed rect + polygon",
    ]),
  );

  notes.push(
    "transform pivot: single-knob writes pivot about the item-space " +
      "origin (translation preserved) — every tile pre-seeds t = c - Mc; " +
      "frameTransform replace semantics proved by readback",
  );

  return {
    title: "Transforms and corners",
    covers: [
      "geometry-coordinates.item-transform",
      "frames-paths.corner-options",
      "frames-paths.corner-options-polygon",
    ],
    elements,
    notes,
  };
}
