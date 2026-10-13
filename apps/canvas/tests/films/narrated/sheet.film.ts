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
// the placed table recalculates, the total's SUM is shown, the workbook's
// chart is placed under the table as vector shapes, and the workbook goes
// back out as .xlsx. Every step is asserted against the engine.

import { expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { film, type Kit } from "../kit/film";
import { typeHuman } from "../kit/pointer";
import { hover, menu, press } from "../kit/ui";
import { parsePlacedTables, selectedElement } from "../../journey/plugins/sheet-kit";
import { readZipText, zipEntryNames } from "../../e2e/harness/read-zip";
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

/** The open document as IDML (in the page), read once at the end. */
async function exportIdml(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () =>
    Array.from(await (globalThis as unknown as { __canvas: { client: { exportIdml(): Promise<Uint8Array> } } }).__canvas.client.exportIdml()),
  );
  return Buffer.from(bytes);
}

/** Scroll the canvas with the wheel, in a few steps like a hand, until
 *  page point `y` sits at the top of the view. */
async function scrollPageTo(k: Kit, y: number): Promise<void> {
  const page = k.page;
  // The view's top edge: the largest canvas is the page view.
  const top = await page.evaluate(() => {
    let best = { area: 0, top: 0 };
    for (const cv of Array.from(document.querySelectorAll("canvas"))) {
      const r = cv.getBoundingClientRect();
      if (r.width * r.height > best.area) best = { area: r.width * r.height, top: r.top };
    }
    return best.top;
  });
  const want = top + 4 - y * (await cameraScale(page));
  for (let pass = 0; pass < 4; pass++) {
    const left = (await screenPoint(page, 0, 0)).y - want;
    if (Math.abs(left) < 3) return;
    const steps = Math.max(1, Math.round(Math.abs(left) / 30));
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, left / steps);
      await k.hold(60);
    }
    await k.hold(150);
  }
  if (Math.abs((await screenPoint(page, 0, 0)).y - want) >= 3) throw new Error(`could not scroll page y=${y} to the top of the view`);
}

/** The close-up on the chart, in page points: from the white space under
 *  the table to the chart's category labels, centred on the chart (it lands
 *  under the table, at its left). */
const CHART: [number, number, number, number] = [-5, 140, 421, 420];

/** Every page item in the document, as "kind:id". */
async function pageItems(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    type Node = { id?: { kind: string; id: string } | null; children?: Node[] };
    const c = (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<{ output: string[] }> } } }).__canvas;
    const r = await c.client.executeScript("JSON.stringify(paged.tree())");
    const out: string[] = [];
    const visit = (n: Node) => {
      if (n.id && n.id.kind !== "page" && n.id.kind !== "spread") out.push(`${n.id.kind}:${n.id.id}`);
      for (const ch of n.children ?? []) visit(ch);
    };
    for (const root of JSON.parse(JSON.parse(r.output[0])) as Node[]) visit(root);
    return out;
  });
}

interface ChartPart {
  ref: string;
  label: string;
  /** Page-space box: x0, y0, x1, y1. */
  box: [number, number, number, number];
  fill?: unknown;
  anchors?: number;
}

/** The items the chart placed (everything that is new since `before`),
 *  each with its box on the page. */
async function chartProbe(page: Page, before: string[]): Promise<{ page: [number, number] | null; parts: ChartPart[] }> {
  return page.evaluate(async (old) => {
    type Id = { kind: string; id: string };
    type Node = { id?: Id | null; label?: string; children?: Node[] };
    type Geo = { id: Id; bounds: [number, number, number, number]; itemTransform?: number[] | null };
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript(s: string): Promise<{ output: string[] }>;
            elementGeometry(ids: Id[]): Promise<Geo[]>;
            elementProperties(r: Id): Promise<{ entries: Array<{ path: string; value?: { value?: unknown } }> } | null>;
            pathAnchors(r: Id): Promise<{ anchors: unknown[] } | null>;
            collection(name: "pages"): Promise<Array<{ sizePt?: [number, number] }>>;
          };
        };
      }
    ).__canvas.client;
    const r = await c.executeScript("JSON.stringify(paged.tree())");
    const fresh: Array<{ id: Id; label: string }> = [];
    const visit = (n: Node) => {
      if (n.id && n.id.kind !== "page" && n.id.kind !== "spread" && !old.includes(`${n.id.kind}:${n.id.id}`)) {
        fresh.push({ id: n.id, label: n.label ?? "" });
      }
      for (const ch of n.children ?? []) visit(ch);
    };
    for (const root of JSON.parse(JSON.parse(r.output[0])) as Node[]) visit(root);
    const geo = await c.elementGeometry(fresh.map((f) => f.id));
    const parts = [];
    for (const f of fresh) {
      const g = geo.find((x) => x.id.kind === f.id.kind && x.id.id === f.id.id);
      let box: [number, number, number, number] = [NaN, NaN, NaN, NaN];
      if (g) {
        const [t, l, b, rr] = g.bounds;
        const m = g.itemTransform ?? [1, 0, 0, 1, 0, 0];
        const pts = [
          [l, t],
          [rr, t],
          [l, b],
          [rr, b],
        ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
        box = [
          Math.min(...pts.map((p) => p[0])),
          Math.min(...pts.map((p) => p[1])),
          Math.max(...pts.map((p) => p[0])),
          Math.max(...pts.map((p) => p[1])),
        ];
      }
      const part: Record<string, unknown> = { ref: `${f.id.kind}:${f.id.id}`, label: f.label, box };
      if (f.id.kind === "polygon") {
        const p = await c.elementProperties(f.id);
        part.fill = p?.entries.find((e) => e.path === "frameFillColor")?.value?.value;
        part.anchors = (await c.pathAnchors(f.id))?.anchors.length;
      }
      parts.push(part);
    }
    const pages = await c.collection("pages");
    const size = pages[0]?.sizePt ?? null;
    return { page: size, parts: parts as unknown as ChartPart[] };
  }, before);
}

/** A grid cell, by the text it shows in the Grid panel. */
const gridCell = (page: Page, text: string) =>
  page.locator("[data-grid-svg-root] text").filter({ hasText: new RegExp(`^${text.replace(".", "\\.")}$`) }).first();

/** Type into a control-bar or formula field the way a person does: click
 *  it, select what is there, type the new value, press Enter. */
async function retype(k: Kit, field: ReturnType<Page["locator"]>, value: string): Promise<void> {
  await press(k, field);
  await expect(field).toBeFocused();
  await k.page.keyboard.press("ControlOrMeta+a");
  await expect
    .poll(() =>
      field.evaluate((el) => {
        const i = el as HTMLInputElement;
        return i.selectionStart === 0 && i.selectionEnd === i.value.length;
      }),
    )
    .toBe(true);
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

  // ── The workbook's chart, placed from the Workbook panel's Charts list.
  //    It lands beside the selection, so the table is selected first. ──
  let before: string[] = [];
  let tableBottom = 0;
  await k.scene("chart", async () => {
    const table = await selectedElement(page);
    expect(table?.kind, "the table is still selected").toBe("textFrame");
    before = await pageItems(page);
    // The table's box, read the way the chart's parts are: it is the one
    // item the probe finds when every other item counts as old.
    tableBottom = (await chartProbe(page, before.filter((r) => r !== `textFrame:${table!.id}`))).parts[0].box[3];
    expect(tableBottom, "the table's bottom edge").toBeGreaterThan(100);
    await press(k, page.locator('[data-dock-tab="media.paged.sheet.panel.workbook"]'));
    const charts = page.locator('[data-sheet-section="charts"]');
    await press(k, charts.locator("summary"));
    await expect(page.locator("[data-sheet-chart-list]")).toContainText("Amount by item");
    await k.hold(300);
    await press(k, page.locator("[data-sheet-chart-lower]").first());
    await expect.poll(async () => (await pageItems(page)).length - before.length, { timeout: 15_000 }).toBeGreaterThan(5);
    // Click the pasteboard beside the page, so no selection chrome sits
    // over the chart.
    await k.hold(500);
    await k.pointer.click(await screenPoint(page, -16, 260), { targetWidth: 20 });
    await expect.poll(() => selectedElement(page)).toBeNull();
  });

  // ── On the page: the bars, axes and labels, as vector shapes and text
  //    frames under the table, inside the page, the labels apart and whole,
  //    the bars drawn from the edited figures. ──
  await k.scene("vectors", async () => {
    // The chart runs below the bottom of the view: a hand scrolls the page
    // up until the table's top and the chart's labels are both in view. It
    // scrolls beside the chart, so the cursor rests outside the close-up.
    await k.pointer.moveTo(await screenPoint(page, 520, 330), { targetWidth: 120 });
    await scrollPageTo(k, 18);
    await k.recamera();
    k.focus(CHART, 2.2);
    const probe = await chartProbe(page, before);
    writeFileSync(join(k.dir, "chart-probe.json"), JSON.stringify(probe, null, 2));
    const [pw, ph] = probe.page ?? [0, 0];
    const parts = probe.parts.filter((p) => !p.ref.startsWith("group:"));
    for (const p of parts) {
      const [x0, y0, x1, y1] = p.box;
      expect(x0 >= 0 && y0 >= 0 && x1 <= pw && y1 <= ph, `${p.ref} lies on the page`).toBe(true);
      expect(y0, `${p.ref} lies under the table`).toBeGreaterThan(tableBottom);
    }
    const bars = parts
      .filter((p) => p.ref.startsWith("polygon:") && typeof p.fill === "string" && p.fill !== "Swatch/None")
      .sort((a, b) => a.box[0] - b.box[0]);
    expect(bars, "one bar per item").toHaveLength(5);
    const height = (p: ChartPart) => p.box[3] - p.box[1];
    // Notebooks is 40 × 4.20 = 168 now, Markers 152: the edit made it the tallest.
    expect(height(bars[0]), "the Notebooks bar shows the new amount").toBeGreaterThan(height(bars[4]));
    expect(Math.max(...bars.map(height))).toBe(height(bars[0]));
    const baseline = Math.max(...bars.map((b) => b.box[3]));
    const categories = parts
      .filter((p) => p.ref.startsWith("textFrame:") && p.box[1] >= baseline - 1)
      .sort((a, b) => a.box[0] - b.box[0]);
    expect(categories, "a label under every bar").toHaveLength(5);
    for (let i = 1; i < categories.length; i++) {
      expect(categories[i].box[0], "the category labels do not collide").toBeGreaterThan(categories[i - 1].box[2]);
    }
    // A label cut short would be overset.
    await expect.poll(() => overset(page), { timeout: 8_000 }).toBe("0");
    await k.hold(2400);
  });

  // ── Excel out, from the export centre. ──
  await k.scene("export", async () => {
    k.unfocus();
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
    const idml = await exportIdml(page);
    const rows = parsePlacedTables(idml).tables[0]?.rows ?? [];
    expect([rows[1]?.[2], rows[1]?.[3], rows[6]?.[3]]).toEqual(["4.20", "168.00", "560.00"]);
    // The chart's labels are whole stories: the title is not cut short.
    const stories = zipEntryNames(idml)
      .filter((n) => n.startsWith("Stories/"))
      .map((n) => [...(readZipText(idml, n) ?? "").matchAll(/<Content>([^<]*)<\/Content>/g)].map((m) => m[1]).join(""));
    for (const label of ["Amount by item", "Notebooks", "Pencils", "Erasers", "Rulers", "Markers"]) {
      expect(stories, `the chart's "${label}" label`).toContain(label);
    }
  });
});
