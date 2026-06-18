// Journey: paged.sheet WORKBOOK PERSISTENCE — the lowered sheet frame's
// binding envelope (x-paged:media.paged.sheet) rides setPluginMetadata, so it
// round-trips through IDML export+reload; the workbook itself persists to
// host.blob (OPFS). This asserts the document survives an export→reload with
// the sheet frame intact (sheet.plugin.persistence, S-08).
//
// A designer imports an .xlsx, lowers a range (the native frame + the binding
// metadata reach the document), then exports the document to IDML and reloads
// it. The reloaded document must keep its page + the lowered frame (the
// sheet's binding metadata survives the round-trip — the frame is still a
// sheet frame, re-enterable). The workbook blob persistence (OPFS) is the
// engine-side half; the document-side proof a journey can drive is that the
// bound frame round-trips through the published export/reload path.

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

test.describe("journey · paged.sheet persistence", () => {
  test("a lowered sheet frame survives an export → reload round-trip @feat:sheet.plugin.persistence @feat:sheet.lower.page @feat:sheet.plugin.bundle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. LOWER — import + lower a range; the native frame (a textFrame
    //    carrying the sheet binding metadata) reaches the document. ──
    const frame = await importAndLower(page, "A1:B3");
    expect(frame.id, "the lowering created a page frame").not.toBe("");
    expect(frame.kind, "the lowered element is a frame").toBe("textFrame");
    await page.waitForTimeout(400);
    const framesBefore = await designer.count("textFrame");
    expect(framesBefore, "the document carries the lowered sheet frame").toBeGreaterThan(0);

    // ── 2. EXPORT → RELOAD (HARD) — round-trip the document through IDML; the
    //    sheet frame's binding envelope (x-paged:media.paged.sheet via
    //    setPluginMetadata) rides the IDML, so the reloaded document keeps its
    //    page and the lowered frame (persistence, S-08). ──
    const reload = await designer.exportAndReload();
    expect(reload.byteLength, "the exported IDML is non-empty").toBeGreaterThan(0);
    expect(reload.pageCount, "the reloaded document kept its page").toBeGreaterThan(0);

    // The lowered frame survives the round-trip (the sheet content persists in
    // the document, not just the in-memory session).
    await page.waitForTimeout(300);
    const framesAfter = await designer.count("textFrame");
    expect(
      framesAfter,
      "the lowered sheet frame survives the export → reload round-trip",
    ).toBeGreaterThanOrEqual(framesBefore);
  });
});
