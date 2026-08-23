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

// Page 11 — a native table.
//
// NATIVE, not drawn. The rules and the fills on this page are a real
// IDML `<Table>` inside a story: rows, columns, a header band, a span,
// and per-cell composition. Nothing here is a stack of rectangles with
// text on top, which is the shortcut that looks identical in a PNG and
// then exports as a pile of unrelated frames.
//
// THREE LANES, AND WHY THEY ARE NOT ONE BATCH. Building a table takes
// ops from two different families, and `Operation::Batch` carries only
// the frame/property family — text is not an Operation. Combining them
// makes the engine reject the WHOLE batch, which is how paged.sheet's
// tables once shipped BLANK. So this page runs:
//
//   1. structure — `insertTable`, sized at create with column widths
//      and row heights, declaring one header row;
//   2. text — one `insertText` per cell, each carrying the
//      `TextCellAddr` qualifier that says "cell-local, not story-local";
//   3. decor — the span, the fills, the edge strokes, the vertical
//      justification and the cell-internal character styling, as ONE
//      batch, so the whole appearance is one undo step.
//
// THE STRUCTURED TABLE ID. `insertTable` mints an `ElementId::Table`
// whose `id` is an OBJECT (`{ story_id, table_id }`), not a string.
// Every cell address downstream wants the bare `table_id`; reading the
// whole object as one is the exact bug that nested a map where a string
// belonged and left paged.sheet's cells unaddressable. `bareTableId`
// below narrows it once, loudly.

import { expect } from "@playwright/test";

import { CHAR_STYLE, columnBounds, COLUMN, STYLE, SWATCH } from "../names";
import type { PageContext, PageReport } from "../types";

/** The header band, then four data rows, then the spanning note. */
const HEADER = ["Stage", "Crate", "Reads", "Writes"] as const;

const ROWS: ReadonlyArray<readonly [string, string, string, string]> = [
  ["Parse", "paged-parse", "IDML package", "Document model"],
  ["Resolve", "paged-scene", "Document model", "Scene graph"],
  ["Compose", "paged-compose", "Scene graph", "Display list"],
  ["Rasterise", "paged-gpu", "Display list", "Pixels"],
];

const NOTE =
  "One direction, five stages — the same path serves a live canvas, a " +
  "snapshot in a test, and a PDF bound for a press.";

const CAPTION =
  "Table 1 — the render pipeline, and what each stage hands to the next.";

/** Column widths in pt; they sum to the live measure so the table fills
 *  its frame exactly rather than overhanging it. */
const COL_WIDTHS = [186, 94, 94, 94];
/** Header, four data rows, then a taller row for the spanning note. */
const ROW_HEIGHTS = [26, 22, 22, 22, 22, 34];

const HEADER_ROW = 0;
const NOTE_ROW = 1 + ROWS.length;

/**
 * The bare `table_id` from whatever `insertTable` handed back.
 *
 * `ShowcaseDoc.mutate` is typed `Promise<string | null>` because almost
 * every insert mints a string id — but `ElementId::Table` is structured,
 * so the value that actually arrives here is `{ story_id, table_id }`.
 * Narrowing rather than casting means a future wire that DOES mint a
 * string keeps working, and a wire that mints neither fails here with
 * the payload in the message instead of failing later as a table whose
 * cells silently refuse every address.
 */
function bareTableId(created: unknown): string {
  // `ShowcaseDoc.mutate` returns `unknown` precisely so this narrowing
  // has to happen at the call site: `insertTable` mints a STRUCTURED
  // ElementId (`{ story_id, table_id }`), not a bare self_id, and
  // reading it as a string yields something that addresses nothing.
  // paged.sheet shipped that bug once.
  if (created && typeof created === "object") {
    const t = (created as { table_id?: unknown }).table_id;
    if (typeof t === "string" && t.length > 0) return t;
  }
  if (typeof created === "string" && created.length > 0) return created;
  throw new Error(
    `insertTable minted no addressable table id: ${JSON.stringify(created)}`,
  );
}

/** A `tableCell` ElementId — the wire's cell-addressing door. */
function cellId(storyId: string, tableId: string, row: number, col: number) {
  return {
    kind: "tableCell",
    id: { story_id: storyId, table_id: tableId, row, col },
  };
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];

  const accentTint = await doc.swatch(SWATCH.accentTint);
  const ink = await doc.swatch(SWATCH.ink);

  // One frame across the full measure. Its height is generous on
  // purpose: the table is 148pt of rows plus the caption, so nothing
  // oversets and the page's evidence is the table rather than a
  // truncation.
  const live = COLUMN.live;
  const bounds: [number, number, number, number] = [
    live[0],
    live[1],
    live[0] + 420,
    columnBounds(2)[3],
  ];
  const frame = await doc.textFrame(pageId, bounds);
  const storyId = await doc.storyOf(pageId, bounds);

  // ── 1. the caption, then the structure ──────────────────────────
  // The caption goes in first because `insertTable` attaches the table
  // on a fresh paragraph at the END of the story; pouring it afterwards
  // would put the caption below its own table.
  await doc.insertText(storyId, CAPTION);
  await doc.applyStyle(
    storyId,
    0,
    [...CAPTION].length,
    await doc.paragraphStyle(STYLE.caption),
    "paragraph",
  );

  const tableId = bareTableId(
    await doc.mutate("insertTable", {
      storyId,
      rows: 1 + ROWS.length + 1,
      cols: HEADER.length,
      headerRows: 1,
      footerRows: 0,
      columnWidths: COL_WIDTHS,
      rowHeights: ROW_HEIGHTS,
    }),
  );

  // ── 2. the text lane ────────────────────────────────────────────
  // One mutate per cell. `cell` switches `offset` from a story-local
  // body offset to a cell-local one, which is what lets a table's text
  // live inside the same story as the caption without the two colliding.
  const pourCell = (row: number, col: number, text: string) =>
    doc.mutate("insertText", {
      storyId,
      offset: 0,
      text,
      cell: { tableId, row, col },
    });

  for (const [col, label] of HEADER.entries()) {
    await pourCell(HEADER_ROW, col, label);
  }
  for (const [r, row] of ROWS.entries()) {
    for (const [col, value] of row.entries()) {
      await pourCell(1 + r, col, value);
    }
  }
  // Only the span's origin cell is filled; the three it swallows would
  // be unreachable text.
  await pourCell(NOTE_ROW, 0, NOTE);

  // ── 3. the decor lane, as one batch ─────────────────────────────
  const decor: Array<{ op: string; args: unknown }> = [];

  // The merge. `setCellSpan` is anchored at the span's origin, and the
  // cells it covers stop existing as addresses — which is why the pour
  // above ran first.
  decor.push({
    op: "setCellSpan",
    args: {
      storyId,
      tableId,
      row: NOTE_ROW,
      col: 0,
      rowSpan: 1,
      columnSpan: HEADER.length,
    },
  });

  // Header band: a tint fill, centred content, and a rule under it. The
  // stroke gets a COLOUR as well as a weight — a weight alone leaves the
  // edge resolving to no paint, which draws nothing and reads in a
  // screenshot exactly like a table with no dividers.
  for (let col = 0; col < HEADER.length; col += 1) {
    const id = cellId(storyId, tableId, HEADER_ROW, col);
    decor.push({
      op: "setElementProperty",
      args: {
        elementId: id,
        path: "cellFillColor",
        value: { type: "colorRef", value: accentTint },
      },
    });
    decor.push({
      op: "setElementProperty",
      args: {
        elementId: id,
        path: "cellVerticalJustification",
        value: { type: "text", value: "CenterAlign" },
      },
    });
    decor.push({
      op: "setElementProperty",
      args: {
        elementId: id,
        path: "cellBottomEdgeStrokeColor",
        value: { type: "colorRef", value: ink },
      },
    });
    decor.push({
      op: "setElementProperty",
      args: {
        elementId: id,
        path: "cellBottomEdgeStrokeWeight",
        value: { type: "length", value: 1 },
      },
    });
  }

  // The spanning note: a lighter tint of the same ink, centred, and
  // inset from the rule so the sentence is not welded to the column.
  const noteCell = cellId(storyId, tableId, NOTE_ROW, 0);
  decor.push({
    op: "setElementProperty",
    args: {
      elementId: noteCell,
      path: "cellFillColor",
      value: { type: "colorRef", value: accentTint },
    },
  });
  decor.push({
    op: "setElementProperty",
    args: {
      elementId: noteCell,
      path: "cellFillTint",
      value: { type: "length", value: 40 },
    },
  });
  decor.push({
    op: "setElementProperty",
    args: {
      elementId: noteCell,
      path: "cellVerticalJustification",
      value: { type: "text", value: "CenterAlign" },
    },
  });
  decor.push({
    op: "setElementProperty",
    args: {
      elementId: noteCell,
      path: "cellInsetLeft",
      value: { type: "length", value: 8 },
    },
  });
  decor.push({
    op: "setElementProperty",
    args: {
      elementId: noteCell,
      path: "cellTopEdgeStrokeColor",
      value: { type: "colorRef", value: ink },
    },
  });
  decor.push({
    op: "setElementProperty",
    args: {
      elementId: noteCell,
      path: "cellTopEdgeStrokeWeight",
      value: { type: "length", value: 1 },
    },
  });

  // Cell-INTERNAL character styling: `applyStyle` carrying the same
  // `TextCellAddr` the pour used, so `[start, end)` is cell-local. This
  // is the door that closed the gap where a cell's text could only ever
  // carry the table's default formatting.
  for (const [col, label] of HEADER.entries()) {
    decor.push({
      op: "applyStyle",
      args: {
        storyId,
        start: 0,
        end: [...label].length,
        style: await doc.characterStyle(CHAR_STYLE.emphasis),
        scope: "character",
        cell: { tableId, row: HEADER_ROW, col },
      },
    });
  }

  await doc.batch(decor);

  // The oracle. A table has no footprint in its host story's CHARACTER
  // space — cell text lives in the cells, not in the story's runs — so
  // the caption is still the whole of what `characterCount` can see.
  // Asserted as a floor rather than an equality: the floor proves the
  // caption survived the table insert, and if the engine ever does
  // account for cell text the exact count is REPORTED instead of
  // turning a documented uncertainty into a red build.
  const storyChars = await doc.storyChars(storyId);
  expect(
    storyChars,
    "the caption survives the table insert",
  ).toBeGreaterThanOrEqual([...CAPTION].length);
  if (storyChars !== [...CAPTION].length) {
    notes.push(
      `the host story reports ${storyChars} characters where the caption is ` +
        `${[...CAPTION].length} — the table's cell text is being counted in ` +
        "the story's character space, which the cell-addressed offsets " +
        "assume it is not",
    );
  }

  notes.push(
    "header-row REPEAT across a chain break is not exercised here: the " +
      "table declares a header band but fits inside a single frame, so " +
      "there is no break for the band to repeat over. That behaviour needs " +
      "a table taller than its frame, which this page deliberately avoids " +
      "(it would render as overset rather than as a table).",
  );

  return {
    title: "Tables",
    covers: [
      "tables.model",
      "tables.cell-composition",
      "tables.spans",
      "tables.row-col-sizing",
      "tables.borders-strokes",
      "tables.cell-vertical-justification",
      "stories-text.text.insert",
      "stories-text.style-apply-range",
    ],
    elements: [frame],
    notes,
  };
}
