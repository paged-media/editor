// E2E gesture suite — the BUILT-IN Ellipse tool (W2.6), driven through
// the REAL viewport exactly as a user would: pick the Ellipse from the
// "shape" slot flyout, drag on the canvas, release. Proves the chain
//   pointer events → packages/tools ellipse handler → ONE insertOval →
//   selection → undo
// end-to-end. Sibling of gesture-pen.spec.ts; the plan IDs are
// gestures.md DR-01 (drag creation), DR-02 (Shift → circle), DR-03
// (Alt → from centre).
//
// Every draw is an op-sandwich: draw → assert the committed model (an
// `oval` element with the expected page-local bounds) → undo → it's
// gone. Escape mid-drag is asserted to mutate NOTHING (INV-1).

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  dragMouse,
  loadViaReactPath,
  screenPoint,
  treeCount,
  treeIds,
} from "./harness/viewport";
import { elementPageRectPt, type ElementRef } from "./harness/fixtures";

/** Pick the Ellipse from the "shape" slot's flyout (right-click opens
 *  the flyout; the ellipse is a hidden member behind the Rectangle
 *  default). After the pick the slot face IS the ellipse. */
async function activateEllipse(page: Page): Promise<void> {
  // Open the flyout without activating the face tool (context menu).
  await page.locator('[data-tool-slot="shape"]').click({ button: "right" });
  await page
    .locator('[data-tool-flyout="shape"] [data-tool="paged.tool.ellipse"]')
    .click();
  await expect(
    page.locator(
      '[data-tool-slot="shape"][data-active="true"][data-tool="paged.tool.ellipse"]',
    ),
  ).toBeVisible();
}

/** Drag the Ellipse between two page-0-local pt points; resolve the
 *  fresh `oval` element it commits. Optional modifier held across the
 *  whole drag (Shift = circle, Alt = from centre). */
async function drawEllipse(
  page: Page,
  fromPt: [number, number],
  toPt: [number, number],
  mod?: "Shift" | "Alt",
): Promise<ElementRef> {
  const before = await treeIds(page, "oval");
  const seen = new Set(before.map((r) => r.id));
  const from = await screenPoint(page, fromPt[0], fromPt[1]);
  const to = await screenPoint(page, toPt[0], toPt[1]);
  if (mod) await page.keyboard.down(mod);
  await dragMouse(page, from, to);
  if (mod) await page.keyboard.up(mod);
  await expect
    .poll(() => treeCount(page, "oval"), { timeout: 5_000 })
    .toBe(before.length + 1);
  const after = await treeIds(page, "oval");
  const fresh = after.find((r) => !seen.has(r.id));
  expect(fresh, "the drag landed a new oval").toBeTruthy();
  return fresh!;
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas.client.undo();
  });
}

test.describe("gestures.md DR-01…DR-03 — built-in Ellipse tool", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadViaReactPath(page, "geometry");
  });

  test("DR-01 — drag commits ONE oval inscribed in the drag bounds; undo removes it @feat:editor-tools.draw.rectangle @feat:frames-paths.shape-tools @level:gesture", async ({
    page,
  }) => {
    const before = await treeCount(page, "oval");
    await activateEllipse(page);
    const ref = await drawEllipse(page, [120, 120], [260, 220]);

    // ONE element appeared (a single insertOval / undo step).
    await expect
      .poll(() => treeCount(page, "oval"), { timeout: 5_000 })
      .toBe(before + 1);

    // The oval's bounds inscribe the drag rect (normalized corners).
    const rect = (await elementPageRectPt(page, ref))!;
    expect(rect.left).toBeCloseTo(120, 0);
    expect(rect.top).toBeCloseTo(120, 0);
    expect(rect.right).toBeCloseTo(260, 0);
    expect(rect.bottom).toBeCloseTo(220, 0);

    // op-sandwich: one undo erases the oval.
    await undo(page);
    await expect.poll(() => treeCount(page, "oval")).toBe(before);
  });

  test("DR-01 — a negative (up-left) drag normalizes the bounds @feat:editor-tools.draw.rectangle @feat:frames-paths.shape-tools @level:gesture", async ({
    page,
  }) => {
    const before = await treeCount(page, "oval");
    await activateEllipse(page);
    // Drag from bottom-right to top-left — the committed bounds must
    // still be the normalized rectangle.
    const ref = await drawEllipse(page, [260, 220], [120, 120]);
    const rect = (await elementPageRectPt(page, ref))!;
    expect(rect.left, "negative drag normalized x").toBeCloseTo(120, 0);
    expect(rect.top, "negative drag normalized y").toBeCloseTo(120, 0);
    expect(rect.right).toBeCloseTo(260, 0);
    expect(rect.bottom).toBeCloseTo(220, 0);
    await undo(page);
    await expect.poll(() => treeCount(page, "oval")).toBe(before);
  });

  test("DR-02 — Shift constrains the bounds to a circle (square AABB) @feat:editor-tools.draw.rectangle @feat:frames-paths.shape-tools @level:happy", async ({
    page,
  }) => {
    const before = await treeCount(page, "oval");
    await activateEllipse(page);
    // A 140×100 drag: Shift should square it to the larger extent (140).
    const ref = await drawEllipse(page, [120, 120], [260, 220], "Shift");
    const rect = (await elementPageRectPt(page, ref))!;
    const w = rect.right - rect.left;
    const h = rect.bottom - rect.top;
    expect(
      Math.abs(w - h),
      "DR-02: Shift made the bounds square (a circle)",
    ).toBeLessThan(1.5);
    // The square anchors at the start corner and grows to the larger
    // extent (140), so the down-right corner extends past the pointer's y.
    expect(rect.left).toBeCloseTo(120, 0);
    expect(rect.top).toBeCloseTo(120, 0);
    expect(w, "square took the larger drag extent").toBeCloseTo(140, 0);
    await undo(page);
    await expect.poll(() => treeCount(page, "oval")).toBe(before);
  });

  test("DR-03 — Alt draws the ellipse from the centre @feat:editor-tools.draw.rectangle @feat:frames-paths.shape-tools @level:happy", async ({ page }) => {
    const before = await treeCount(page, "oval");
    await activateEllipse(page);
    // Start = centre at (180,160), drag to (260,220): the half-extents
    // are 80×60, mirrored to both sides → bounds (100,100)…(260,220).
    const ref = await drawEllipse(page, [180, 160], [260, 220], "Alt");
    const rect = (await elementPageRectPt(page, ref))!;
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    expect(cx, "DR-03: centre x = start point").toBeCloseTo(180, 0);
    expect(cy, "DR-03: centre y = start point").toBeCloseTo(160, 0);
    expect(rect.left).toBeCloseTo(100, 0);
    expect(rect.right).toBeCloseTo(260, 0);
    await undo(page);
    await expect.poll(() => treeCount(page, "oval")).toBe(before);
  });

  test("DR-01/INV-1 — Escape mid-drag creates nothing @feat:editor-tools.draw.rectangle @feat:frames-paths.shape-tools @level:gesture", async ({ page }) => {
    const before = await treeCount(page, "oval");
    await activateEllipse(page);
    const start = await screenPoint(page, 120, 120);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 80, start.y + 60, { steps: 5 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(
      await treeCount(page, "oval"),
      "Escape committed zero mutation",
    ).toBe(before);
  });

  test("DR-01 — a click with no drag commits nothing @feat:editor-tools.draw.rectangle @feat:frames-paths.shape-tools @level:gesture", async ({ page }) => {
    const before = await treeCount(page, "oval");
    await activateEllipse(page);
    const s = await screenPoint(page, 160, 160);
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.waitForTimeout(30);
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(
      await treeCount(page, "oval"),
      "a zero-size click is dropped, not committed",
    ).toBe(before);
  });
});
