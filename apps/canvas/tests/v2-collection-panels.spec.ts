// SDK Phase 5 (v1 sweep) — five new collection panels smoke
// test. Articles / Hyperlinks / Bookmarks / Cross References /
// Index Topics. The generated fixtures don't ship any of these
// elements, so each panel exercises the empty-placeholder path
// — that's still enough to validate the channel + accessor +
// hook chain end-to-end.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

async function mountAndAssert(
  page: Page,
  panelId: string,
  readySelector: string,
  emptySelector: string,
) {
  await openPanel(page, panelId);
  await expect(page.locator(readySelector)).toBeVisible();
  await expect(page.locator(emptySelector)).toBeVisible();
}

test.describe("Phase 5 — five remaining collection panels", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-V2-1 — Articles @feat:editor-shell.panels.list-collections @level:happy", async ({ page }) => {
    await mountAndAssert(
      page,
      "paged.articles",
      '[data-articles-panel="ready"]',
      "[data-empty-articles]",
    );
  });

  test("AC-V2-2 — Hyperlinks @feat:editor-shell.panels.list-collections @level:happy", async ({ page }) => {
    await mountAndAssert(
      page,
      "paged.hyperlinks",
      '[data-hyperlinks-panel="ready"]',
      "[data-empty-hyperlinks]",
    );
  });

  test("AC-V2-3 — Bookmarks @feat:editor-shell.panels.list-collections @level:happy", async ({ page }) => {
    await mountAndAssert(
      page,
      "paged.bookmarks",
      '[data-bookmarks-panel="ready"]',
      "[data-empty-bookmarks]",
    );
  });

  test("AC-V2-4 — Cross References @feat:editor-shell.panels.list-collections @level:happy", async ({ page }) => {
    await mountAndAssert(
      page,
      "paged.cross-references",
      '[data-cross-references-panel="ready"]',
      "[data-empty-cross-references]",
    );
  });

  test("AC-V2-5 — Index @feat:editor-shell.panels.list-collections @level:happy", async ({ page }) => {
    await mountAndAssert(
      page,
      "paged.index",
      '[data-index-panel="ready"]',
      "[data-empty-index]",
    );
  });
});
