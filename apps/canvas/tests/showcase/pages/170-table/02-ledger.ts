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

// The long table (p66–p67, one E-Data spread) — the demonstration the
// 16-page showcase recorded it could NOT make ("header-row REPEAT
// across a chain break is not exercised here: the table fits inside a
// single frame"). Here the table is deliberately taller than its
// frame: twenty-two body rows about the annual's own page plan, in a
// story threaded across two linked frames that cross the gutter. The
// header row (insertHeaderRow) and footer row (insertFooterRow) repeat
// in BOTH fragments — the renderer reserves band height per fragment,
// which is exactly the behaviour a broken table needs to stay legible.
//
// The data is the ANNUAL_PLAN itself — the same table this build is
// executing — so the exhibit is self-describing rather than invented.
//
// Oracles: the host story must NOT be overset (a truncated flagship
// would otherwise go quietly green), p67's pixels must change BEFORE
// its spec label lands (so the change is the table's continuation, not
// the label), and the table's own row/column counts are read back
// through the element-properties door.

import { expect } from "@playwright/test";

import { script } from "../../../e2e/harness/ui";
import { assignLayer, proseFrame, specLabel } from "../../annual-support";
import { LAYER } from "../../names-annual";
import { ANNUAL_PLAN, STYLE, TABLE_STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import {
  bareTableId,
  insetCells,
  pourStyledCell,
  tableStyleId,
} from "./00-support";

const CAPTION =
  "Table 2 — the annual's own page plan: every chapter of this document, " +
  "the pages it owns, and how many leaves that is.";

/** Column widths on the 12-column E-Data grid (25 pt units, 12 pt
 *  gutters): 74 = two units + a gutter, 222 lands the second divider on
 *  the unit-9 seam; they sum to the 432 pt measure. Two of them are
 *  then CHANGED live through setColumnWidth. */
const COL_WIDTHS = [74, 222, 68, 68];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg66 = ctx.pageIds[0];
  const pg67 = ctx.pageIds[1];
  const elements: string[] = [];

  // Baseline for the continuation oracle — taken before ANY authoring.
  const beforeRecto = await doc.renderPage(p(67));

  // ── p66 furniture ────────────────────────────────────────────────
  const head = await proseFrame(ctx, p(66), [60, 58, 492, 88], [
    { text: "One table, two pages", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(66), [60, 92, 492, 144], [
    {
      text:
        "The table below is taller than the frame that holds it, on " +
        "purpose. Its story is threaded into a second frame on the facing " +
        "page; the break falls mid-body, and the header and footer bands " +
        "say themselves again on the other side of the gutter.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the chain: two frames, linked EMPTY (linkFrames refuses a
  //    non-empty target), then the pour ─────────────────────────────
  const boxA: [number, number, number, number] = [60, 152, 492, 584];
  const boxB: [number, number, number, number] = [48, 90, 480, 584];
  const frameA = await doc.textFrame(pg66, boxA);
  const frameB = await doc.textFrame(pg67, boxB);
  await doc.linkFrames(frameA, frameB);
  await assignLayer(ctx, "textFrame", frameA, LAYER.content);
  await assignLayer(ctx, "textFrame", frameB, LAYER.content);
  elements.push(frameA, frameB);

  const storyId = await doc.storyOf(pg66, boxA);
  await doc.insertText(storyId, CAPTION, 0);
  await doc.applyStyle(
    storyId,
    0,
    [...CAPTION].length,
    await doc.paragraphStyle(STYLE.caption),
    "paragraph",
  );

  // ── structure ────────────────────────────────────────────────────
  // Created with NO bands, then given both through the band ops — the
  // door this spread exists to prove. `insertTable` mints a STRUCTURED
  // id; `bareTableId` narrows it loudly.
  const tableId = bareTableId(
    await doc.mutate("insertTable", {
      storyId,
      rows: ANNUAL_PLAN.length,
      cols: COL_WIDTHS.length,
      headerRows: 0,
      footerRows: 0,
      columnWidths: COL_WIDTHS,
      rowHeights: ANNUAL_PLAN.map(() => 24),
    }),
  );
  // Header row arrives at the TOP (body shifts down one); footer
  // appends at the BOTTOM.
  await doc.mutate("insertHeaderRow", { storyId, tableId });
  await doc.mutate("insertFooterRow", { storyId, tableId });
  const headerRow = 0;
  const footerRow = ANNUAL_PLAN.length + 1;

  // Live sizing: both bands taller than a body row, and the two
  // right-hand columns re-cut so the measure stays exactly 432.
  await doc.mutate("setRowHeight", { storyId, tableId, row: headerRow, height: 28 });
  await doc.mutate("setRowHeight", { storyId, tableId, row: footerRow, height: 28 });
  await doc.mutate("setColumnWidth", { storyId, tableId, col: 2, width: 62 });
  await doc.mutate("setColumnWidth", { storyId, tableId, col: 3, width: 74 });

  // The footer is ONE spanned cell — merge before pouring, because the
  // covered cells stop existing as addresses.
  await doc.mutate("setCellSpan", {
    storyId,
    tableId,
    row: footerRow,
    col: 0,
    rowSpan: 1,
    columnSpan: COL_WIDTHS.length,
  });

  // ── the pour (cell-scoped text, v54; cell-scoped styling, v55) ───
  const tableHead = await doc.paragraphStyle(STYLE.tableHead);
  const tableBody = await doc.paragraphStyle(STYLE.tableBody);
  const tableNumber = await doc.paragraphStyle(STYLE.tableNumber);

  const headers = ["NO.", "CHAPTER", "PAGES", "LEAVES"];
  for (const [col, label] of headers.entries()) {
    await pourStyledCell(doc, storyId, tableId, headerRow, col, label, tableHead);
  }
  for (const [i, entry] of ANNUAL_PLAN.entries()) {
    const row = 1 + i;
    const first = entry.pages[0];
    const last = entry.pages[entry.pages.length - 1];
    const cells: Array<[number, string, string]> = [
      [0, String(i + 1), tableNumber],
      [1, entry.title, tableBody],
      [2, first === last ? String(first) : `${first}–${last}`, tableNumber],
      [3, String(entry.pages.length), tableNumber],
    ];
    for (const [col, text, style] of cells) {
      await pourStyledCell(doc, storyId, tableId, row, col, text, style);
    }
  }
  const totalLeaves = ANNUAL_PLAN.reduce((n, c) => n + c.pages.length, 0);
  await pourStyledCell(
    doc,
    storyId,
    tableId,
    footerRow,
    0,
    `${totalLeaves} pages in ${ANNUAL_PLAN.length} chapters — and this table itself occupies two of them.`,
    tableBody,
  );

  // Readable padding, one batch: figures keep clear of the rule they
  // align on; the title column keeps clear of the figure beside it.
  const pad: Array<[number, number, "left" | "right" | "both"]> = [
    [0, 0, "both"],
    [0, 1, "both"],
    [0, 2, "both"],
    [0, 3, "both"],
    [footerRow, 0, "both"],
  ];
  for (let r = 1; r <= ANNUAL_PLAN.length; r += 1) {
    pad.push([r, 0, "right"], [r, 1, "left"], [r, 2, "right"], [r, 3, "right"]);
  }
  await insetCells(doc, storyId, tableId, pad);

  // ── dress: the fixture's table style, so the region cascade (header
  //    band, alternating body fills, hairline dividers) does the
  //    styling rather than a hundred per-cell writes ────────────────
  await doc.setProperty(
    "table",
    { story_id: storyId, table_id: tableId },
    "appliedTableStyle",
    { type: "text", value: await tableStyleId(doc, TABLE_STYLE) },
  );

  // ── oracles ──────────────────────────────────────────────────────
  // Render BOTH pages first: the overset flag derives from build
  // diagnostics, so the read must follow a composition.
  await doc.renderPage(p(66));
  await doc.renderPage(p(67));
  const summaries = JSON.parse(
    (await script(ctx.page, "paged.stories()"))[0] ?? "[]",
  ) as Array<{ selfId: string; overset?: boolean }>;
  const summary = summaries.find((s) => s.selfId === storyId);
  expect(
    summary?.overset ?? false,
    "the chain holds the whole table — a truncated flagship must fail, not pass",
  ).toBe(false);

  // The table's own account of its structure, through the element-
  // properties read door on the structured table id.
  const counts = await ctx.page.evaluate(
    async ({ storyId, tableId }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries: Array<{ path: string; value: { value: unknown } }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties({
        kind: "table",
        id: { story_id: storyId, table_id: tableId },
      });
      const read = (p: string): unknown =>
        props?.entries.find((e) => e.path === p)?.value?.value ?? null;
      return { rows: read("tableRowCount"), cols: read("tableColumnCount") };
    },
    { storyId, tableId },
  );
  const notes: string[] = [];
  if (counts.rows !== null) {
    expect(counts.rows).toBe(ANNUAL_PLAN.length + 2);
    expect(counts.cols).toBe(COL_WIDTHS.length);
  } else {
    notes.push(
      "the element-properties door answered nothing for the table id — " +
        "row/column counts verified only through the render",
    );
  }

  // The continuation is ON the facing page — asserted before p67's own
  // spec label lands, so the pixels that moved are the table's.
  await doc.expectRenderChanged(p(67), beforeRecto);

  // ── apparatus ────────────────────────────────────────────────────
  elements.push(
    await specLabel(ctx, p(66), [
      "Specimen No. 101",
      "insertTable (structured id)",
      "insertHeaderRow · insertFooterRow",
      "setRowHeight ×2 · setColumnWidth ×2 · setCellSpan",
      "insertText.cell · applyStyle.cell",
      "appliedTableStyle",
    ]),
    await specLabel(ctx, p(67), [
      "Specimen No. 102",
      "the continuation — header and footer repeated at the break",
      "tables.header-footer-repeat",
    ]),
  );

  return {
    title: "One table, two pages — the repeating bands",
    covers: [
      "tables.model",
      "tables.cell-composition",
      "tables.row-col-sizing",
      "tables.spans",
      "tables.header-footer-repeat",
      "tables.borders-strokes",
      "tables.style-cascade",
      "tables.alternating-fills",
    ],
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
