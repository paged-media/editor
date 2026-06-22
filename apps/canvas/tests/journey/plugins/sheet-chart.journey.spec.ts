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

// Journey: paged.sheet CHART ENGINE — lower a parsed chart to a paged.draw
// vector frame and assert the chart renders onto the page (sheet.chart.engine:
// the plotters-backed custom DrawingBackend → frozen ChartGeometry IR →
// native vector content via the core insertPath/insertLine/insertOval wire,
// §2.1 — paged.draw reached as a core surface, never a plugin).
//
// A designer imports a chart-bearing .xlsx, then invokes the "Lower chart to
// frame" command; the engine generates the geometry IR in Rust, the host-model
// translator turns it into native vector mutations, and the bundle drives the
// two-phase host writes (paths + label frames). This render-verifies that the
// lowered chart vector art reaches the PAGE pixels (HARD).
//
// The fixture sheet-09-chart.xlsx is the plugin-sheets corpus 09-chart.xlsx (a
// real chart part: xl/charts/chart1.xml + drawing1.xml).

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHART_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/sheet-09-chart.xlsx",
);

const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";
const LOWER_CHART_CMD = "media.paged.sheet.command.lowerChartToFrame";

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

/** Import the chart .xlsx through the workbook panel's K-5 picker; resolves
 *  once the loaded controls render (the engine booted + parsed). */
async function importWorkbook(page: Page): Promise<void> {
  await openPanel(page, WORKBOOK_PANEL);
  const pick = page.locator("[data-sheet-pick]");
  await expect(pick).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await pick.click();
  await (await chooser).setFiles(CHART_FIXTURE);
  const rangeInput = page.locator("[data-sheet-range]");
  await expect(rangeInput).toBeVisible({ timeout: 20_000 });
}

test.describe("journey · paged.sheet chart engine", () => {
  test("a designer lowers a parsed chart to a vector frame and it renders on the page @feat:sheet.chart.engine @feat:sheet.plugin.bundle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const collected: string[] = [];

    // ── 0. NEGATIVE CONTROL. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. IMPORT — the chart-bearing workbook. ──
    await importWorkbook(page);
    const beforeChart = await designer.renderBytes();
    const polysBefore = await designer.count("polygon");

    // ── 2. LOWER CHART — invoke the command; the engine generates the
    //    geometry IR (Rust) and the bundle drives native vector mutations
    //    (insertPath + label frames). New vector elements appear on the page. ──
    await invokeCommand(page, LOWER_CHART_CMD);

    // The chart lowers as paths (polygons in the model) — the count rises.
    let polysAfter = polysBefore;
    await expect
      .poll(
        async () => {
          polysAfter = await designer.count("polygon");
          return polysAfter;
        },
        { timeout: 12_000 },
      )
      .toBeGreaterThan(polysBefore);

    // ── 3. RENDER (HARD, pixels) — the lowered chart vector art reaches the
    //    page; the blank-before snapshot now carries the chart. ──
    await page.waitForTimeout(500);
    const afterChart = await designer.renderBytes();
    const chartPx = await designer.expectRenderChanged(beforeChart, afterChart);
    expect(chartPx, "the lowered chart vector art rendered onto the page").toBeGreaterThan(64);

    for (const note of collected) {
      test.info().annotations.push({ type: "render-finding", description: note });
      // eslint-disable-next-line no-console
      console.log(`[sheet-chart] finding: ${note}`);
    }
  });
});
