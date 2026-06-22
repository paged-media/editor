/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

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
  test("AC-LINKS-1 — empty fixture renders the empty-links placeholder @feat:editor-shell.panels.links @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/geometry-groups.idml`);
    await openPanel(page, "paged.links");
    await expect(page.locator('[data-links-panel="ready"]')).toBeVisible();
    await expect(page.locator("[data-empty-links]")).toBeVisible();
  });

  test("AC-LINKS-2 — images fixture lists at least one link @feat:editor-shell.panels.links @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/images.idml`);
    await openPanel(page, "paged.links");
    await expect(page.locator('[data-links-panel="ready"]')).toBeVisible();
    const rows = page.locator("[data-link-list] [data-list-row]");
    await expect(rows).not.toHaveCount(0);
  });

  test("AC-LINKS-3 — resolved links carry no missing/lo-res badge @feat:editor-shell.panels.links @level:edge", async ({
    page,
  }) => {
    // W2.2 — `links-ok.idml` is the dedicated all-healthy control: two
    // inline-embedded placements that both resolve `status === "ok"` with
    // an effective PPI at/above the 150-ppi floor (300 + 220), so NO
    // `missing` and NO `lo-res` badge appears anywhere in the list
    // (verified on 0.35.1). `links-broken.idml` can't host this case — it
    // deliberately mixes broken + lo-res rows.
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/links-ok.idml`);
    await openPanel(page, "paged.links");
    await expect(page.locator('[data-links-panel="ready"]')).toBeVisible();
    await expect(
      page.locator("[data-link-list] [data-list-row]"),
    ).not.toHaveCount(0);
    // All-healthy fixture → no `missing` and no `lo-res` badge anywhere.
    await expect(page.locator('[data-row-badge="missing"]')).toHaveCount(0);
    await expect(page.locator('[data-row-badge="lo-res"]')).toHaveCount(0);
  });

  test("AC-LINKS-4 — a broken link shows the missing badge + error dot @feat:editor-shell.panels.links @level:edge", async ({
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

  test("AC-LINKS-5 — a low-res placement shows the lo-res badge + PPI @feat:editor-shell.panels.links @level:happy", async ({
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
