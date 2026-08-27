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

// Cell anatomy (p68, E-Data verso) — the cell property paths as a
// sampler: a 4×4 grid where every cell is labeled with the ONE thing
// done to it. Row one carries the fills and the two applied cell
// styles; row two the four insets (each made visible by where its
// text stands); row three the four vertical justifications, JustifyAlign
// included; row four the twelve edge-stroke paths, three per edge.
// All decor lands as ONE batch — the whole appearance is one undo step.

import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { CELL_STYLE, LAYER, STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import {
  bareTableId,
  cellId,
  cellStyleId,
  insetCells,
  pourStyledCell,
} from "./00-support";

const COLS = 4;
const ROWS = 4;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg = ctx.pageIds[0];
  const elements: string[] = [];

  const head = await proseFrame(ctx, p(68), [60, 58, 492, 88], [
    { text: "The cell, taken apart", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(68), [60, 92, 492, 156], [
    {
      text:
        "Sixteen cells, one property each, every label naming the exact " +
        "path that produced what you see: the fills, then two cells " +
        "wearing appliedCellStyle — Annual TH and Annual TD Number — " +
        "the four insets (read where each caption stands), the " +
        "four vertical justifications, and the twelve per-edge stroke " +
        "paths — colour, weight and tint for each of the four edges.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the sampler ──────────────────────────────────────────────────
  const box: [number, number, number, number] = [60, 170, 492, 480];
  const frame = await doc.textFrame(pg, box);
  await assignLayer(ctx, "textFrame", frame, LAYER.content);
  elements.push(frame);
  const storyId = await doc.storyOf(pg, box);

  const tableId = bareTableId(
    await doc.mutate("insertTable", {
      storyId,
      rows: ROWS,
      cols: COLS,
      headerRows: 0,
      footerRows: 0,
      columnWidths: [108, 108, 108, 108],
      rowHeights: [64, 64, 64, 64],
    }),
  );

  // The pour first — a spanless grid keeps every address alive.
  const tableBody = await doc.paragraphStyle(STYLE.tableBody);
  const tableNumber = await doc.paragraphStyle(STYLE.tableNumber);
  const labels: Array<[number, number, string, string]> = [
    [0, 0, "cellFillColor", tableBody],
    [0, 1, "cellFillTint 30", tableBody],
    [0, 2, "Annual TH", tableBody],
    [0, 3, "TD Number", tableBody],
    [1, 0, "cellInsetTop 16", tableBody],
    [1, 1, "cellInsetLeft 24", tableBody],
    [1, 2, "cellInsetBottom 16", tableBody],
    // Right-aligned figures style, so the right inset reads at the
    // edge it moves.
    [1, 3, "cellInsetRight 24", tableNumber],
    [2, 0, "TopAlign\nthe default", tableBody],
    [2, 1, "CenterAlign\ncentred", tableBody],
    [2, 2, "BottomAlign\nseated", tableBody],
    [2, 3, "JustifyAlign\nslack shared", tableBody],
    [3, 0, "top edge", tableBody],
    [3, 1, "bottom edge", tableBody],
    [3, 2, "left edge", tableBody],
    [3, 3, "right edge", tableBody],
  ];
  for (const [row, col, text, style] of labels) {
    await pourStyledCell(doc, storyId, tableId, row, col, text, style);
  }

  // Padding on the label rows. Row 1 stays untouched (it IS the inset
  // demonstration); so do the two applied-style cells — measured on
  // this page: a cell carrying BOTH an appliedCellStyle and inline
  // insets re-wraps its text at a sliver of the real measure, so the
  // styled pair stays inset-free and wears short labels instead.
  await insetCells(doc, storyId, tableId, [
    [0, 0, "both"], [0, 1, "both"],
    [2, 0, "both"], [2, 1, "both"], [2, 2, "both"], [2, 3, "both"],
    [3, 0, "both"], [3, 1, "both"], [3, 2, "both"], [3, 3, "both"],
  ]);

  // ── decor, one batch ─────────────────────────────────────────────
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const ink = await doc.swatch(SWATCH.ink);
  const slate = await doc.swatch(SWATCH.slate);
  const set = (
    row: number,
    col: number,
    path: string,
    value: unknown,
  ): { op: string; args: unknown } => ({
    op: "setElementProperty",
    args: { elementId: cellId(storyId, tableId, row, col), path, value },
  });
  const colorRef = (v: string) => ({ type: "colorRef", value: v });
  const length = (v: number) => ({ type: "length", value: v });
  const text = (v: string) => ({ type: "text", value: v });

  const decor: Array<{ op: string; args: unknown }> = [
    // Row 0 — fills + applied styles.
    set(0, 0, "cellFillColor", colorRef(vermilion)),
    set(0, 1, "cellFillColor", colorRef(vermilion)),
    set(0, 1, "cellFillTint", length(30)),
    set(0, 2, "appliedCellStyle", text(await cellStyleId(doc, CELL_STYLE.th))),
    set(
      0,
      3,
      "appliedCellStyle",
      text(await cellStyleId(doc, CELL_STYLE.tdNumber)),
    ),
    // Row 1 — the four insets. Bottom-aligned text makes the bottom
    // inset visible; the right inset reads through the right-aligned
    // figures style applied in the pour.
    set(1, 0, "cellInsetTop", length(16)),
    set(1, 1, "cellInsetLeft", length(24)),
    set(1, 2, "cellInsetBottom", length(16)),
    set(1, 2, "cellVerticalJustification", text("BottomAlign")),
    set(1, 3, "cellInsetRight", length(24)),
    // Row 2 — vertical justification, the full vocabulary.
    set(2, 0, "cellVerticalJustification", text("TopAlign")),
    set(2, 1, "cellVerticalJustification", text("CenterAlign")),
    set(2, 2, "cellVerticalJustification", text("BottomAlign")),
    set(2, 3, "cellVerticalJustification", text("JustifyAlign")),
    // Row 3 — the twelve edge paths: colour + weight + tint × 4 edges.
    set(3, 0, "cellTopEdgeStrokeColor", colorRef(vermilion)),
    set(3, 0, "cellTopEdgeStrokeWeight", length(3)),
    set(3, 0, "cellTopEdgeStrokeTint", length(100)),
    set(3, 1, "cellBottomEdgeStrokeColor", colorRef(ink)),
    set(3, 1, "cellBottomEdgeStrokeWeight", length(3)),
    set(3, 1, "cellBottomEdgeStrokeTint", length(100)),
    set(3, 2, "cellLeftEdgeStrokeColor", colorRef(slate)),
    set(3, 2, "cellLeftEdgeStrokeWeight", length(3)),
    set(3, 2, "cellLeftEdgeStrokeTint", length(80)),
    set(3, 3, "cellRightEdgeStrokeColor", colorRef(vermilion)),
    set(3, 3, "cellRightEdgeStrokeWeight", length(3)),
    set(3, 3, "cellRightEdgeStrokeTint", length(40)),
  ];
  await doc.batch(decor);

  const caption = await proseFrame(ctx, p(68), [60, 494, 492, 560], [
    {
      text:
        "Twenty property paths on one grid; the twenty-first, " +
        "appliedTableStyle, dresses the long table overleaf. The EDGE " +
        "tints paint — the pale right edge is the vermilion at 40 — " +
        "while the FILL tint is recorded but composites at full " +
        "strength on this build; the margin says so.",
      style: STYLE.caption,
    },
  ]);
  elements.push(caption.frameId);

  await marginNote(
    ctx,
    p(68),
    "cellFillTint is stored and round-trips, but this build composites the cell fill at full strength (the two vermilion cells above match) — edge-stroke tints DO paint. Alternating row fills are a table-style region property — no per-table wire path; they arrive through an applied style (the ledger overleaf, dressed in Annual Table). → Appendix A",
  );
  elements.push(
    await specLabel(ctx, p(68), [
      "Specimen No. 103",
      "cellFillColor/Tint",
      "cellInsetTop/Left/Bottom/Right",
      "cellVerticalJustification incl. JustifyAlign",
      "12 × cell edge stroke paths",
      "appliedCellStyle ×2",
    ]),
  );

  return {
    title: "Cell anatomy — the property paths",
    notes: [
      "cellFillTint: recorded on the wire and in the model, but the cell " +
        "fill composites at full strength on this build — measured on this " +
        "page (the tinted cell matches the untinted one); edge-stroke " +
        "tints render correctly",
    ],
    covers: [
      "tables.model",
      "tables.cell-composition",
      "tables.cell-vertical-justification",
      "tables.borders-strokes",
    ],
    elements,
  };
}
