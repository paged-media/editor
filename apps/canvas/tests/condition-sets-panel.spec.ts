// SDK Phase 5 (v1 sweep) — ConditionSets panel acceptance.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Condition Sets panel", () => {
  test("AC-CSETS-1 — panel mounts; lists sets or shows empty placeholder @feat:editor-shell.panels.conditions @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.condition-sets");
    await expect(
      page.locator('[data-condition-sets-panel="ready"]'),
    ).toBeVisible();
    const list = page.locator(
      '[data-condition-sets-panel="ready"] [data-condition-set-list]',
    );
    const empty = page.locator(
      '[data-condition-sets-panel="ready"] [data-empty-condition-sets]',
    );
    const listVisible = await list.isVisible();
    const emptyVisible = await empty.isVisible();
    expect(listVisible || emptyVisible).toBe(true);
  });
});
