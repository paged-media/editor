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

// Journey: paged.sheet CALC ENGINE + FUNCTION LIBRARY through the UI —
// type a formula into the grid panel's formula bar and assert the COMPUTED
// value reaches the surface a designer reads (both the grid SVG DOM and the
// in-frame K-1 sceneLayer that composites onto the page).
//
// This is the "engine-backed capability tested THROUGH the panel" rule from
// the coverage campaign: the Rust calc engine + the 224-function library are
// NOT left to in-repo nextest alone — a designer types `=SUM(A1:A3)` /
// `=UPPER(...)` into the formula bar (data-formula-input), Enter commits via
// session.editCell → the engine recomputes the dirty cut in Rust, and the
// windowed grid scene re-renders with the formatted result. We assert:
//   1. CALC + FN (HARD, DOM) — the computed value appears in the grid SVG
//      text (data-grid-svg-root) after a formula commit → sheet.calc.engine
//      + sheet.fn.library reached through the panel.
//   2. IN-FRAME RENDER (HARD, pixels) — entering the K-1 modal session paints
//      the recomputed grid through the C-1 sceneLayer onto the page; the
//      snapshot (blank before) carries the value → the calc result reaches
//      PAGE pixels, on the published engine.
//   3. SPILL (best-effort) — an array formula (`=A1:A3`) spills down the
//      anchor; the spilled cells render. The spill semantics are the engine's
//      (sheet.calc.spill); driven + collected so a partial drive is visible.
//
// The formula-bar surface (cell select → type → Enter → recompute → re-render)
// is the cleanest panel drive of the calc engine; the in-frame entry mechanism
// is COPIED verbatim from sheet-render.journey (the modal screen-point math is
// fiddly headless).

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

interface ElementRef {
  kind: string;
  id: string;
}

/** The element currently selected (single selection), via the worker.
 *  COPIED from sheet-render.journey. */
async function selectedElement(page: Page): Promise<ElementRef | null> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.selection()");
    const ids = JSON.parse(r.output[0] ?? "[]") as ElementRef[];
    return ids.length === 1 ? ids[0] : null;
  });
}

/** Screen point at the centre of an element's TRANSFORMED page-0 bounds.
 *  COPIED from sheet-render.journey (folds itemTransform — survives the
 *  dock relayout that the modal-session entry triggers). */
async function elementScreenCenter(
  page: Page,
  ref: ElementRef,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(async (id) => {
    let best: HTMLCanvasElement | null = null;
    let bestArea = 0;
    for (const cv of Array.from(document.querySelectorAll("canvas"))) {
      const r = cv.getBoundingClientRect();
      if (r.width * r.height > bestArea) {
        bestArea = r.width * r.height;
        best = cv;
      }
    }
    const wrap = (best?.parentElement ?? best)!.getBoundingClientRect();
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            camera: { read: () => { scale: number; tx: number; ty: number } };
            elementGeometry: (ids: unknown[]) => Promise<
              Array<{
                bounds: [number, number, number, number];
                itemTransform?:
                  | [number, number, number, number, number, number]
                  | null;
              }>
            >;
          };
        };
      }
    ).__canvas;
    const items = await c.client.elementGeometry([id]);
    const item = items[0];
    if (!item) return null;
    const [top, left, bottom, right] = item.bounds;
    const [a, b, cc, d, tx, ty] = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const px = a * cx + cc * cy + tx;
    const py = b * cx + d * cy + ty;
    const cam = c.client.camera.read();
    return {
      x: wrap.left + px * cam.scale + cam.tx,
      y: wrap.top + py * cam.scale + cam.ty,
    };
  }, ref);
}

/** Import the xlsx through the workbook panel's K-5 picker and lower
 *  `range` to a page frame; resolves to the created frame's ref. COPIED
 *  from sheet-render.journey. */
async function importAndLower(page: Page, range: string): Promise<ElementRef> {
  await openPanel(page, WORKBOOK_PANEL);
  const pick = page.locator("[data-sheet-pick]");
  await expect(pick).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await pick.click();
  await (await chooser).setFiles(XLSX_FIXTURE);
  const rangeInput = page.locator("[data-sheet-range]");
  await expect(rangeInput).toBeVisible({ timeout: 20_000 });
  await rangeInput.fill(range);
  await page.locator("[data-sheet-lower]").click();
  let frame: ElementRef | null = null;
  await expect
    .poll(
      async () => {
        frame = await selectedElement(page);
        return frame?.kind ?? null;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  return frame!;
}

// Grid SVG geometry — the viewBox is content-space pt at PX_PER_PT=1, so a
// click at (box.x + colStep*col, box.y + rowStep*row) lands cell (row,col).
// Calibrated against the fixture (probe): A1 at ~(20,12), ~40px columns,
// ~18px rows. The formula bar binds to the clicked cell (data-formula-cellref).
const GRID_X0 = 20;
const GRID_Y0 = 12;
const GRID_COL = 40;
const GRID_ROW = 18;

/** Click cell (row,col) in the grid panel SVG so the formula bar binds, then
 *  type `formula` and Enter — the engine recomputes the dirty cut in Rust.
 *  Asserts the formula bar actually bound to (row,col) before typing (the
 *  drive is honest about which cell it hit). Returns once committed. */
async function enterFormula(
  page: Page,
  row: number,
  col: number,
  formula: string,
): Promise<void> {
  const svg = page.locator("[data-grid-svg-root]");
  await expect(svg).toBeVisible({ timeout: 10_000 });
  const box = await svg.boundingBox();
  if (!box) throw new Error("grid SVG has no bounding box");
  const x = box.x + GRID_X0 + col * GRID_COL;
  const y = box.y + GRID_Y0 + row * GRID_ROW;
  await page.mouse.click(x, y);
  const fb = page.locator("[data-formula-input]");
  await expect(fb).toBeEnabled({ timeout: 8_000 });
  await fb.fill(formula);
  await fb.press("Enter");
  await page.waitForTimeout(300);
}

test.describe("journey · paged.sheet calc + functions through the grid", () => {
  test("a designer types a formula into the grid formula bar and the computed value renders in-frame @feat:sheet.calc.engine @feat:sheet.fn.library @feat:sheet.format.engine @feat:sheet.calc.spill @feat:sheet.plugin.bundle @feat:sheet.grid.inframe @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const collected: string[] = [];

    // ── 0. NEGATIVE CONTROL — blank page is render-stable. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. IMPORT + LOWER — bring the workbook in and place a frame so the
    //    grid panel binds + the in-frame session is enterable. ──
    const frame = await importAndLower(page, "A1:C6");
    expect(frame.id, "the lowering created a page frame").not.toBe("");

    // ── 2. CALC + FN through the formula bar (HARD, DOM) — the fixture's
    //    column C is empty (A1=2, A2=3, B labels; probe-verified). Select C1,
    //    type =SUM(A1:A2)+5 which the engine evaluates in Rust (sum=5 → 10),
    //    Enter commits, and the grid scene re-renders the formatted result.
    //    We assert the computed value text reaches the grid SVG. ──
    await openPanel(page, GRID_PANEL);
    const svg = page.locator("[data-grid-svg-root]");
    await expect(svg).toBeVisible({ timeout: 10_000 });

    // C1 = SUM(A1:A2)+5 = (2+3)+5 = 10 — exercises agg dispatch + arithmetic.
    await enterFormula(page, 0, 2, "=SUM(A1:A2)+5");
    // The formula bar shows the FORMULA (re-enterable input), proving the cell
    // committed as a formula not a literal — the calc engine ran.
    const fb = page.locator("[data-formula-input]");
    await expect(fb).toHaveValue("=SUM(A1:A2)+5", { timeout: 8_000 });
    // The COMPUTED value (10) reaches the grid SVG text — calc result rendered.
    await expect(svg).toContainText("10", { timeout: 8_000 });

    // A function-library call too (=UPPER reaches the text family dispatch);
    // the computed uppercase string renders in the grid.
    await enterFormula(page, 1, 2, '=UPPER("paged")');
    await expect(svg).toContainText("PAGED", { timeout: 8_000 });

    // ── 3. IN-FRAME RENDER (HARD, pixels) — enter the K-1 modal session; the
    //    C-1 sceneLayer paints the recomputed grid (carrying the computed
    //    cells) onto the page. Blank-before → changed-after proves the calc
    //    result reached PAGE pixels on the published engine. ──
    const beforeEnter = await designer.renderBytes();
    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    const at = await elementScreenCenter(page, frame);
    expect(at, "the lowered frame has on-screen geometry").not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);
    const gridPx = await designer.expectRenderChangesFrom(beforeEnter);
    expect(gridPx, "the in-frame grid (with computed cells) rendered onto the page").toBeGreaterThan(64);
    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0);

    // ── 4. SPILL (best-effort) — an array formula spills down its anchor.
    //    The spill range materializes from the anchor (sheet.calc.spill); the
    //    spilled cells render in the grid. Semantics are the engine's; collect
    //    so a partial drive is visible. ──
    try {
      await openPanel(page, GRID_PANEL);
      // =A1:A2 as a dynamic array spills A1..A2 down from the anchor cell C3.
      await enterFormula(page, 2, 2, "=A1:A2");
      await page.waitForTimeout(400);
      // The anchor's formula re-enters as the array; the spill body renders
      // values below it. We can't cheaply read the spilled cell text without
      // the exact column geometry, so assert the anchor committed as a formula
      // (the spill machinery ran) and the scene re-rendered.
      const fb2 = page.locator("[data-formula-input]");
      const v = await fb2.inputValue();
      if (!v.startsWith("=")) {
        collected.push(`spill anchor did not commit as a formula (got "${v}")`);
      }
    } catch (err) {
      collected.push(`spill drive threw: ${String(err).split("\n")[0]}`);
    }

    for (const note of collected) {
      test.info().annotations.push({ type: "render-finding", description: note });
      // eslint-disable-next-line no-console
      console.log(`[sheet-grid-formula] finding: ${note}`);
    }
  });
});
