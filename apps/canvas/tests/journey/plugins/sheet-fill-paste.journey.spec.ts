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

// Journey: paged.sheet FILL and PASTE, by keyboard, inside a placed frame —
// and the results reach the placed table.
//
// On sheet-02-formulas (A1=2, A2=3, A3=SUM(A1:A2), B = labels):
//   1. Cmd+Home, Shift+Down, Cmd+D fills A1 down into A2 — A2 becomes 2 and
//      A3 recalculates to 4. (Cmd+D is also the editor's Place; inside a
//      sheet the grid owns it.)
//   2. Select A1:A3, Cmd+C; go to B1, Cmd+V. Our own copy pastes INPUTS, so
//      B3 receives A3's formula re-addressed to its new column:
//      =SUM(B1:B2), which evaluates to 4 over the pasted 2s.
//   3. Leave the sheet: the placed table refreshes to the engine's values.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";
import {
  MOD,
  enterSheet,
  exitSheet,
  importAndLower,
  placedValues,
} from "./sheet-kit";

test.describe("journey · paged.sheet fill and paste", () => {
  test("fill down and a formula paste by keyboard reach the placed table @feat:sheet.edit.fill @feat:sheet.edit.clipboard @feat:sheet.grid.keyboard @level:gesture", async ({
    page,
    context,
  }) => {
    // The copy also offers the host clipboard a tabular payload.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const frame = await importAndLower(page, "A1:B3");
    expect(await placedValues(page)).toEqual([
      ["2", "Sum"],
      ["3", "Product"],
      ["5", "SumProduct"],
    ]);

    await enterSheet(page, frame, { withGrid: true });
    const cellRef = page.locator("[data-formula-cellref]");
    const formula = page.locator("[data-formula-input]");

    // ── 1. Fill down. ──
    await page.keyboard.press(`${MOD}+Home`);
    await expect(cellRef).toHaveText("A1");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press(`${MOD}+d`);
    await page.keyboard.press("ArrowDown");
    await expect(cellRef).toHaveText("A2");
    await expect(formula).toHaveValue("2");

    // ── 2. Copy A1:A3, paste at B1 — the formula moves with its column. ──
    await page.keyboard.press(`${MOD}+Home`);
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press(`${MOD}+c`);
    await page.keyboard.press(`${MOD}+Home`);
    await page.keyboard.press("ArrowRight");
    await expect(cellRef).toHaveText("B1");
    await page.keyboard.press(`${MOD}+v`);
    // The paste is asynchronous (it reads the clipboard) and selects what
    // it pasted when it lands; wait for B1 to change before moving on.
    await expect(formula).toHaveValue("2");
    await page.keyboard.press(`${MOD}+Home`);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(cellRef).toHaveText("B3");
    await expect(formula).toHaveValue("=SUM(B1:B2)");

    // ── 3. The placed table carries the engine's values. ──
    await exitSheet(page);
    await expect
      .poll(() => placedValues(page), { timeout: 10_000 })
      .toEqual([
        ["2", "2"],
        ["2", "2"],
        ["4", "4"],
      ]);
  });
});
