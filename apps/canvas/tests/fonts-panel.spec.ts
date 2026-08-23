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
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/text.idml`;

test.describe("W2.12 — Fonts panel", () => {
  test("AC-FONTS-1 — fonts-in-use list renders non-empty @feat:editor-shell.panels.fonts @feat:the-renderer.font-registry @level:edge", async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.fonts");
    await expect(page.locator('[data-fonts-panel="ready"]')).toBeVisible();
    const rows = page.locator("[data-font-list] [data-list-row]");
    await expect(rows).not.toHaveCount(0);
  });

  test("AC-FONTS-2 — Missing tab narrows to only unresolved families @feat:editor-shell.panels.fonts @level:edge", async ({
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

  test("AC-FONTS-3 — a deliberately-missing family shows the missing badge @feat:editor-shell.panels.fonts @level:edge", async ({
    page,
  }) => {
    // W2.2 — `preflight.idml` carries a run pinned to "Phantom Display",
    // a family no corpus font (and no harness registration) provides, so
    // `FontSummary.isMissing` is true BY DESIGN — independent of the
    // runner's font set (verified: the fonts collection reports
    // Phantom Display isMissing on 0.35.1). This pins the missing badge
    // deterministically (vs the incidental Open Sans substitution that
    // AC-FONTS-2 tolerates either way).
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/idml/generated/preflight.idml`);
    await openPanel(page, "paged.fonts");
    await expect(page.locator('[data-fonts-panel="ready"]')).toBeVisible();
    await expect(
      page.locator('[data-row-badge="missing"]').first(),
    ).toBeVisible();
  });
});
