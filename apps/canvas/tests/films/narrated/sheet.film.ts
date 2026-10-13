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

// paged.sheet, the plugin film (ADR 224): the website's `films/sheet.yaml`.
// An Excel workbook comes in through File ▸ Open…, a range is placed on the
// page as a table, a price is changed in the Grid panel's formula bar and
// the placed table recalculates, the total's SUM is shown, and the workbook
// goes back out as .xlsx. Every step is asserted against the engine.
//
// Not filmed: placing the workbook's chart. The placed chart's title is cut
// short, its value labels fall outside the page and long category labels
// collide, so it is not shown until that is fixed.

import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { film, type Kit } from "../kit/film";
import { typeHuman } from "../kit/pointer";
import { hover, menu, press } from "../kit/ui";
import { placedValues, selectedElement } from "../../journey/plugins/sheet-kit";
import { readZipText } from "../../e2e/harness/read-zip";
import { cameraScale, screenPoint } from "../../e2e/harness/viewport";
import { openPanel } from "../../fidelity/canvas-driver";

const ASSETS = join(process.env.PAGED_MEDIA_ROOT ?? "", "assets");

/** The placed table, in page points (it lands at the page's top left). */
const TABLE: [number, number, number, number] = [6, 10, 300, 200];

/** Off camera: the view the film is shot at, the page's top left at about
 *  150 %, where the table lands, so it is drawn large rather than enlarged. */
async function frameTheTable(page: Page): Promise<void> {
  const run = (id: string) =>
    page.evaluate((cmd) => {
      const c = (globalThis as unknown as { __canvas: { registries: { commands: Record<string, (id: string) => unknown> } } }).__canvas.registries.commands;
      return (c.invoke ?? c.execute ?? c.run).call(c, cmd);
    }, id);
  for (let i = 0; i < 6 && (await cameraScale(page)) < 1.4; i++) {
    await run("paged.view.zoomIn");
    await page.waitForTimeout(250);
  }
  const target = { x: 400, y: 230 };
  for (let i = 0; i < 12; i++) {
    const o = await screenPoint(page, 0, 0);
    if (Math.abs(o.x - target.x) < 4 && Math.abs(o.y - target.y) < 4) return;
    await page.mouse.move(800, 500);
    await page.mouse.wheel(o.x - target.x, o.y - target.y);
    await page.waitForTimeout(250);
  }
  throw new Error("could not frame the page's top left");
}

/** Publication health's overset count, read off the panel. */
async function overset(page: Page): Promise<string> {
  return ((await page.locator("text=Overset stories").first().locator("..").textContent()) ?? "").replace(/\D+/g, "");
}

/** The placed table's version, from the sheet plugin's metadata on its
 *  frame: it changes when the page table is refreshed from the workbook.
 *  Cheap to poll, unlike reading the table out of an IDML export. */
async function placedTableHash(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    type Node = { pluginMetadata?: Array<{ key: string; value: string }>; children?: Node[] };
    const c = (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<{ output: string[] }> } } }).__canvas;
    const r = await c.client.executeScript("JSON.stringify(paged.tree())");
    let found: string | null = null;
    const visit = (n: Node) => {
      const m = n.pluginMetadata?.find((x) => x.key === "x-paged:media.paged.sheet");
      if (m && found === null) {
        const data = (JSON.parse(m.value) as { data?: { table?: { hash?: string } } }).data;
        found = data?.table?.hash ?? null;
      }
      for (const ch of n.children ?? []) visit(ch);
    };
    for (const root of JSON.parse(JSON.parse(r.output[0])) as Node[]) visit(root);
    return found;
  });
}

/** A grid cell, by the text it shows in the Grid panel. */
const gridCell = (page: Page, text: string) =>
  page.locator("[data-grid-svg-root] text").filter({ hasText: new RegExp(`^${text.replace(".", "\\.")}$`) }).first();

/** Type into a control-bar or formula field the way a person does: click
 *  it, select what is there, type the new value, press Enter. */
async function retype(k: Kit, field: ReturnType<Page["locator"]>, value: string): Promise<void> {
  await press(k, field);
  await k.page.keyboard.press("ControlOrMeta+a");
  await typeHuman(k.page, value, 11);
  await k.hold(200);
  await k.page.keyboard.press("Enter");
}

film("sheet", async (k) => {
  const { page, designer } = k;

  await k.setup(async () => {
    await designer.open();
    await designer.newDocument();
    // Boot the spreadsheet engine before the camera rolls: the first workbook
    // a session opens otherwise spends seconds starting it, on screen.
    await openPanel(page, "media.paged.sheet.panel.workbook");
    await page.locator("[data-sheet-new]").click();
    await expect(page.locator("[data-sheet-range]")).toBeVisible({ timeout: 30_000 });
    await designer.newDocument();
    await openPanel(page, "paged.properties");
    await frameTheTable(page);
    await k.key("v");
    await k.hold(800);
  });
  await k.roll();

  // ── Excel in: File ▸ Open… loads the workbook into the Workbook panel. ──
  await k.scene("open", async () => {
    await k.hold(300);
    const chooser = page.waitForEvent("filechooser");
    await menu(k, ["File", "Open…"]);
    k.chip("price-list.xlsx", "file");
    await (await chooser).setFiles(join(ASSETS, "price-list.xlsx"));
    await expect(page.locator('[data-sheet-panel="workbook"]')).toContainText("Imported price-list.xlsx", { timeout: 20_000 });
    await expect(page.locator("[data-sheet-range]")).toHaveValue("A1:D7");
  });

  // ── Placed as a table; the frame sized to show every row. ──
  await k.scene("place", async () => {
    await press(k, page.locator("[data-sheet-lower]"));
    await expect.poll(async () => (await selectedElement(page))?.kind ?? null, { timeout: 15_000 }).toBe("textFrame");
    await k.hold(900);
    // The frame lands shorter than its table; sized to fit, every row shows.
    await retype(k, page.locator('input[aria-label="Height (pt)"]').first(), "150");
    await expect.poll(() => overset(page), { timeout: 8_000 }).toBe("0");
    await k.hold(1200);
  });

  // ── The Grid panel, and the price to change. ──
  await k.scene("pick", async () => {
    k.unfocus();
    await press(k, page.getByText("Grid panel", { exact: true }).first());
    await expect(page.locator("[data-grid-svg-root]")).toBeVisible({ timeout: 10_000 });
    await k.hold(400);
    await press(k, gridCell(page, "3.50"));
    await expect(page.locator("[data-formula-cellref]").first()).toHaveText("C2");
    await expect(page.locator("[data-formula-input]")).toHaveValue("3.5");
  });

  // ── A new price, typed in the formula bar. The scene ends once the page
  //    table has caught up, so the next line speaks over the result. ──
  await k.scene("edit", async () => {
    const before = await placedTableHash(page);
    expect(before, "the placed frame carries the sheet binding").not.toBeNull();
    await retype(k, page.locator("[data-formula-input]"), "4.20");
    // Read off the grid panel and the frame's binding: the document check
    // (an IDML export) would stall the editor on camera, so it runs once,
    // at the end.
    await expect(gridCell(page, "168.00")).toBeVisible({ timeout: 10_000 });
    await expect(gridCell(page, "560.00")).toBeVisible();
    await expect.poll(() => placedTableHash(page), { timeout: 15_000, intervals: [250] }).not.toBe(before);
  });

  // ── The amount and the total, recalculated on the page. ──
  await k.scene("recalc", async () => {
    k.focus(TABLE, 1.4);
    await k.hold(2600);
  });

  // ── The total is a formula: SUM over the amounts. ──
  await k.scene("formula", async () => {
    k.unfocus();
    await press(k, gridCell(page, "560.00"));
    await expect(page.locator("[data-formula-cellref]").first()).toHaveText("D7");
    await expect(page.locator("[data-formula-input]")).toHaveValue("=SUM(D2:D6)");
    await hover(k, page.locator("[data-formula-input]"));
    await k.hold(1200);
  });

  // ── Excel out, from the export centre. ──
  await k.scene("export", async () => {
    await press(k, page.getByRole("button", { name: "Export", exact: true }).last());
    await k.hold(600);
    const download = page.waitForEvent("download");
    await press(k, page.locator('[data-plugin-export="media.paged.sheet.exporter.xlsx"]'));
    const file = await download;
    k.chip(`${file.suggestedFilename()} saved`, "save");
    const saved = join(k.dir, "exported.xlsx");
    await file.saveAs(saved);
    const sheet = readZipText(readFileSync(saved), "xl/worksheets/sheet1.xml") ?? "";
    expect(sheet, "the total is still a formula").toMatch(/<f>SUM\(D2:D6\)<\/f>/);
    expect(sheet, "the new price went out").toMatch(/<c r="C2"[^>]*>(?:<f>[^<]*<\/f>)?<v>4\.2<\/v>/);
    await k.hold(1000);
    // The table on the page carries the edit (the document itself, read
    // once, off the moments that matter).
    const rows = await placedValues(page);
    expect([rows[1]?.[2], rows[1]?.[3], rows[6]?.[3]]).toEqual(["4.20", "168.00", "560.00"]);
  });
});
