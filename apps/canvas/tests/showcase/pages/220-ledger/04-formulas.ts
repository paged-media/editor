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

// Formulas and spill (p99, E-Data recto) — the calc engine driven
// through the surfaces a designer uses, then lowered so the RESULTS
// are on the page; and the function-family roster, counted from the
// plugin's own registry at build time rather than asserted from memory.
//
// The workbook is the harness's formula fixture (A1=2, A2=3, a SUM and
// a concatenation), imported through the `importXlsx` COMMAND — the
// host file-picker lane. Three cells are then typed through the grid
// panel's formula bar: an aggregate, a text function, and a dynamic
// array whose SPILL materializes three more cells from one anchor.
// The lowered table below prints the computed values, because the
// formatted value IS the value on both surfaces — one render path.
//
// The roster: `plugin-sheets/registry/functions/*.yaml` is the
// build-consumed source of truth (no row, no dispatch), read here with
// the same splitter discipline the coverage gate uses. The counts on
// the page are whatever the registry says on the day the book is built.

import { expect } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openPanel } from "../../../fidelity/canvas-driver";
import { withActivePage } from "../../active-page";
import { assignLayer, marginNote, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, TABLE_STYLE, p } from "../../names-annual";
import { partitionByPage, removeRefs } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  SHEET_CMD,
  WORKBOOK_PANEL,
  enterCell,
  insetCells,
  placeElements,
  pourStyledCell,
  settleNewElements,
  treeElements,
  units,
  type El,
} from "./00-support";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKBOOK = pathResolve(
  __dirname,
  "..",
  "..",
  "..",
  "e2e",
  "harness",
  "sheet-02-formulas.xlsx",
);
/** `~/paged/plugins/plugin-sheets/registry/functions` — the sibling
 *  checkout. The roster degrades to a note when it is absent. */
const FN_REGISTRY = pathResolve(
  __dirname,
  ...Array(7).fill(".."),
  "plugins",
  "plugin-sheets",
  "registry",
  "functions",
);

interface Family {
  name: string;
  count: number;
  samples: string[];
}

/** Count implemented function rows per `family:` field — the same
 *  block-splitter discipline coverage.ts uses on the feature registry. */
function readFamilies(): Family[] | null {
  if (!existsSync(FN_REGISTRY)) return null;
  const byFamily = new Map<string, Family>();
  for (const file of readdirSync(FN_REGISTRY)) {
    if (!file.endsWith(".yaml")) continue;
    const text = readFileSync(join(FN_REGISTRY, file), "utf8");
    for (const block of text.split(/^- id:[ \t]*/m).slice(1)) {
      const name = /^\s+name:[ \t]*(\S+)/m.exec(block)?.[1];
      const family = /^\s+family:[ \t]*(\S+)/m.exec(block)?.[1];
      const implemented = /^\s+status:[ \t]*implemented/m.test(block);
      if (!name || !family || !implemented) continue;
      const fam = byFamily.get(family) ?? { name: family, count: 0, samples: [] };
      fam.count += 1;
      if (fam.samples.length < 3) fam.samples.push(name);
      byFamily.set(family, fam);
    }
  }
  return [...byFamily.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg99 = ctx.pageIds[0];
  const notes: string[] = [];
  const covers: string[] = [];
  const elements: string[] = [];

  const head = await proseFrame(ctx, p(99), [48, 96, 480, 124], [
    { text: "Formulas, spill, and the roster", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // ── import through the importXlsx COMMAND (host picker lane) ─────
  const chooser = page
    .waitForEvent("filechooser", { timeout: 120_000 })
    .catch(() => null);
  await doc.runCommand(`${SHEET_CMD}.importXlsx`);
  const fc = await chooser;
  if (fc) {
    await fc.setFiles(WORKBOOK);
  } else {
    notes.push(
      "the importXlsx command raised no host file chooser on this lane — " +
        "fell back to the panel's own picker",
    );
    const panelChooser = page.waitForEvent("filechooser");
    await page.locator("[data-sheet-pick]").click();
    await (await panelChooser).setFiles(WORKBOOK);
  }
  await expect(
    page.locator('[data-sheet-panel="workbook"]'),
    "the formula workbook parsed",
  ).toContainText("sheet-02-formulas.xlsx", { timeout: 30_000 });

  // ── the calc engine, through the formula bar ─────────────────────
  await doc.runCommand(`${SHEET_CMD}.openGrid`);
  const svg = page.locator("[data-grid-svg-root]");
  await expect(svg, "the grid panel rendered").toBeVisible({ timeout: 120_000 });

  // An aggregate, a text-family call, and a dynamic array that SPILLS
  // C3:C6 from one anchor. Each committed value is asserted in the
  // grid SVG — the engine's own formatted answer, not this spec's.
  await enterCell(page, 0, 2, "=SUM(A1:A2)+5");
  await expect(svg, "SUM computed").toContainText("10", { timeout: 8_000 });
  await enterCell(page, 1, 2, '=UPPER("paged")');
  await expect(svg, "UPPER computed").toContainText("PAGED", { timeout: 8_000 });
  await enterCell(page, 2, 2, "=SEQUENCE(4,1,10,10)");
  await expect(svg, "the array spilled to C6").toContainText("40", {
    timeout: 8_000,
  });
  covers.push(
    "sheet.calc.engine",
    "sheet.fn.library",
    "sheet.calc.spill",
    "sheet.format.engine",
  );

  // ── lower A1:C6 so the computed values are ON the page ───────────
  // The workbook panel shares a dock group with the grid panel —
  // re-activate its tab before touching its controls.
  await openPanel(page, WORKBOOK_PANEL);
  await page.locator("[data-sheet-range]").fill("A1:C6");
  const before = await treeElements(page);
  let fresh: El[] = [];
  await withActivePage(page, pg99, async () => {
    await page.locator("[data-sheet-lower]").click();
    fresh = await settleNewElements(page, before);
  });
  expect(fresh.length, "the computed range lowered onto this page").toBeGreaterThan(0);
  const { here, elsewhere } = await partitionByPage(page, fresh, pg99);
  if (elsewhere.length > 0) {
    await removeRefs(doc, elsewhere).catch(() => undefined);
    notes.push(`the lower strayed ${elsewhere.length} item(s); removed`);
  }
  await placeElements(doc, here, 1, 24, 126, notes);
  elements.push(...here.map((e) => e.id));
  covers.push("sheet.lower.page");

  const sideCaption = await proseFrame(ctx, p(99), [260, 150, 480, 268], [
    {
      text:
        "The lowered range prints RESULTS: the SUM as 5 and 10, the " +
        "concatenation as SumProduct, the uppercase call, and the spill " +
        "range 10–40 that four cells inherited from one anchor. The " +
        "formatted value is the value — the grid and the page share one " +
        "format engine, so what you audited live is what went to press.",
      style: STYLE.caption,
    },
  ]);
  elements.push(sideCaption.frameId);

  // ── the function-family roster, from the registry ────────────────
  const families = readFamilies();
  if (!families) {
    notes.push(
      `the plugin-sheets checkout is absent at ${FN_REGISTRY} — the roster ` +
        "table was not built on this run",
    );
  } else {
    const total = families.reduce((n, f) => n + f.count, 0);
    if (total !== 224) {
      notes.push(
        `the function registry counts ${total} implemented rows (the page ` +
          "prints its own count; 224 was the count when this chapter was written)",
      );
    }

    const box: [number, number, number, number] = [48, 288, 480, 620];
    const frameId = await doc.textFrame(pg99, box);
    await assignLayer(ctx, "textFrame", frameId, LAYER.content);
    const storyId = await doc.storyOf(pg99, box);
    const caption = "Table — the function library, by family, counted from the registry at build time.";
    await doc.insertText(storyId, caption, 0);
    await doc.applyStyle(
      storyId,
      0,
      [...caption].length,
      await doc.paragraphStyle(STYLE.caption),
      "paragraph",
    );

    // Created with NO bands, then given both through the band ops —
    // the proven Ch.12 recipe (band rows join beyond `rows`; the
    // header arrives at the top, the footer appends at the bottom).
    const created = await doc.mutate("insertTable", {
      storyId,
      rows: families.length,
      cols: 3,
      headerRows: 0,
      footerRows: 0,
      // The 25/12 rhythm: 136 ends on the unit-4 seam, 136+74 on the
      // unit-6 seam, and the measure closes at 432.
      columnWidths: [units(4), units(2) + 12, 432 - units(4) - units(2) - 12],
      rowHeights: families.map(() => 20),
    });
    const tableId = (() => {
      const id = created as { table_id?: unknown } | string | null;
      if (id && typeof id === "object" && typeof id.table_id === "string") {
        return id.table_id;
      }
      throw new Error(`insertTable minted no table id: ${JSON.stringify(created)}`);
    })();

    await doc.mutate("insertHeaderRow", { storyId, tableId });
    await doc.mutate("insertFooterRow", { storyId, tableId });
    await doc.mutate("setRowHeight", { storyId, tableId, row: 0, height: 22 });
    await doc.mutate("setRowHeight", {
      storyId,
      tableId,
      row: families.length + 1,
      height: 22,
    });

    const tableHead = await doc.paragraphStyle(STYLE.tableHead);
    const tableBody = await doc.paragraphStyle(STYLE.tableBody);
    const tableNumber = await doc.paragraphStyle(STYLE.tableNumber);

    for (const [c, label] of ["FAMILY", "FNS", "REPRESENTATIVE CALLS"].entries()) {
      await pourStyledCell(doc, storyId, tableId, 0, c, label, tableHead);
    }
    for (const [i, fam] of families.entries()) {
      const row = 1 + i;
      await pourStyledCell(doc, storyId, tableId, row, 0, fam.name, tableBody);
      await pourStyledCell(doc, storyId, tableId, row, 1, String(fam.count), tableNumber);
      await pourStyledCell(
        doc,
        storyId,
        tableId,
        row,
        2,
        fam.samples.join(" · "),
        tableBody,
      );
    }
    const footerRow = families.length + 1;
    await doc.mutate("setCellSpan", {
      storyId,
      tableId,
      row: footerRow,
      col: 0,
      rowSpan: 1,
      columnSpan: 3,
    });
    await pourStyledCell(
      doc,
      storyId,
      tableId,
      footerRow,
      0,
      `${total} functions across ${families.length} families — no row, no dispatch.`,
      tableBody,
    );

    const pad: Array<[number, number]> = [];
    for (let r = 0; r <= footerRow; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        if (r === footerRow && c > 0) continue; // merged away
        pad.push([r, c]);
      }
    }
    await insetCells(doc, storyId, tableId, pad);

    // The fixture's table style dresses the roster (banded fills,
    // hairlines) so the region cascade does the styling.
    const tableStyles = (await doc.designer.collection("tableStyles")) as Array<{
      selfId: string;
      name?: string;
    }>;
    const annualTable = tableStyles.find((t) => t.name === TABLE_STYLE);
    if (annualTable) {
      await doc.setProperty(
        "table",
        { story_id: storyId, table_id: tableId },
        "appliedTableStyle",
        { type: "text", value: annualTable.selfId },
      );
    } else {
      notes.push(`table style ${TABLE_STYLE} not found — roster left unstyled`);
    }
    elements.push(frameId);
  }

  elements.push(
    await marginNote(
      ctx,
      p(99),
      "Importing this workbook REPLACED the chart wall's workbook as the " +
        "container part: workbook persistence is a per-plugin singleton " +
        "(the LAST imported workbook travels), not per-frame. The chart " +
        "wall survives regardless — its charts are native art. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, p(99), [
      "Specimen No. 154",
      "importXlsx (command, host picker)",
      "=SUM · =UPPER · =SEQUENCE(4,1,10,10) spill",
      "lower A1:C6 — results on the page",
      "registry/functions/*.yaml roster",
    ]),
  );

  return { title: "Formulas, spill, and the roster", covers, elements, notes };
}
