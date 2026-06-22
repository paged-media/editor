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

// Journey: paged.sheet EDIT OPS through the panels — SORT RANGE + FIND &
// REPLACE (workbook panel) and COPY/PASTE (grid panel), each driven through
// the real panel controls and verified by the engine's reported outcome +
// the re-rendered grid (sheet.plugin.bundle command surface: sortRange,
// findReplace, copySelection, pasteSelection).
//
// The semantics are the engine's (Rust); the panels are thin glue. This
// journey drives each control a designer uses and asserts the engine's honest
// message / the grid re-render:
//   1. FIND (HARD) — find a label string; the panel reports ≥1 hit and lists
//      the hit cell.
//   2. REPLACE ALL (HARD) — replace it; the panel reports the replaced count
//      and the grid SVG now shows the replacement text (calc/format re-render).
//   3. SORT RANGE (HARD) — sort the selected range ascending; the panel
//      reports "Sorted." and the grid re-renders.
//   4. COPY / PASTE (best-effort) — copy a selected range, paste at another
//      anchor; the grid copy/paste buttons drive session.copySelection /
//      pasteAtSelection. The OS-clipboard backend may be unavailable headless,
//      so these collect rather than gate.

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const XLSX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/sheet-02-formulas.xlsx",
);

const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";
const GRID_PANEL = "media.paged.sheet.panel.grid";

// Grid SVG geometry — calibrated against the fixture (see sheet-grid-formula).
const GRID_X0 = 20;
const GRID_Y0 = 12;
const GRID_COL = 40;
const GRID_ROW = 18;

/** Import the xlsx through the workbook panel's K-5 picker and set a range
 *  (no lower needed for the edit ops — they act on the engine's model). */
async function importWorkbook(page: Page, range: string): Promise<void> {
  await openPanel(page, WORKBOOK_PANEL);
  const pick = page.locator("[data-sheet-pick]");
  await expect(pick).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await pick.click();
  await (await chooser).setFiles(XLSX_FIXTURE);
  const rangeInput = page.locator("[data-sheet-range]");
  await expect(rangeInput).toBeVisible({ timeout: 20_000 });
  await rangeInput.fill(range);
}

/** Click cell (row,col) in the grid panel SVG so the formula bar/selection
 *  binds (the copy/paste anchor). */
async function selectGridCell(page: Page, row: number, col: number): Promise<void> {
  const svg = page.locator("[data-grid-svg-root]");
  await expect(svg).toBeVisible({ timeout: 10_000 });
  const box = await svg.boundingBox();
  if (!box) throw new Error("grid SVG has no bounding box");
  await page.mouse.click(box.x + GRID_X0 + col * GRID_COL, box.y + GRID_Y0 + row * GRID_ROW);
}

test.describe("journey · paged.sheet edit ops", () => {
  test("a designer finds, replaces, sorts, and copy/pastes through the sheet panels @feat:sheet.plugin.bundle @feat:sheet.grid.inframe @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const collected: string[] = [];

    await importWorkbook(page, "A1:B3");

    // ── 1. FIND (HARD) — the fixture's B1 carries the label "Sum". Find it;
    //    the panel reports ≥1 hit and lists the hit cell button. ──
    await page.locator("[data-sheet-find-needle]").fill("Sum");
    await page.locator("[data-sheet-find]").click();
    const findMsg = page.locator("[data-sheet-find-msg]");
    await expect(findMsg).toBeVisible({ timeout: 8_000 });
    await expect(findMsg).not.toContainText("0 hits", { timeout: 8_000 });
    await expect(page.locator("[data-sheet-find-hits] [data-sheet-find-hit]").first()).toBeVisible({
      timeout: 8_000,
    });

    // ── 2. REPLACE ALL (HARD) — replace "Sum" with "Total"; the panel reports
    //    the replaced count and the grid SVG now renders "Total". ──
    await page.locator("[data-sheet-find-replacement]").fill("Total");
    await page.locator("[data-sheet-replace-all]").click();
    await expect(findMsg).toContainText("Replaced", { timeout: 8_000 });
    await openPanel(page, GRID_PANEL);
    await expect(page.locator("[data-grid-svg-root]")).toContainText("Total", {
      timeout: 10_000,
    });

    // ── 3. SORT RANGE (HARD) — sort the selected range A1:B3 on column 1
    //    descending; the panel reports the engine's outcome. (A formula range
    //    refuses with the engine's verbatim message — we sort a values column,
    //    so it succeeds.) ──
    await openPanel(page, WORKBOOK_PANEL);
    await page.locator("[data-sheet-range]").fill("A1:A2"); // the two numeric cells
    await page.locator("[data-sheet-sort-key]").fill("1");
    await page.locator("[data-sheet-sort-dir]").selectOption("desc");
    await page.locator("[data-sheet-sort]").click();
    const sortMsg = page.locator("[data-sheet-sort-msg]");
    await expect(sortMsg).toBeVisible({ timeout: 8_000 });
    // Either "Sorted." (success) or the engine's honest refusal message — both
    // prove the command drove through to the engine. We require a non-empty
    // outcome; a values column sorts.
    await expect(sortMsg).toContainText("Sorted", { timeout: 8_000 });

    // ── 4. COPY / PASTE (best-effort) — select a cell, copy via the grid
    //    copy button, select another, paste. The OS-clipboard backend may be
    //    unavailable headless; collect rather than gate. ──
    try {
      await openPanel(page, GRID_PANEL);
      await selectGridCell(page, 0, 0); // A1
      const copyBtn = page.locator("[data-grid-copy]");
      await expect(copyBtn).toBeEnabled({ timeout: 8_000 });
      await copyBtn.click();
      await page.waitForTimeout(200);
      await selectGridCell(page, 0, 2); // C1 (empty)
      const pasteBtn = page.locator("[data-grid-paste]");
      await expect(pasteBtn).toBeEnabled({ timeout: 8_000 });
      await pasteBtn.click();
      await page.waitForTimeout(300);
      // If the clipboard backend worked, C1 now mirrors A1's value (2). We
      // don't gate on it (headless clipboard is environment-dependent).
    } catch (err) {
      collected.push(`copy/paste drive: ${String(err).split("\n")[0]}`);
    }

    for (const note of collected) {
      test.info().annotations.push({ type: "render-finding", description: note });
      // eslint-disable-next-line no-console
      console.log(`[sheet-edit] finding: ${note}`);
    }
  });
});
