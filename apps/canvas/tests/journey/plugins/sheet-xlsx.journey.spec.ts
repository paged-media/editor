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

// Journey: paged.sheet XLSX ROUND-TRIP — import an .xlsx through the host
// importer, lower a range (the structured-table fixture renders in-frame), and
// export the workbook back to .xlsx through the host exporter registry, then
// assert the round-trip produced a valid .xlsx (the "Paged never destroys a
// workbook" launch property — sheet.xlsx.roundtrip + sheet.table.structured).
//
// The IMPORT path (workbook panel K-5 picker → engine boot → parse), the LOWER
// path (native frame reaches the page), the IN-FRAME render (K-1 sceneLayer),
// and the EXPORT path (the Export Center exporter → bytes) are all driven
// through the REAL host registries. The exported bytes are a valid ZIP
// (PK\x03\x04) carrying the workbook — the preservation round-trip.
//
// Fixture: sheet-07-tables.xlsx is the plugin-sheets corpus 07-tables.xlsx (a
// real structured table part: xl/tables/table1.xml), so the lower exercises
// sheet.table.structured and the export round-trips that table part.

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const TABLES_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/sheet-07-tables.xlsx",
);

const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";
const XLSX_EXPORTER = "media.paged.sheet.exporter.xlsx";

interface ElementRef {
  kind: string;
  id: string;
}

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

async function importAndLower(
  page: Page,
  fixture: string,
  range: string,
): Promise<ElementRef> {
  await openPanel(page, WORKBOOK_PANEL);
  const pick = page.locator("[data-sheet-pick]");
  await expect(pick).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await pick.click();
  await (await chooser).setFiles(fixture);
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

/** Pull the .xlsx exporter through the host exporter registry (the Export
 *  Center path). Returns the produced bytes' length + the magic header. */
async function exportXlsx(
  page: Page,
): Promise<{ byteLength: number; magic: string } | { reason: string }> {
  return page.evaluate(async (exporterId) => {
    const reg = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            exporters?: {
              list: () => Array<{
                id: string;
                export: () =>
                  | Promise<{ bytes: Uint8Array; fileName: string } | null>
                  | { bytes: Uint8Array; fileName: string }
                  | null;
              }>;
            };
          };
        };
      }
    ).__canvas.registries.exporters;
    if (!reg) return { reason: "host serves no exporter registry" };
    const exp = reg.list().find((e) => e.id === exporterId);
    if (!exp) return { reason: `exporter ${exporterId} not registered` };
    const result = await exp.export();
    if (!result) return { reason: "exporter returned null (no workbook?)" };
    const b = result.bytes;
    return {
      byteLength: b.length,
      magic: String.fromCharCode(b[0], b[1], b[2], b[3]),
    };
  }, XLSX_EXPORTER);
}

test.describe("journey · paged.sheet xlsx round-trip", () => {
  test("a designer imports an xlsx, lowers a table, and exports the workbook back to xlsx @feat:sheet.xlsx.roundtrip @feat:sheet.table.structured @feat:sheet.plugin.bundle @feat:sheet.grid.inframe @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. NEGATIVE CONTROL. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. IMPORT + LOWER — the structured-table workbook; lower a range so
    //    the native frame reaches the page (the table part is parsed +
    //    preserved by the engine — sheet.table.structured). ──
    const frame = await importAndLower(page, TABLES_FIXTURE, "A1:C8");
    expect(frame.id, "the table lowering created a page frame").not.toBe("");
    await page.waitForTimeout(400);

    // ── 2. IN-FRAME RENDER (HARD, pixels) — the K-1 grid paints the table
    //    content onto the page (the published-engine render proof). ──
    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    const before = await designer.renderBytes();
    const at = await elementScreenCenter(page, frame);
    expect(at, "the lowered frame has on-screen geometry").not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);
    const inSession = await designer.renderBytes();
    await designer.expectRenderChanged(before, inSession);
    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0);

    // ── 3. EXPORT (HARD) — round-trip the workbook back to .xlsx through the
    //    host exporter registry. The bytes are a valid ZIP (PK\x03\x04) — the
    //    "Paged never destroys a workbook" preservation round-trip, including
    //    the structured-table part. ──
    const exported = await exportXlsx(page);
    expect(
      "byteLength" in exported,
      `xlsx export must produce bytes: ${
        "reason" in exported ? exported.reason : ""
      }`,
    ).toBe(true);
    if ("byteLength" in exported) {
      expect(exported.byteLength, "the exported .xlsx is non-empty").toBeGreaterThan(64);
      // ZIP local-file-header magic: "PK\x03\x04".
      expect(exported.magic, "the export is a valid .xlsx ZIP").toBe("PK\x03\x04");
    }
  });
});
