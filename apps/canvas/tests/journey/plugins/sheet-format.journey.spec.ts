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

// Journey: paged.sheet FORMATTING reaches the page — bold and a fill set on
// cells inside the sheet land on the PLACED native table, not just on the
// in-frame grid.
//
// A designer enters the lowered frame, selects A1:B1 with the keyboard,
// presses B and Fill in the workbook panel's Format section, and leaves the
// sheet. Leaving refreshes the placed table from the engine's styled range
// door, so the exported document must carry:
//   · the yellow fill on both header cells (a minted RGB swatch), and only
//     there;
//   · a bold character style on their text runs, and only there;
//   · the values unchanged.

import { expect, test } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";
import {
  FORMULAS_A1_B3,
  MOD,
  WORKBOOK_PANEL,
  cellFill,
  cellIsBold,
  enterSheet,
  exitSheet,
  importAndLower,
  placedTables,
} from "./sheet-kit";

test.describe("journey · paged.sheet cell formatting", () => {
  test("bold and a fill set inside the sheet reach the placed table @feat:sheet.format.cell-style @feat:sheet.lower.page @feat:sheet.grid.keyboard @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const frame = await importAndLower(page, "A1:B3");
    const before = await placedTables(page);
    expect(before.tables, "the lowering placed one table").toHaveLength(1);
    expect(before.tables[0].rows).toEqual(FORMULAS_A1_B3);
    // Negative control: nothing is filled or bold before the edit.
    expect(cellFill(before, before.tables[0], 0, 0)).toBeNull();
    expect(cellIsBold(before, before.tables[0], 0, 0)).toBe(false);

    // ── Select A1:B1 in the frame, then format it from the panel. ──
    await enterSheet(page, frame);
    await page.keyboard.press(`${MOD}+Home`);
    await page.keyboard.press("Shift+ArrowRight");
    await openPanel(page, WORKBOOK_PANEL);
    const section = page.locator("[data-sheet-format-section]");
    await expect(section).toContainText("A1:B1");
    await page.locator("[data-sheet-fmt-bold]").click();
    await page.locator("[data-sheet-fmt-fill]").fill("#ffff00");
    await page.locator("[data-sheet-fmt-fill-apply]").click();
    await expect(section).toContainText("bold");
    await expect(section).toContainText(/fill #FFFF00/i);
    await exitSheet(page);

    // ── The placed table carries both, on exactly the selected cells. ──
    await expect
      .poll(async () => {
        const doc = await placedTables(page);
        return doc.tables[0] ? cellFill(doc, doc.tables[0], 0, 0) : null;
      }, { timeout: 10_000 })
      .toBe("255 255 0");
    const after = await placedTables(page);
    expect(after.tables).toHaveLength(1);
    const t = after.tables[0];
    expect(t.rows, "formatting did not change a value").toEqual(FORMULAS_A1_B3);
    expect(cellFill(after, t, 0, 1), "B1 is filled too").toBe("255 255 0");
    expect(cellFill(after, t, 1, 0), "A2 was not selected").toBeNull();
    expect(cellIsBold(after, t, 0, 0), "A1 is bold").toBe(true);
    expect(cellIsBold(after, t, 0, 1), "B1 is bold").toBe(true);
    expect(cellIsBold(after, t, 1, 0), "A2 was not selected").toBe(false);
  });
});
