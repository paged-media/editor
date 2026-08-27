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

// Path topology and the pathfinder — p51, B-Body recto. Two bands of
// small before/after tiles.
//
// Band A: the topology ops. Each tile holds the SAME base shape twice —
// left untouched, right mutated — so the op's effect is the difference
// you can see: pathPointInsert / Set / CurveType / Remove, pathOpenAt,
// closePath, joinPaths, simplifyPath, outlineStroke, offsetPath. Every
// edit POSITION is derived from requestPathAnchors on the shape being
// edited (the pathPoint ops address the element's own stored space —
// page arithmetic would be a guess about the spread origin).
//
// Band B: the planar ops. pathfinderBoolean in all four modes, then the
// six region verbs — Divide / Trim / Merge / Crop / Outline / MinusBack
// — each on a fresh overlapping pair (`elementIds` top-to-bottom, the
// wire's order), and pathfinderFaces keeping ONE engine-minted face:
// the face id comes from requestPlanarRegions, never guessed, because
// the ids are minted by the arrangement ("0-1#0" = the overlap of
// inputs 0 and 1).

import {
  assignLayer,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { corner, pathAnchors, planarFaces, type WireId } from "./wire";

const COL = (i: number): number => 48 + i * 108;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(51);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];

  const ink = await doc.swatch(SWATCH.ink);
  const vermilionTint = await doc.swatch(SWATCH.vermilionTint);
  const screenBlue = await doc.swatch(SWATCH.screenBlue);
  const marigold = await doc.swatch(SWATCH.labMarigold);

  const head = await proseFrame(ctx, page, [left, 54, right, 84], [
    { text: "Topology and the pathfinder", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);
  const intro = await proseFrame(ctx, page, [left, 90, right, 128], [
    {
      text:
        "Each tile in the upper band holds the same shape twice - " +
        "untouched at left, operated on at right. The lower band feeds " +
        "overlapping pairs to every planar verb the wire declares.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(intro.frameId);

  // ── shared machinery ─────────────────────────────────────────────
  const wid = (id: string): WireId => ({ kind: "polygon", id });

  const path = async (
    anchors: Array<{
      anchor: [number, number];
      left: [number, number];
      right: [number, number];
    }>,
    open: boolean,
    style: { fill?: string | null; stroke?: string; weight?: number },
  ): Promise<string> => {
    const id = await doc.mutateId("insertPath", { pageId, anchors, open });
    if (style.fill !== undefined) {
      await doc.setProperty("polygon", id, "frameFillColor", {
        type: "colorRef",
        value: style.fill,
      });
    }
    if (style.stroke) {
      await doc.setProperty("polygon", id, "frameStrokeColor", {
        type: "colorRef",
        value: style.stroke,
      });
      await doc.setProperty("polygon", id, "frameStrokeWeight", {
        type: "length",
        value: style.weight ?? 2,
      });
    }
    await assignLayer(ctx, "polygon", id, LAYER.content);
    elements.push(id);
    return id;
  };

  // Full-width row captions, never narrow per-tile labels: live
  // frames under ~140 pt compose at a fraction of their width (see
  // the chapter notes), so each row of tiles is captioned once,
  // left to right.
  const rowCaption = async (y: number, text: string): Promise<void> => {
    const cap = await proseFrame(ctx, page, [left, y, right, y + 16], [
      { text, style: STYLE.caption },
    ]);
    elements.push(cap.frameId);
  };

  // Base shapes, at page (x, y), each 42 x 44.
  const quad = (x: number, y: number) => [
    corner(x, y + 8),
    corner(x + 36, y),
    corner(x + 42, y + 40),
    corner(x + 4, y + 44),
  ];
  const penta = (x: number, y: number) => [
    corner(x, y + 16),
    corner(x + 21, y),
    corner(x + 42, y + 16),
    corner(x + 34, y + 44),
    corner(x + 8, y + 44),
  ];
  const zigzag = (x: number, y: number) => [
    corner(x, y + 40),
    corner(x + 14, y + 4),
    corner(x + 28, y + 36),
    corner(x + 42, y + 8),
  ];

  // ── band A row 1 (y 136) ─────────────────────────────────────────
  const A1 = 136;
  {
    // insertPath: a closed blob with REAL Bezier handles + an open
    // polyline beside it.
    const x = COL(0);
    await path(
      [
        { anchor: [x + 21, A1], left: [x + 8, A1], right: [x + 34, A1] },
        {
          anchor: [x + 42, A1 + 22],
          left: [x + 42, A1 + 9],
          right: [x + 42, A1 + 35],
        },
        {
          anchor: [x + 21, A1 + 44],
          left: [x + 34, A1 + 44],
          right: [x + 8, A1 + 44],
        },
        { anchor: [x, A1 + 22], left: [x, A1 + 35], right: [x, A1 + 9] },
      ],
      false,
      { fill: marigold },
    );
    await path(zigzag(x + 54, A1), true, { fill: null, stroke: ink });
  }
  {
    // pathPointInsert: a roof anchor appears between anchors 0 and 1.
    const x = COL(1);
    await path(quad(x, A1), false, { fill: vermilionTint });
    const after = await path(quad(x + 54, A1), false, { fill: vermilionTint });
    const read = await pathAnchors(ctx, wid(after));
    const a0 = read.anchors[0].anchor;
    const a1 = read.anchors[1].anchor;
    const apex: [number, number] = [
      (a0[0] + a1[0]) / 2,
      (a0[1] + a1[1]) / 2 - 18,
    ];
    await doc.mutate("pathPointInsert", {
      elementId: wid(after),
      index: 1,
      anchor: { anchor: apex, left: apex, right: apex },
    });
  }
  {
    // pathPointSet: anchor 2 pushed out.
    const x = COL(2);
    await path(quad(x, A1), false, { fill: vermilionTint });
    const after = await path(quad(x + 54, A1), false, { fill: vermilionTint });
    const read = await pathAnchors(ctx, wid(after));
    const a2 = read.anchors[2].anchor;
    await doc.mutate("pathPointSet", {
      elementId: wid(after),
      index: 2,
      role: "anchor",
      position: [a2[0] + 12, a2[1] + 8],
    });
  }
  {
    // pathPointCurveType: corner 1 goes smooth.
    const x = COL(3);
    await path(quad(x, A1), false, { fill: vermilionTint });
    const after = await path(quad(x + 54, A1), false, { fill: vermilionTint });
    await doc.mutate("pathPointCurveType", {
      elementId: wid(after),
      index: 1,
      smooth: true,
    });
  }
  await rowCaption(
    186,
    "insertPath (closed Bezier blob + open polyline) · pathPointInsert " +
      "· pathPointSet · pathPointCurveType",
  );

  // ── band A row 2 (y 214) ─────────────────────────────────────────
  const A2 = 214;
  {
    // pathPointRemove: pentagon loses its right shoulder.
    const x = COL(0);
    await path(penta(x, A2), false, { fill: vermilionTint });
    const after = await path(penta(x + 54, A2), false, { fill: vermilionTint });
    await doc.mutate("pathPointRemove", { elementId: wid(after), index: 2 });
  }
  {
    // pathOpenAt: the closed square's outline gains a gap.
    const x = COL(1);
    const square = (sx: number) => [
      corner(sx, A2 + 2),
      corner(sx + 40, A2 + 2),
      corner(sx + 40, A2 + 42),
      corner(sx, A2 + 42),
    ];
    await path(square(x), false, { fill: null, stroke: ink });
    const after = await path(square(x + 54), false, { fill: null, stroke: ink });
    await doc.mutate("pathOpenAt", { elementId: wid(after), index: 0 });
  }
  {
    // closePath: the open zigzag gains its closing chord.
    const x = COL(2);
    await path(zigzag(x, A2), true, { fill: null, stroke: ink });
    const after = await path(zigzag(x + 54, A2), true, {
      fill: null,
      stroke: ink,
    });
    await doc.mutate("closePath", { elementId: wid(after), subpath: null });
  }
  {
    // joinPaths: two open strokes weld into one path.
    const x = COL(3);
    const armA = (sx: number) => [
      corner(sx, A2 + 40),
      corner(sx + 12, A2 + 6),
      corner(sx + 20, A2 + 20),
    ];
    const armB = (sx: number) => [
      corner(sx + 26, A2 + 34),
      corner(sx + 34, A2 + 2),
      corner(sx + 42, A2 + 40),
    ];
    await path(armA(x), true, { fill: null, stroke: ink });
    await path(armB(x), true, { fill: null, stroke: ink });
    const keptId = await path(armA(x + 54), true, { fill: null, stroke: ink });
    const otherId = await path(armB(x + 54), true, { fill: null, stroke: ink });
    await doc.mutate("joinPaths", {
      elementId: wid(keptId),
      otherId: wid(otherId),
    });
  }
  await rowCaption(
    264,
    "pathPointRemove · pathOpenAt · closePath · joinPaths (two open " +
      "strokes welded into one)",
  );

  // ── band A row 3 (y 292) ─────────────────────────────────────────
  const A3 = 292;
  {
    // simplifyPath: the sawtooth settles.
    const x = COL(0);
    const saw = (sx: number) => {
      const pts = [] as Array<ReturnType<typeof corner>>;
      for (let i = 0; i <= 10; i += 1) {
        pts.push(corner(sx + i * 4.2, A3 + 22 + (i % 2 === 0 ? -5 : 5)));
      }
      return pts;
    };
    await path(saw(x), true, { fill: null, stroke: ink });
    const after = await path(saw(x + 54), true, { fill: null, stroke: ink });
    await doc.mutate("simplifyPath", { elementId: wid(after), tolerance: 6 });
  }
  {
    // outlineStroke: the stroked line becomes a filled outline shape.
    const x = COL(1);
    const sPath = (sx: number) => [
      corner(sx, A3 + 40),
      corner(sx + 16, A3 + 6),
      corner(sx + 28, A3 + 38),
      corner(sx + 42, A3 + 4),
    ];
    await path(sPath(x), true, { fill: null, stroke: ink, weight: 6 });
    const after = await path(sPath(x + 54), true, {
      fill: null,
      stroke: ink,
      weight: 6,
    });
    await doc.mutate("outlineStroke", {
      elementId: wid(after),
      width: 6,
      cap: "round",
      join: "round",
      miterLimit: 4,
    });
    // The outline is a region now; dress it so the difference reads.
    await doc.setProperty("polygon", after, "frameFillColor", {
      type: "colorRef",
      value: vermilionTint,
    });
    await doc.setProperty("polygon", after, "frameStrokeWeight", {
      type: "length",
      value: 0.75,
    });
  }
  {
    // offsetPath: the quad grows 8 pt in every direction.
    const x = COL(2);
    await path(quad(x, A3), false, { fill: marigold });
    const after = await path(quad(x + 54, A3), false, { fill: marigold });
    await doc.mutate("offsetPath", {
      elementId: wid(after),
      delta: 8,
      join: "miter",
      miterLimit: 4,
    });
  }
  await rowCaption(
    342,
    "simplifyPath tol 6 · outlineStroke w6 (the stroke becomes a " +
      "region) · offsetPath +8. Edit positions were read back through " +
      "requestPathAnchors, never guessed from page arithmetic.",
  );

  // ── band B: the planar ops ───────────────────────────────────────
  // A fresh overlapping pair per verb; elementIds run TOP-TO-BOTTOM.
  const pair = async (
    x: number,
    y: number,
  ): Promise<{ top: WireId; bottom: WireId }> => {
    const bottom = await path(
      [
        corner(x, y + 6),
        corner(x + 40, y),
        corner(x + 44, y + 36),
        corner(x + 4, y + 40),
      ],
      false,
      { fill: vermilionTint, stroke: ink, weight: 0.75 },
    );
    const top = await path(
      [
        corner(x + 22, y + 16),
        corner(x + 64, y + 12),
        corner(x + 66, y + 52),
        corner(x + 24, y + 54),
      ],
      false,
      { fill: screenBlue, stroke: ink, weight: 0.75 },
    );
    return { top: wid(top), bottom: wid(bottom) };
  };

  const B1 = 380;
  for (const [i, kind] of ["union", "intersect", "subtract", "exclude"].entries()) {
    const x = COL(i);
    const { top, bottom } = await pair(x, B1);
    await doc.mutate("pathfinderBoolean", {
      kept: bottom,
      others: [top],
      kind,
    });
  }
  await rowCaption(
    440,
    "pathfinderBoolean on fresh overlapping pairs: union · intersect · " +
      "subtract · exclude (the survivor keeps the bottom shape's paint)",
  );

  const B2 = 458;
  const VERBS_1: Array<[string, string]> = [
    ["pathfinderDivide", "divide"],
    ["pathfinderTrim", "trim"],
    ["pathfinderMerge", "merge"],
    ["pathfinderCrop", "crop"],
  ];
  for (const [i, [op]] of VERBS_1.entries()) {
    const x = COL(i);
    const { top, bottom } = await pair(x, B2);
    await doc.mutate(op, { elementIds: [top, bottom] });
  }
  await rowCaption(
    518,
    "The region verbs, one fresh pair each: divide · trim · merge · " +
      "crop (the top shape is the cookie cutter)",
  );

  const B3 = 536;
  const VERBS_2: Array<[string, string]> = [
    ["pathfinderOutline", "outline"],
    ["pathfinderMinusBack", "minus back"],
  ];
  for (const [i, [op]] of VERBS_2.entries()) {
    const x = COL(i);
    const { top, bottom } = await pair(x, B3);
    await doc.mutate(op, { elementIds: [top, bottom] });
  }
  // pathfinderFaces: keep ONE engine-minted face — the lens where the
  // two inputs overlap. The id comes from requestPlanarRegions.
  const facesPair = await pair(COL(2), B3);
  const faces = await planarFaces(ctx, [facesPair.top, facesPair.bottom]);
  const lens = faces.find((f) => f.id.includes("0-1")) ?? faces[0];
  if (!faces.some((f) => f.id.includes("0-1"))) {
    notes.push(
      `pathfinderFaces: no face id containing "0-1" — kept ${lens.id} ` +
        `of [${faces.map((f) => f.id).join(", ")}]`,
    );
  }
  await doc.mutate("pathfinderFaces", {
    elementIds: [facesPair.top, facesPair.bottom],
    faces: [lens.id],
    mode: "keep",
  });
  await rowCaption(
    598,
    `outline (edges become open lines) · minus back · faces, keeping ` +
      `only the engine-minted overlap face ${lens.id} - read through ` +
      `requestPlanarRegions, never guessed.`,
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 69",
      "pathPoint Insert/Set/CurveType/Remove",
      "openAt/close/join/simplify/outline/offset",
      "boolean x4 · region verbs x6 · faces",
    ]),
  );

  notes.push(
    "all 10 topology ops and all 11 planar ops (4 boolean modes, 6 " +
      "region verbs, faces) applied on-page with before/after pairs; " +
      "edit positions and face ids read back, never guessed",
  );

  return {
    title: "Path topology and the pathfinder",
    covers: [
      "frames-paths.path.insert",
      "frames-paths.path.close",
      "frames-paths.path.join",
      "frames-paths.pathfinder-boolean",
      "frames-paths.pathfinder-verbs",
      "frames-paths.planar-arrangement",
      "geometry-coordinates.path-topology-ops",
      "geometry-coordinates.bezier-path-geometry",
    ],
    elements,
    notes,
  };
}
