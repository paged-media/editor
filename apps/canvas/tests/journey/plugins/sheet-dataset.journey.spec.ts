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

// Journey: paged.sheet DATA-PROVIDER CONSUMER — the S-15 / D-09 cross-plugin
// flow: "Sheet from dataset" surfaces the datasets panel where a designer
// sources a fresh workbook from a governed dataset (sheet.data.consumer).
//
// The sheetFromDataset command opens the datasets panel (the consumer entry).
// In a STANDALONE editor with no paged.data provider wired, the panel shows
// its HONEST EMPTY STATE (§2.1 graceful absence: "install or enable
// paged.data, or no data-provider registry is wired") — and that IS the
// editor-surface under test: the command routes, the panel mounts, and the
// consumer UI is exercised + asserted. When a provider IS wired (the paired
// data-provider journey), the same panel lists datasets with a Source button.
//
// This journey drives the command + asserts the datasets panel + its honest
// state. The actual seed-from-dataset (sourceFromDataset) needs a live
// provider — best-effort: if datasets are present we source one and assert the
// sheet seeds; otherwise we assert the honest empty state. Either way the
// consumer surface is journey-covered.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";

const DATASETS_PANEL = "media.paged.sheet.panel.datasets";
const SHEET_FROM_DATASET_CMD = "media.paged.sheet.command.sheetFromDataset";

async function invokeCommand(page: Page, id: string): Promise<void> {
  await page.evaluate((cmdId) => {
    const cmd = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: {
              invoke?: (id: string) => Promise<void>;
              execute?: (id: string) => Promise<void>;
              run?: (id: string) => Promise<void>;
            };
          };
        };
      }
    ).__canvas.registries.commands;
    const fn = cmd.invoke ?? cmd.execute ?? cmd.run;
    return fn?.call(cmd, cmdId);
  }, id);
}

test.describe("journey · paged.sheet data-provider consumer", () => {
  test("a designer opens 'Sheet from dataset' and the datasets consumer panel surfaces @feat:sheet.data.consumer @feat:sheet.plugin.bundle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const collected: string[] = [];

    // ── 1. INVOKE — the "Sheet from dataset" command opens the datasets
    //    consumer panel (the menu/keyboard entry that surfaces the S-15 flow). ──
    await invokeCommand(page, SHEET_FROM_DATASET_CMD);

    // The datasets panel mounts (the consumer surface under test).
    const panel = page.locator("[data-sheet-panel='datasets']");
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // ── 2. DRIVE THE CONSUMER — either real datasets are wired (a provider is
    //    present: source one + assert the sheet seeds) or the honest empty
    //    state shows (§2.1 graceful absence). Both are the consumer surface. ──
    const datasetRows = page.locator("[data-dataset-row]");
    const count = await datasetRows.count();
    if (count > 0) {
      // A provider IS wired — source the first dataset; the session seeds a
      // fresh workbook from the resolved snapshot. Assert the source button
      // drives without error (the seed is the engine's, best-effort to read).
      const sourceBtn = datasetRows.first().locator("[data-dataset-source]");
      await expect(sourceBtn).toBeVisible();
      await sourceBtn.click();
      await page.waitForTimeout(500);
      // The row reflects the sourced state ("· sourced") — the consumer ran.
      await expect(datasetRows.first()).toContainText(/sourced|update available/, {
        timeout: 8_000,
      });
    } else {
      // No provider wired (standalone editor) — the honest empty state is the
      // consumer surface's §2.1 graceful absence. Asserting it proves the
      // command + panel drove; the seed path needs the paired data-provider
      // journey (which wires paged.data's provider).
      const empty = page.locator("[data-datasets-empty]");
      await expect(empty).toBeVisible({ timeout: 8_000 });
      await expect(empty).toContainText("paged.data");
      collected.push(
        "no data-provider registry wired in this standalone editor — the consumer " +
          "panel's honest empty state is asserted; the live seed-from-dataset path is " +
          "covered by the paired data-provider journey (S-15 / D-09)",
      );
    }

    // The honesty note about committed snapshots is always present (the §1.1
    // consumer contract surface).
    await expect(page.locator("[data-datasets-honesty]")).toBeVisible();

    // Re-open via the panel id too (the openGrid/openPanel door).
    await designer.openPanel(DATASETS_PANEL);
    await expect(panel).toBeVisible();

    for (const note of collected) {
      test.info().annotations.push({ type: "render-finding", description: note });
      // eslint-disable-next-line no-console
      console.log(`[sheet-dataset] finding: ${note}`);
    }
  });
});
