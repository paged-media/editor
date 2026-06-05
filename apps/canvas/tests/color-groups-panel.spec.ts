// SDK Phase 5 (v1 sweep) — ColorGroups panel acceptance.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Color Groups panel", () => {
  test("AC-CGROUPS-1 — panel mounts; lists groups or shows empty placeholder", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.color-groups");
    await expect(
      page.locator('[data-color-groups-panel="ready"]'),
    ).toBeVisible();
    const list = page.locator(
      '[data-color-groups-panel="ready"] [data-color-group-list]',
    );
    const empty = page.locator(
      '[data-color-groups-panel="ready"] [data-empty-color-groups]',
    );
    const listVisible = await list.isVisible();
    const emptyVisible = await empty.isVisible();
    expect(listVisible || emptyVisible).toBe(true);
  });

  test("AC-CGROUPS-2 — New group creates; delete removes (live ops)", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.color-groups");
    const rows = page.locator(
      '[data-color-groups-panel="ready"] [data-group-id]',
    );
    const before = await rows.count();
    // "+ New group" rides createColorGroup.
    await page.locator('[data-toolbar-btn="new-color-group"]').click();
    await expect.poll(() => rows.count()).toBe(before + 1);
    // Expanding the empty group shows the honest empty note.
    const newRow = rows.last();
    await newRow.locator("[data-group-toggle]").click();
    await expect(newRow.locator("[data-group-members]")).toBeVisible();
    // Delete rides deleteColorGroup (swatches stay).
    await newRow.locator("[data-group-delete]").click();
    await expect.poll(() => rows.count()).toBe(before);
  });
});
