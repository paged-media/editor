// SDK Phase 5 (named sweep) — Links panel acceptance.
//
// Read-only expert leaf. Validates the wire (documentCollection:
// links → useCollection → list render) end-to-end.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

test.describe("Phase 5 — Links panel", () => {
  test("AC-LINKS-1 — empty fixture renders the empty-links placeholder", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/geometry-groups.idml`);
    await openPanel(page, "paged.links");
    await expect(page.locator('[data-links-panel="ready"]')).toBeVisible();
    await expect(page.locator("[data-empty-links]")).toBeVisible();
  });

  test("AC-LINKS-2 — images fixture lists at least one link", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/images.idml`);
    await openPanel(page, "paged.links");
    await expect(page.locator('[data-links-panel="ready"]')).toBeVisible();
    const rows = page.locator("[data-link-list] [data-list-row]");
    await expect(rows).not.toHaveCount(0);
  });

  test.fixme("AC-LINKS-3 — resolved links carry no missing/lo-res badge", async ({
    page,
  }) => {
    // Genuinely deferred — same fixture gap as AC-LINKS-4/5. NO
    // generated fixture ships a placed image whose bytes RESOLVE:
    // `images.idml`'s placements point at external `file:` URIs
    // (`file:checker-128.png` and an absolute path into the archived
    // `~/idml/` monorepo) that don't exist, so every row reports
    // `status: "missing"` in any environment. The "all links ok →
    // no missing badge" assertion needs a fixture with embedded or
    // package-relative image bytes the renderer can decode (the
    // companion to the AC-LINKS-4 broken-link fixture). Until that
    // fixture lands, this positive case is unreachable.
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/images.idml`);
    await openPanel(page, "paged.links");
    await expect(page.locator('[data-links-panel="ready"]')).toBeVisible();
    await expect(
      page.locator("[data-link-list] [data-list-row]"),
    ).not.toHaveCount(0);
    // Healthy fixture → no `missing` badge anywhere in the list.
    await expect(page.locator('[data-row-badge="missing"]')).toHaveCount(0);
  });

  test.fixme("AC-LINKS-4 — a broken link shows the missing badge + error dot", async ({
    page,
  }) => {
    // No fixture ships a placed image whose bytes fail to resolve
    // (LinkSummary.status === "missing"). Needs a fixture with a
    // dangling image reference to exercise the red status dot and
    // the [data-row-badge="missing"] badge.
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/images.idml`);
    await openPanel(page, "paged.links");
    await expect(page.locator('[data-row-badge="missing"]')).toBeVisible();
  });

  test.fixme("AC-LINKS-5 — a low-res placement shows the lo-res badge + PPI", async ({
    page,
  }) => {
    // Synthetic fixtures omit the <Image EffectivePpi> attribute, so
    // LinkSummary.effectivePpi is null and the lo-res badge never
    // fires. Needs a fixture exported from InDesign with a placed
    // image scaled below 150 ppi.
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/images.idml`);
    await openPanel(page, "paged.links");
    await expect(page.locator('[data-row-badge="lo-res"]')).toBeVisible();
  });
});
