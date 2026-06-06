// W2.12 — Document Map acceptance. The spread tree + page-snapshot
// thumbnails are covered by the cockpit smoke; this spec exercises the
// W2.12 additions: the live page-meta readout and the real
// "Add section" insertSection op-sandwich (insert → chip appears →
// undo → chip gone).
//
// Loads through the REACT file-input path (not loadIdml's direct
// client call) so `useDocument().handle` is populated — the panel and
// the Add-section button both read it.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

async function loadFixtureReact(page: Page) {
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
            .ready,
      ),
    )
    .toBe(true);
  // Design mode mounts the Document Map in the left dock.
  await page.evaluate(() => {
    (
      globalThis as unknown as { __canvas: { setMode: (m: string) => void } }
    ).__canvas.setMode("design");
  });
}

async function undo(page: Page) {
  await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas;
    await c.client.undo();
  });
}

test.describe("W2.12 — Document Map", () => {
  test("AC-DOCMAP-1 — the spread tree + page-meta render", async ({ page }) => {
    await openCanvas(page);
    await loadFixtureReact(page);
    const panel = page.locator("[data-document-map-panel]");
    await expect(panel).toBeVisible();
    // At least one spread row, each carrying its range/meta line.
    await expect(
      panel.locator("[data-document-map-spread]").first(),
    ).toBeVisible();
    await expect(panel.locator("[data-spread-meta]").first()).toBeVisible();
  });

  test("AC-DOCMAP-2 — Add section inserts a section chip; undo removes it", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixtureReact(page);
    const panel = page.locator("[data-document-map-panel]");
    await expect(panel).toBeVisible();

    // The fixture ships no <Section> → no chips initially.
    await expect(panel.locator("[data-section-chip]")).toHaveCount(0);

    // Real insertSection mutation (v28) via the Add-section button.
    await panel.locator("[data-add-section]").click();

    // The sections collection refetches on mutationApplied → a chip
    // appears.
    await expect(panel.locator("[data-section-chip]")).not.toHaveCount(0);

    // Undo → the section is removed and the chip disappears.
    await undo(page);
    await expect(panel.locator("[data-section-chip]")).toHaveCount(0);
  });
});
