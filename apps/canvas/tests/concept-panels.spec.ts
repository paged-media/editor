// Panel-gallery pass — the six CONCEPT panels (INDESIGN_PARITY.md:
// Table / Tabs / Glyphs / Bullets & Numbering + Object Export
// Options / Export Tagging). Each opens from the registry, renders
// its kit-shaped seam structure with the Concept (or Partial)
// badge + the Target footnote, and keeps every unbacked control
// disabled. Glyphs' live insertion is covered separately
// (glyphs-panel.spec.ts).

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

const CONCEPTS = [
  { id: "paged.table", ready: "table-panel", badge: "concept" },
  { id: "paged.tabs", ready: "tabs-panel", badge: "concept" },
  { id: "paged.glyphs", ready: "glyphs-panel", badge: "partial" },
  {
    id: "paged.bullets-numbering",
    ready: "bullets-panel",
    badge: "concept",
  },
  {
    id: "paged.object-export",
    ready: "object-export-panel",
    badge: "concept",
  },
  {
    id: "paged.export-tagging",
    ready: "export-tagging-panel",
    badge: "concept",
  },
];

test.describe("Panel gallery — concept panels", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  for (const c of CONCEPTS) {
    test(`AC-CONCEPT — ${c.id} opens with badge, target footnote and inert seams`, async ({
      page,
    }) => {
      await openPanel(page, c.id);
      const root = page.locator(`[data-${c.ready}="ready"]`);
      await expect(root).toBeVisible();
      // The honest badge + the Target footnote.
      await expect(
        root.locator(`[data-panel-status="${c.badge}"]`),
      ).toBeVisible();
      await expect(root.locator("[data-panel-target]")).toBeVisible();
      // Every seam control is present and DISABLED.
      const seams = root.locator("[data-seam]");
      await expect.poll(() => seams.count()).toBeGreaterThanOrEqual(2);
      const seamButtons = root.locator(
        "[data-seam] button, button[data-seam], [data-seam] input, [data-seam] select, select[data-seam], textarea[data-seam]",
      );
      const n = await seamButtons.count();
      for (let i = 0; i < n; i++) {
        await expect(seamButtons.nth(i)).toBeDisabled();
      }
    });
  }

  test("AC-CONCEPT-TABS — Object Export tab switcher is live local state", async ({
    page,
  }) => {
    await openPanel(page, "paged.object-export");
    const root = page.locator('[data-object-export-panel="ready"]');
    await expect(
      root.locator('[data-export-tab="Alt Text"][data-active="true"]'),
    ).toBeVisible();
    await root.locator('[data-export-tab="Tagged PDF"]').click();
    await expect(
      root.locator('[data-export-tab="Tagged PDF"][data-active="true"]'),
    ).toBeVisible();
    // The Tagged PDF fields render (Role select seam).
    await expect(root.locator("[data-seam]").first()).toBeVisible();
  });

  test("AC-CONCEPT-SCOPE — Export Tagging scope toggle swaps the mapping", async ({
    page,
  }) => {
    await openPanel(page, "paged.export-tagging");
    const root = page.locator('[data-export-tagging-panel="ready"]');
    await expect(root.locator("[data-tagging-preview]")).toContainText("<p");
    await root.locator('[data-scope="Character"]').click();
    await expect(root.locator("[data-tagging-preview]")).toContainText("<span");
  });
});
