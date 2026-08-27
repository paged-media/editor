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

// Table + cell styles (p70, E-Data verso). The CRUD battery runs live
// — createTableStyle/createCellStyle, renames, scratch deletes — and
// one honest boundary is recorded the moment it is measured: a
// live-created table or cell style carries NO arms, because
// setStyleProperty refuses the cell/table collections (the engine's
// own error is quoted in the margin). The visible half of the page is
// therefore the CASCADE: a switch exhibit that swaps one table between
// the fixture's dressed Annual Table and the bare live-created
// Financial, and a closing financial table wearing the fixture styles
// with right-aligned tabular figures.

import { expect } from "@playwright/test";

import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { CELL_STYLE, LAYER, STYLE, TABLE_STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import {
  bareTableId,
  cellId,
  cellStyleId,
  insetCells,
  pourStyledCell,
  tableStyleId,
  transient,
} from "./00-support";

const FINANCIAL_ID = "TableStyle/Annual Financial";
const CURRENCY_ID = "CellStyle/Annual TD Currency";

/** The closing exhibit's figures — the annual's own print order. */
const LEDGER: Array<[string, string, string, string]> = [
  ["Q1", "Specimen sections set", "34", "12 408.00"],
  ["Q2", "Corrections and reflows", "18", "6 512.50"],
  ["Q3", "Plates and proofs pulled", "27", "9 940.25"],
  ["Q4", "Bound copies delivered", "55", "21 780.75"],
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg = ctx.pageIds[0];
  const elements: string[] = [];
  const notes: string[] = [];

  // ── the CRUD battery ─────────────────────────────────────────────
  // Born under working names, renamed in front of the reader — the
  // same convention the paragraph-style chapter set.
  await doc.mutate("createTableStyle", {
    selfId: FINANCIAL_ID,
    name: "Ledger",
    basedOn: null,
  });
  await doc.mutate("renameTableStyle", {
    styleId: FINANCIAL_ID,
    name: "Financial",
  });
  await doc.mutate("createCellStyle", {
    selfId: CURRENCY_ID,
    name: "TD Money",
    basedOn: await cellStyleId(doc, CELL_STYLE.tdNumber),
  });
  await doc.mutate("renameCellStyle", {
    styleId: CURRENCY_ID,
    name: "TD Currency",
  });

  // The boundary, measured rather than assumed: the style-definition
  // door does not reach the cell/table collections. The engine's own
  // refusal is kept and quoted.
  let refusal = "";
  try {
    await doc.mutate("setStyleProperty", {
      collection: "cell",
      styleId: CURRENCY_ID,
      path: "cellFillColor",
      value: { type: "colorRef", value: await doc.swatch("Paper Warm") },
    });
    notes.push(
      "setStyleProperty on the cell collection APPLIED — the recorded " +
        "engine boundary has moved; update this page to dress TD Currency",
    );
  } catch (e) {
    refusal = String(e instanceof Error ? e.message : e);
  }

  // Scratch pair — the full create → rename → delete triple, transient.
  await transient(doc, async () => {
    await doc.mutate("createTableStyle", {
      selfId: "TableStyle/Annual Scratch",
      name: "Scratch Grid",
      basedOn: null,
    });
    await doc.mutate("deleteTableStyle", {
      styleId: "TableStyle/Annual Scratch",
    });
    await doc.mutate("createCellStyle", {
      selfId: "CellStyle/Annual Scratch",
      name: "Scratch Cell",
      basedOn: null,
    });
    await doc.mutate("deleteCellStyle", {
      styleId: "CellStyle/Annual Scratch",
    });
  });

  // The collections a reader's panels would show.
  const tableStyles = (await doc.designer.collection(
    "tableStyles",
  )) as unknown as Array<{ name?: string }>;
  const cellStyles = (await doc.designer.collection(
    "cellStyles",
  )) as unknown as Array<{ name?: string }>;
  expect(tableStyles.map((s) => s.name)).toContain("Financial");
  expect(cellStyles.map((s) => s.name)).toContain("TD Currency");
  expect(tableStyles.map((s) => s.name)).not.toContain("Scratch Grid");
  expect(cellStyles.map((s) => s.name)).not.toContain("Scratch Cell");

  // ── the page ─────────────────────────────────────────────────────
  const head = await proseFrame(ctx, p(70), [60, 58, 492, 88], [
    { text: "Dressing the grid", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(70), [60, 92, 492, 172], [
    {
      text:
        "Two styles were minted for this page: a table style born Ledger " +
        "and renamed Financial, and a cell style born TD Money, renamed " +
        "TD Currency, based on the fixture's Annual TD Number. A scratch " +
        "pair ran the whole create-and-delete round transiently. What a " +
        "live-created style cannot yet do is carry arms — the definition " +
        "door refuses the cell and table collections, so Financial is a " +
        "name with a cascade position and nothing in its pockets. The " +
        "switch below makes that visible instead of hiding it.",
      style: STYLE.body,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the switch exhibit: cascade made visible ─────────────────────
  // One table authored twice over: first wearing the fixture's dressed
  // Annual Table, then — via a second appliedTableStyle write — the
  // bare live-created Financial. The fills and rules that vanish ARE
  // the region cascade re-resolving.
  const annualTableId = await tableStyleId(doc, TABLE_STYLE);
  const tableBody = await doc.paragraphStyle(STYLE.tableBody);
  const tableHead = await doc.paragraphStyle(STYLE.tableHead);
  const tableNumber = await doc.paragraphStyle(STYLE.tableNumber);

  const mkSwitch = async (
    box: [number, number, number, number],
    styleRef: string,
    tag: string,
  ): Promise<void> => {
    const frame = await doc.textFrame(pg, box);
    await assignLayer(ctx, "textFrame", frame, LAYER.content);
    elements.push(frame);
    const storyId = await doc.storyOf(pg, box);
    const tid = bareTableId(
      await doc.mutate("insertTable", {
        storyId,
        rows: 3,
        cols: 2,
        headerRows: 1,
        footerRows: 0,
        columnWidths: [104, 104],
        rowHeights: [22, 22, 22],
      }),
    );
    await pourStyledCell(doc, storyId, tid, 0, 0, "STYLE", tableHead);
    await pourStyledCell(doc, storyId, tid, 0, 1, "REGIONS", tableHead);
    await pourStyledCell(doc, storyId, tid, 1, 0, tag, tableBody);
    await pourStyledCell(doc, storyId, tid, 1, 1, "header + body", tableBody);
    await pourStyledCell(doc, storyId, tid, 2, 0, "cascade", tableBody);
    await pourStyledCell(doc, storyId, tid, 2, 1, "resolved live", tableBody);
    await insetCells(doc, storyId, tid, [
      [0, 0, "both"], [0, 1, "both"], [1, 0, "both"], [1, 1, "both"],
      [2, 0, "both"], [2, 1, "both"],
    ]);
    await doc.setProperty(
      "table",
      { story_id: storyId, table_id: tid },
      "appliedTableStyle",
      { type: "text", value: styleRef },
    );
  };
  await mkSwitch([60, 186, 274, 276], annualTableId, "Annual Table");
  await mkSwitch([278, 186, 492, 276], FINANCIAL_ID, "Financial");
  const switchCaption = await proseFrame(ctx, p(70), [60, 282, 492, 322], [
    {
      text:
        "The same table twice. Left, appliedTableStyle names the fixture's " +
        "Annual Table: header band, alternating fills, hairlines — all " +
        "region defaults. Right, it names the live-created Financial: the " +
        "dressing vanishes, because the style is real but empty.",
      style: STYLE.caption,
    },
  ]);
  elements.push(switchCaption.frameId);

  // ── the closing exhibit ──────────────────────────────────────────
  const exhibitBox: [number, number, number, number] = [60, 348, 492, 500];
  const exhibitFrame = await doc.textFrame(pg, exhibitBox);
  await assignLayer(ctx, "textFrame", exhibitFrame, LAYER.content);
  elements.push(exhibitFrame);
  const exhibitStory = await doc.storyOf(pg, exhibitBox);
  await doc.insertText(
    exhibitStory,
    "Table 3 — the print order, closed out.",
    0,
  );
  await doc.applyStyle(
    exhibitStory,
    0,
    "Table 3 — the print order, closed out.".length,
    await doc.paragraphStyle(STYLE.caption),
    "paragraph",
  );
  const exhibitId = bareTableId(
    await doc.mutate("insertTable", {
      storyId: exhibitStory,
      rows: 1 + LEDGER.length,
      cols: 4,
      headerRows: 1,
      footerRows: 0,
      columnWidths: [62, 222, 62, 86],
      rowHeights: [24, 22, 22, 22, 22],
    }),
  );
  const headers = ["QTR", "MILESTONE", "RUNS", "COST (EUR)"];
  for (const [col, label] of headers.entries()) {
    await pourStyledCell(doc, exhibitStory, exhibitId, 0, col, label, tableHead);
  }
  for (const [i, row] of LEDGER.entries()) {
    await pourStyledCell(doc, exhibitStory, exhibitId, 1 + i, 0, row[0], tableBody);
    await pourStyledCell(doc, exhibitStory, exhibitId, 1 + i, 1, row[1], tableBody);
    await pourStyledCell(doc, exhibitStory, exhibitId, 1 + i, 2, row[2], tableNumber);
    await pourStyledCell(doc, exhibitStory, exhibitId, 1 + i, 3, row[3], tableNumber);
  }
  {
    const pad: Array<[number, number, "left" | "right" | "both"]> = [];
    for (let r = 0; r <= LEDGER.length; r += 1) {
      pad.push([r, 0, "both"], [r, 1, "left"], [r, 2, "right"], [r, 3, "right"]);
    }
    await insetCells(doc, exhibitStory, exhibitId, pad);
  }

  // The fixture's cascade dresses the whole; appliedCellStyle marks the
  // figure column explicitly with the fixture's TD Number.
  const decor: Array<{ op: string; args: unknown }> = [
    {
      op: "setElementProperty",
      args: {
        elementId: {
          kind: "table",
          id: { story_id: exhibitStory, table_id: exhibitId },
        },
        path: "appliedTableStyle",
        value: { type: "text", value: annualTableId },
      },
    },
  ];
  const tdNumber = await cellStyleId(doc, CELL_STYLE.tdNumber);
  for (let r = 1; r <= LEDGER.length; r += 1) {
    for (const col of [2, 3]) {
      decor.push({
        op: "setElementProperty",
        args: {
          elementId: cellId(exhibitStory, exhibitId, r, col),
          path: "appliedCellStyle",
          value: { type: "text", value: tdNumber },
        },
      });
    }
  }
  await doc.batch(decor);

  const exhibitCaption = await proseFrame(ctx, p(70), [60, 508, 492, 560], [
    {
      text:
        "The figures column is set in Table Number — right-aligned " +
        "tabular lining, the fixture's own style — with appliedCellStyle " +
        "naming Annual TD Number per cell. Decimal figures align on " +
        "their tabular widths and the right edge.",
      style: STYLE.caption,
    },
  ]);
  elements.push(exhibitCaption.frameId);

  await marginNote(
    ctx,
    p(70),
    "Live-created table/cell styles carry no arms: setStyleProperty refuses the cell/table collections (" +
      (refusal ? refusal.slice(0, 120) : "no refusal recorded") +
      "). Decimal-character tab stops are not addressable inside cells (paragraphTabStops is a storyRange path, and storyRange carries no cell arm) — the figures use tabular lining + right alignment instead. Scratch styles: demonstrated, not resident. → Appendix A",
  );
  elements.push(
    await specLabel(ctx, p(70), [
      "Specimen No. 105",
      "createTableStyle · renameTableStyle · deleteTableStyle (transient)",
      "createCellStyle · renameCellStyle · deleteCellStyle (transient)",
      "appliedTableStyle ×3 · appliedCellStyle ×8",
      "setStyleProperty (cell) — refused, quoted in margin",
    ]),
  );

  return {
    title: "Table and cell styles",
    covers: ["tables.model", "tables.style-cascade", "tables.cell-composition"],
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
