// W2.12 — Fonts panel acceptance. Real data from the `fonts`
// collection: the fonts-in-use list renders (non-empty for any text
// fixture), and the Missing tab filters on `FontSummary.isMissing`.
//
// The generated fixtures all reference installed families (Open Sans),
// so `isMissing` is false everywhere — the "missing font" path is
// fixme'd until a fixture (or a deregistered-font harness) carries an
// unresolved family.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/text.idml`;

test.describe("W2.12 — Fonts panel", () => {
  test("AC-FONTS-1 — fonts-in-use list renders non-empty", async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.fonts");
    await expect(page.locator('[data-fonts-panel="ready"]')).toBeVisible();
    const rows = page.locator("[data-font-list] [data-list-row]");
    await expect(rows).not.toHaveCount(0);
  });

  test("AC-FONTS-2 — Missing tab narrows to only unresolved families", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.fonts");
    await page.locator('[data-font-filter="Missing"]').click();
    await expect(page.locator('[data-font-filter="Missing"]')).toHaveAttribute(
      "data-active",
      "true",
    );
    // The Missing filter is real (FontSummary.isMissing). Whether it's
    // empty depends on the runner's font resolution: `loadIdml` only
    // registers a single fallback face, so a fixture that references a
    // DIFFERENT family (text.idml → "Open Sans") reads as substituted/
    // missing in the headless harness, while a CI host that resolves
    // the family reads it clean. Assert the FILTER INVARIANT, robust to
    // both: the tab shows either the empty-missing sentinel (0 missing)
    // or a list where every visible row carries the missing badge.
    const empty = page.locator("[data-fonts-missing-empty]");
    const rows = page.locator("[data-font-list] [data-list-row]");
    const badges = page.locator(
      '[data-font-list] [data-list-row] [data-row-badge="missing"]',
    );
    await expect
      .poll(async () => (await empty.count()) + (await rows.count()))
      .toBeGreaterThan(0);
    if ((await empty.count()) > 0) {
      await expect(empty).toBeVisible();
    } else {
      // Filtered list ⇒ every row is a missing family (badge present).
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
      await expect(badges).toHaveCount(rowCount);
    }
  });

  test.fixme("AC-FONTS-3 — a deliberately-missing family shows the missing badge + count", async ({
    page,
  }) => {
    // Genuinely deferred: this wants a fixture that carries an
    // unresolved family BY DESIGN (independent of the runner's font
    // set), to pin the red dot + [data-row-badge="missing"] +
    // [data-missing-count] deterministically. The harness's fallback-
    // face substitution (AC-FONTS-2) is incidental, not a fixture.
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.fonts");
    await expect(page.locator('[data-row-badge="missing"]')).toBeVisible();
  });
});
