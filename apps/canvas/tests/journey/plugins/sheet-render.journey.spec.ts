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

// Journey: paged.sheet RENDERED output — what a lowered spreadsheet puts on
// the PAGE, checked by value.
//
//   1. STATIC TABLE (HARD, value) — lowering A1:B3 places a native table
//      whose cells hold exactly the engine's values (2 / 3 / SUM = 5, and
//      the concatenation "SumProduct"), read from the exported document.
//      This used to be recorded as a finding ("blank on the published
//      engine until the paired core+bundle cell-pour fix ships"); that fix
//      shipped, and a pixel count could not tell a right table from a
//      wrong one anyway.
//   2. IN-FRAME GRID (HARD, pixels) — entering the K-1 modal session paints
//      the windowed grid through the C-1 sceneLayer. The sceneLayer is not
//      document content, so the snapshot is the only place it shows.
//   3. EDIT REACHES THE TABLE (HARD, value) — typing 4321 into A1 and
//      leaving the session refreshes the placed table: A1 4321 and the
//      dependent A3 = SUM(A1:A2) = 4324, everything else unchanged.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";
import {
  FORMULAS_A1_B3,
  MOD,
  elementScreenCenter,
  enterSheet,
  exitSheet,
  importAndLower,
  placedValues,
} from "./sheet-kit";

test.describe("journey · paged.sheet render output", () => {
  test("a lowered spreadsheet places the engine's values, renders its grid in-frame, and an in-frame edit reaches the placed table @feat:sheet.grid.inframe @feat:plugin-platform.modal-edit-session @feat:sheet.lower.page @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. NEGATIVE CONTROL — the blank page is render-stable. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. STATIC TABLE — the placed cells are the engine's values. ──
    const frame = await importAndLower(page, "A1:B3");
    expect(await placedValues(page)).toEqual(FORMULAS_A1_B3);
    await page.waitForTimeout(400);
    const afterLower = await designer.renderBytes();

    // ── 2. IN-FRAME GRID — the sceneLayer paints over the frame. ──
    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    const at = await elementScreenCenter(page, frame);
    await page.mouse.dblclick(at.x, at.y);
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);
    const gridPx = await designer.expectRenderChangesFrom(afterLower);
    expect(gridPx, "the in-frame grid sceneLayer rendered onto the page").toBeGreaterThan(64);
    await exitSheet(page);

    // ── 3. EDIT — A1 → 4321; leaving refreshes the placed table. ──
    await enterSheet(page, frame);
    await page.keyboard.press(`${MOD}+Home`);
    await page.keyboard.type("4321");
    await page.keyboard.press("Enter");
    await exitSheet(page);
    await expect
      .poll(() => placedValues(page), { timeout: 10_000 })
      .toEqual([
        ["4321", "Sum"],
        ["3", "Product"],
        ["4324", "SumProduct"],
      ]);
  });
});
