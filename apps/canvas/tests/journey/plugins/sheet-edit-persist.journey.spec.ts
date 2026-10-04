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

// Journey: a sheet EDIT survives save → reopen.
//
// A designer places A1:B3, enters the frame, types 10 into A1 and leaves.
// The placed table refreshes (A1 10, A3 = SUM(A1:A2) = 13). They save the
// document as .paged and open that file in a FRESH editor — a new browser
// context, so no per-browser cache (OPFS blob, session memory) can stand in
// for what the file itself carries.
//
//   1. The placed values survive the reopen (HARD).
//   2. The WORKBOOK survives it: the .paged carries the edited workbook as
//      its part (paged/media.paged.sheet/workbook.xlsx), and re-entering the
//      frame should show A1 = 10 in the grid.
//
// DEFECT (2): the reopened editor does not restore the workbook — entering
// the frame logs "showGridInFrame: no workbook / sheet" and the grid panel
// asks for an import, although the part is in the file. paged.sheet reads
// its part only when the bundle ACTIVATES (session.restore() in activate),
// which happens at app boot, before any document is opened. Plugin-only
// fix: restore lazily on entering a bound frame (or on a host document-open
// signal). Pinned with test.fail(): the day it is fixed this test turns
// red and the pin comes off.

import { expect, test, type Browser, type Page } from "@playwright/test";

import { fitFirstPage, openPanel } from "../../fidelity/canvas-driver";
import { zipEntryNames } from "../../e2e/harness/read-zip";
import { Designer } from "../driver/designer";
import {
  GRID_PANEL,
  MOD,
  enterSheet,
  exitSheet,
  exportPaged,
  importAndLower,
  placedValues,
  type ElementRef,
} from "./sheet-kit";

const EDITED = [
  ["10", "Sum"],
  ["3", "Product"],
  ["13", "SumProduct"],
];

/** Place, edit A1 → 10 in-frame, leave; returns the saved .paged bytes. */
async function editAndSave(page: Page): Promise<{ paged: Buffer; frame: ElementRef }> {
  const designer = new Designer(page);
  await designer.open();
  await designer.newDocument();
  const frame = await importAndLower(page, "A1:B3");
  await enterSheet(page, frame);
  await page.keyboard.press(`${MOD}+Home`);
  await page.keyboard.type("10");
  await page.keyboard.press("Enter");
  await exitSheet(page);
  await expect.poll(() => placedValues(page), { timeout: 10_000 }).toEqual(EDITED);
  const paged = await exportPaged(page);
  expect(zipEntryNames(paged), "the .paged carries the workbook part").toContain(
    "paged/media.paged.sheet/workbook.xlsx",
  );
  return { paged, frame };
}

/** Open `paged` through the file door of a brand-new editor. */
async function reopenFresh(browser: Browser, paged: Buffer): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await new Designer(page).open();
  await page.setInputFiles('input[type="file"]', {
    name: "sheet-edit-persist.paged",
    mimeType: "application/octet-stream",
    buffer: paged,
  });
  // The open is asynchronous; until the document lands an export throws.
  await expect
    .poll(() => placedValues(page).catch(() => []), { timeout: 20_000 })
    .not.toEqual([]);
  await fitFirstPage(page);
  return page;
}

test.describe("journey · paged.sheet edit persistence", () => {
  test("an in-frame edit survives save → reopen in a fresh editor (placed values) @feat:sheet.plugin.persistence @feat:sheet.lower.page @level:happy", async ({
    page,
    browser,
  }) => {
    const { paged } = await editAndSave(page);
    const reopened = await reopenFresh(browser, paged);
    expect(await placedValues(reopened)).toEqual(EDITED);
    await reopened.context().close();
  });

  test("the edited workbook itself is restored from the reopened .paged @feat:sheet.plugin.persistence @level:edge", async ({
    page,
    browser,
  }) => {
    test.info().annotations.push({
      type: "defect",
      description:
        "DEFECT: a reopened .paged does not restore the sheet workbook — paged.sheet " +
        "reads its container part only on bundle activation (app boot), before the " +
        "document is opened; entering the frame logs 'showGridInFrame: no workbook / sheet'",
    });
    test.fail();
    const { paged, frame } = await editAndSave(page);
    const reopened = await reopenFresh(browser, paged);
    try {
      await enterSheet(reopened, frame, { withGrid: true });
      await openPanel(reopened, GRID_PANEL);
      await reopened.keyboard.press(`${MOD}+Home`);
      await expect(reopened.locator("[data-formula-cellref]")).toHaveText("A1", {
        timeout: 10_000,
      });
      await expect(reopened.locator("[data-formula-input]")).toHaveValue("10");
    } finally {
      await reopened.context().close();
    }
  });
});
