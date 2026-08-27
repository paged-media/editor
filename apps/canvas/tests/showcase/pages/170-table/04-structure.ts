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

// Structure ops (p69, E-Data recto) — the grid rebuilt live. The
// operations log IS a table, and the table records the operations
// performed on itself: a row and a column arrive after the pour, a
// scratch row and a scratch column come and go transiently, and a
// second small table has its header and footer bands added and
// removed again. The nested-table question is answered honestly: the
// wire's insertTable addresses a STORY and carries no cell qualifier,
// so a live nested table is inexpressible — nested tables render from
// IDML only, and the margin note says so.

import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { bareTableId, insetCells, pourStyledCell, transient } from "./00-support";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg = ctx.pageIds[0];
  const elements: string[] = [];

  const head = await proseFrame(ctx, p(69), [48, 58, 480, 88], [
    { text: "Rebuilding the grid, live", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(69), [48, 92, 480, 156], [
    {
      text:
        "The operations log below is itself the table the operations ran " +
        "on. It was minted four rows by three columns; a row and a fourth " +
        "column arrived afterwards, live; a scratch row and a scratch " +
        "column each existed for exactly two operations — created, then " +
        "deleted — so the record shows them without the grid keeping them.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the operations log ───────────────────────────────────────────
  const box: [number, number, number, number] = [48, 170, 480, 340];
  const frame = await doc.textFrame(pg, box);
  await assignLayer(ctx, "textFrame", frame, LAYER.content);
  elements.push(frame);
  const storyId = await doc.storyOf(pg, box);

  const tableId = bareTableId(
    await doc.mutate("insertTable", {
      storyId,
      rows: 4,
      cols: 3,
      headerRows: 0,
      footerRows: 0,
      columnWidths: [110, 214, 54],
      rowHeights: [24, 30, 30, 30],
    }),
  );

  const tableHead = await doc.paragraphStyle(STYLE.tableHead);
  const tableBody = await doc.paragraphStyle(STYLE.tableBody);
  const pour = (row: number, col: number, text: string, style = tableBody) =>
    pourStyledCell(doc, storyId, tableId, row, col, text, style);

  // The initial pour — before any structural edit, so the edits below
  // demonstrably happened to a table that already held text.
  await pour(0, 0, "OP", tableHead);
  await pour(0, 1, "WHAT HAPPENED", tableHead);
  await pour(0, 2, "AT", tableHead);
  await pour(1, 0, "insertTable");
  await pour(1, 1, "minted this grid: four rows, three columns, poured full");
  await pour(1, 2, "—");
  await pour(2, 0, "deleteTableRow");
  await pour(2, 1, "ran on a scratch row that stood below this one for exactly two ops");
  await pour(2, 2, "transient");
  await pour(3, 0, "deleteTableColumn");
  await pour(3, 1, "ran on a scratch fifth column — same two-op lifetime");
  await pour(3, 2, "transient");

  // ── the live arrivals ────────────────────────────────────────────
  // A row into the middle: rows at and below `at` renumber; the pour
  // into the fresh address lands in the NEW row.
  await doc.mutate("insertTableRow", { storyId, tableId, at: 2 });
  await pour(2, 0, "insertTableRow");
  await pour(2, 1, "this row arrived AFTER the pour — everything below it renumbered");
  await pour(2, 2, "at 2");

  // A fourth column, cut to keep the 432 pt measure.
  await doc.mutate("insertTableColumn", { storyId, tableId, at: 3 });
  await doc.mutate("setColumnWidth", { storyId, tableId, col: 3, width: 54 });
  await pour(0, 3, "COL", tableHead);
  await pour(2, 3, "new", tableBody);

  // Readable padding across the whole log (the fourth column included)
  // and the bench, each as one batch.
  {
    const pad: Array<[number, number, "left" | "right" | "both"]> = [];
    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 4; c += 1) pad.push([r, c, "both"]);
    }
    await insetCells(doc, storyId, tableId, pad);
  }

  // ── the scratch pair — demonstrated, not resident ────────────────
  await transient(doc, async () => {
    await doc.mutate("insertTableRow", { storyId, tableId, at: 5 });
    await doc.mutate("deleteTableRow", { storyId, tableId, at: 5 });
    await doc.mutate("insertTableColumn", { storyId, tableId, at: 4 });
    await doc.mutate("deleteTableColumn", { storyId, tableId, at: 4 });
  });

  // ── the band bench ───────────────────────────────────────────────
  // A second table has its header and footer bands added and removed
  // again. The GRID survives unchanged — band membership is metadata
  // over rows — so the exhibit stays on the page while the four ops
  // net to zero.
  const benchBox: [number, number, number, number] = [48, 372, 300, 470];
  const benchFrame = await doc.textFrame(pg, benchBox);
  await assignLayer(ctx, "textFrame", benchFrame, LAYER.content);
  elements.push(benchFrame);
  const benchStory = await doc.storyOf(pg, benchBox);
  const benchId = bareTableId(
    await doc.mutate("insertTable", {
      storyId: benchStory,
      rows: 2,
      cols: 2,
      headerRows: 0,
      footerRows: 0,
      columnWidths: [126, 126],
      rowHeights: [24, 24],
    }),
  );
  await pourStyledCell(doc, benchStory, benchId, 0, 0, "the band bench", tableBody);
  await pourStyledCell(doc, benchStory, benchId, 0, 1, "2 × 2, before", tableBody);
  await pourStyledCell(doc, benchStory, benchId, 1, 0, "and after", tableBody);
  await pourStyledCell(doc, benchStory, benchId, 1, 1, "still 2 × 2", tableBody);
  await insetCells(doc, benchStory, benchId, [
    [0, 0, "both"], [0, 1, "both"], [1, 0, "both"], [1, 1, "both"],
  ]);
  await transient(doc, async () => {
    await doc.mutate("insertHeaderRow", { storyId: benchStory, tableId: benchId });
    await doc.mutate("removeHeaderRow", { storyId: benchStory, tableId: benchId });
    await doc.mutate("insertFooterRow", { storyId: benchStory, tableId: benchId });
    await doc.mutate("removeFooterRow", { storyId: benchStory, tableId: benchId });
  });

  const benchCaption = await proseFrame(ctx, p(69), [312, 372, 480, 480], [
    {
      text:
        "The band bench: a header and a footer were inserted and removed " +
        "again on this small table. Four real ops, net zero — the long " +
        "table on the previous spread is where the bands stayed to repeat.",
      style: STYLE.caption,
    },
  ]);
  elements.push(benchCaption.frameId);

  const nested = await proseFrame(ctx, p(69), [48, 496, 480, 560], [
    {
      text:
        "One structural door does not exist: a table inside a cell. The " +
        "wire's insertTable takes a story address and carries no cell " +
        "qualifier — checked against the generated wire types, not " +
        "guessed — so a nested table cannot be authored live. Documents " +
        "that arrive with one render it faithfully; this page simply " +
        "cannot make one.",
      style: STYLE.body,
    },
  ]);
  elements.push(nested.frameId);

  await marginNote(
    ctx,
    p(69),
    "Nested tables render from IDML; the wire has no door (insertTable addresses a story, never a cell). Scratch row, column and bands: demonstrated, not resident. → Appendix A",
  );
  elements.push(
    await specLabel(ctx, p(69), [
      "Specimen No. 104",
      "insertTableRow · insertTableColumn",
      "deleteTableRow · deleteTableColumn (transient)",
      "insertHeaderRow · removeHeaderRow · insertFooterRow · removeFooterRow",
      "setColumnWidth",
    ]),
  );

  return {
    title: "Structure ops — the grid rebuilt live",
    covers: ["tables.model", "tables.cell-composition"],
    elements,
  };
}
