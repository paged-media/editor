// SDK Phase 5 (v1 sweep) — Wave 1 structural collection panels.
//
// Smoke-test acceptance for Pages-list / Spreads / Master Pages /
// Cell Styles / Table Styles / Fonts. Each panel mounts and
// renders either its row list or its empty-collection
// placeholder — both prove the channel + accessor chain
// completes.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/text-advanced.idml`;

async function mountAndAssert(
  page: Page,
  panelId: string,
  readySelector: string,
  rowsSelector: string,
  emptySelector: string,
) {
  await openPanel(page, panelId);
  await expect(page.locator(readySelector)).toBeVisible();
  const list = page.locator(rowsSelector);
  const empty = page.locator(emptySelector);
  const listVisible = await list.isVisible();
  const emptyVisible = await empty.isVisible();
  expect(listVisible || emptyVisible).toBe(true);
}

test.describe("Phase 5 — Wave 1 structural panels", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-WAVE1-1 — Pages (list) panel mounts and lists pages", async ({
    page,
  }) => {
    await mountAndAssert(
      page,
      "paged.pages-list",
      '[data-pages-list-panel="ready"]',
      "[data-page-list]",
      "[data-empty-pages]",
    );
  });

  test("AC-WAVE1-1b — Pages list toolbar: New inserts, Delete removes the selected page", async ({
    page,
  }) => {
    await openPanel(page, "paged.pages-list");
    const rows = page.locator("[data-page-list] [data-list-row]");
    await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(1);
    const before = await rows.count();
    // New rides insertPage (after the document end with nothing
    // selected).
    await page.locator('[data-toolbar-btn="ui-plus"]').click();
    await expect.poll(() => rows.count()).toBe(before + 1);
    // Select the new last page, then Delete rides deletePage.
    await rows.last().click();
    await page.locator('[data-toolbar-btn="ui-x"]').click();
    await expect.poll(() => rows.count()).toBe(before);
    // Duplicate is an honest seam until its Operation ships.
    await expect(
      page.locator('[data-toolbar-btn="ui-component"]'),
    ).toBeDisabled();
  });

  test("AC-WAVE1-2 — Spreads panel mounts", async ({ page }) => {
    await mountAndAssert(
      page,
      "paged.spreads",
      '[data-spreads-panel="ready"]',
      "[data-spread-list]",
      "[data-empty-spreads]",
    );
  });

  test("AC-WAVE1-3 — Master Pages panel mounts", async ({ page }) => {
    await mountAndAssert(
      page,
      "paged.master-pages",
      '[data-master-pages-panel="ready"]',
      "[data-master-page-list]",
      "[data-empty-master-pages]",
    );
  });

  test("AC-WAVE1-4 — Cell Styles panel mounts", async ({ page }) => {
    await mountAndAssert(
      page,
      "paged.cell-styles",
      '[data-cell-styles-panel="ready"]',
      "[data-cell-style-list]",
      "[data-empty-cell-styles]",
    );
  });

  test("AC-WAVE1-5 — Table Styles panel mounts", async ({ page }) => {
    await mountAndAssert(
      page,
      "paged.table-styles",
      '[data-table-styles-panel="ready"]',
      "[data-table-style-list]",
      "[data-empty-table-styles]",
    );
  });

  test("AC-WAVE1-6 — Fonts panel mounts and lists fonts in use", async ({
    page,
  }) => {
    await mountAndAssert(
      page,
      "paged.fonts",
      '[data-fonts-panel="ready"]',
      "[data-font-list]",
      "[data-empty-fonts]",
    );
  });
});
