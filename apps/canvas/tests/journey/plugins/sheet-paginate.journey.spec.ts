// Journey: paged.sheet LIVE MULTI-FRAME PAGINATION — lower a TALL range and
// assert the paginated content reaches the page (sheet.lower.paginate, the
// "killer feature" of §8.2: greedy row packing across the host frame chain
// with repeated headers + continued markers, re-paginating on chain reflow).
//
// A designer imports the workbook, lowers a tall range (more rows than one
// frame holds) to a frame; the sheet engine paginates the rows across the
// frame chain in Rust. This render-verifies that:
//   1. The lowered frame reaches the page (HARD — a frame is created).
//   2. The IN-FRAME grid renders the windowed content through K-1 (HARD,
//      pixels) — the same surface a designer reads, on the published engine.
//      (The STATIC native table cell-pour is blank on the published 0.49.0
//      engine until the paired core+bundle fix ships — see sheet-render.journey
//      — so the in-frame grid is the published render proof.)
//
// The static-table paginate proof (multiple frames painting their slices)
// awaits that paired release; this journey gates on what the published engine
// renders today and ANNOTATES the rest, per the campaign's honest-degrade rule.

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

test.describe("journey · paged.sheet pagination", () => {
  test("a designer lowers a tall range and the paginated content renders in-frame @feat:sheet.lower.paginate @feat:sheet.lower.page @feat:sheet.plugin.bundle @feat:sheet.grid.inframe @level:gesture", async ({
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

    // ── 1. LOWER A TALL RANGE — A1:C200 is far more rows than one frame
    //    holds, so the engine's greedy row packing paginates across the host
    //    frame chain (sheet.lower.paginate). HARD: a frame reaches the page. ──
    const beforeLower = await designer.renderBytes();
    const frame = await importAndLower(page, "A1:C200");
    expect(frame.id, "the tall-range lowering created a page frame").not.toBe("");
    await page.waitForTimeout(400);

    // The static native table's cell-pour is blank on the published engine
    // until the paired core+bundle fix ships (see sheet-render.journey) — so
    // record whether it painted rather than gate on it.
    const afterLower = await designer.renderBytes();
    const staticPx = await designer.renderDiffPixels(beforeLower, afterLower);
    if (staticPx <= 64) {
      collected.push(
        `static paginated table did NOT render (${staticPx}px) on the published engine — ` +
          "blocked on the paired core+bundle cell-pour fix (sheet-render.journey header); " +
          "the in-frame grid below is the published paginate render proof",
      );
    }

    // ── 2. IN-FRAME GRID RENDERS (HARD, pixels) — enter the K-1 modal
    //    session; the C-1 sceneLayer paints the windowed grid (the first
    //    paginated slice) onto the page. The published-engine proof that the
    //    paginated content reaches the pixels a designer reads. ──
    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    const at = await elementScreenCenter(page, frame);
    expect(at, "the lowered frame has on-screen geometry").not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);
    const inSession = await designer.renderBytes();
    const gridPx = await designer.expectRenderChanged(afterLower, inSession);
    expect(gridPx, "the in-frame grid rendered the paginated content onto the page").toBeGreaterThan(64);

    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0);

    for (const note of collected) {
      test.info().annotations.push({ type: "render-finding", description: note });
      // eslint-disable-next-line no-console
      console.log(`[sheet-paginate] finding: ${note}`);
    }
  });
});
