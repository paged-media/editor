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

// Export Center panel behaviour (audit 17082026 B8/B9 — this panel's
// registry row was green via the panel-sweep mount smoke; the
// existing cockpit-panels.spec drive is tagged to panel-rail, not to
// this feature). The panel's honest-or-live invariant: with a
// document loaded the built-in output targets render as 2 LIVE rows
// (PDF/X-4, page images) with a REAL readiness pill, 3 HONEST "soon"
// seams — and the primary action, the PDF row's Export…, opens the
// real ExportPdfDialog. Loaded through the file-input flow because
// the run path reads `useDocument().handle`.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

/** Load via the React file-input flow so `useDocument().handle`
 *  populates (same idiom as cockpit-panels.spec). */
async function loadViaInput(page: Page, fixture: string): Promise<void> {
  await page.setInputFiles('input[type="file"]', fixture);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
            .ready,
      ),
    )
    .toBe(true);
}

test.describe("Export Center panel", () => {
  test("AC-EXPCTR-1 — live/soon targets with a real readiness pill; the PDF row opens the real export dialog @feat:editor-shell.panels.export-center @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadViaInput(page, FIXTURE);
    await openPanel(page, "paged.export-center");
    await expect(page.locator("[data-export-center]")).toBeVisible();

    // Honest-or-live: 5 built-in targets — exactly 2 LIVE (pdf-x4 +
    // image), 3 visible "soon" seams (web / social / package).
    await expect(page.locator("[data-export-target]")).toHaveCount(5);
    await expect(
      page.locator("[data-export-target][data-export-live]"),
    ).toHaveCount(2);

    // The PDF readiness pill reads REAL document/working-space state
    // — one of the two live verdicts, never a placeholder.
    await expect(
      page.locator('[data-status-pill="readiness-pdf-x4"]'),
    ).toHaveText(/^(Ready · X-4|PDF 1\.7 — no output intent)$/);

    // With a document loaded, the loaded-state readout is live too.
    await expect(page.locator("[data-export-center]")).toContainText(
      "2 outputs available",
    );

    // Primary action: the PDF row's Export… opens the REAL
    // ExportPdfDialog (the full export→download loop is covered by
    // cockpit-panels.spec / export-family.spec).
    const pdfExport = page.locator(
      '[data-cockpit-action="export-center-pdf-x4"]',
    );
    await expect(pdfExport).toBeEnabled();
    await pdfExport.click();
    await expect(page.locator("[data-export-dialog]")).toBeVisible();
  });
});
