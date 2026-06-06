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
    // STILL deferred (Aftercare-D). The assertion is "NO missing badge
    // ANYWHERE in the list", which needs an ALL-healthy fixture.
    // `images.idml`'s placements point at non-existent `file:` URIs so
    // every row is "missing"; the new `links-broken.idml` DOES ship a
    // resolved control (`links · ok · embedded`, inline PNG bytes), but
    // it deliberately also carries the two broken rows + a lo-res row, so
    // the document-wide "zero badges" assertion can't hold there either.
    // This positive case needs a dedicated all-ok embedded-image fixture.
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

  test("AC-LINKS-4 — a broken link shows the missing badge + error dot", async ({
    page,
  }) => {
    // Aftercare-D: `links-broken` ships two dangling image references
    // (missing-tif / missing-png) whose bytes resolve nowhere, so the
    // build classifies them LinkSummary.status === "missing" and the row
    // paints the [data-row-badge="missing"] badge.
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/links-broken.idml`);
    await openPanel(page, "paged.links");
    await expect(page.locator('[data-links-panel="ready"]')).toBeVisible();
    await expect(
      page.locator('[data-row-badge="missing"]').first(),
    ).toBeVisible();
  });

  test("AC-LINKS-5 — a low-res placement shows the lo-res badge + PPI", async ({
    page,
  }) => {
    // Aftercare-D: `links-broken`'s `links · ppi · low-res` row embeds a
    // 2×2 px PNG in a large frame declaring EffectivePpi="(96 96)" — it
    // resolves "ok" but its 96 ppi is below the 150-ppi preflight floor,
    // so the row gets the [data-row-badge="lo-res"] badge (missing wins
    // over lo-res, so this row must be the resolved-but-low one).
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/links-broken.idml`);
    await openPanel(page, "paged.links");
    await expect(page.locator('[data-links-panel="ready"]')).toBeVisible();
    await expect(
      page.locator('[data-row-badge="lo-res"]').first(),
    ).toBeVisible();
    // The PPI is surfaced in the row meta (e.g. "96 ppi").
    await expect(
      page.locator("[data-link-list]").getByText(/\b96 ppi\b/),
    ).toBeVisible();
  });
});
