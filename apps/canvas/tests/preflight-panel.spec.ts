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

// W2.12 — Preflight panel acceptance. "Validate output" runs the REAL
// PDF export pipeline; the structured findings (PreflightFinding) ride
// the pdfExported reply and land in the shared findings store. The
// generated fixtures export cleanly ONCE THEIR FONTS ARE REGISTERED,
// so the live test asserts the clean path; the grouped-findings-with-
// page-jump path is fixme'd until a fixture raises a finding.
//
// That qualifier is load-bearing and was missing until protocol 62.
// This spec never registered a font, so `geometry-groups.idml` — which
// declares exactly one, Open Sans — was always rendered with the
// engine's catch-all default standing in for it. Nothing said so: the
// old resolver returned bytes and no provenance. Protocol 62's
// `resolve_font_traced` reports the substitution, the PDF pipeline
// promotes it to a `font_substituted` finding, and the "no findings"
// affordance correctly stopped appearing. The premise was wrong, not
// the engine — so the fix is to supply the face, which also means this
// test now exercises the clean path for a real reason.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, preloadFonts } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;
// The only family geometry-groups.idml applies. Registered so the
// export has the real face and reports no substitution.
const FIXTURE_FONTS = [
  { family: "Open Sans", ttfPath: `${REPO_ROOT}/corpus/fonts/OpenSans.ttf` },
];

async function openPreflight(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    (
      globalThis as unknown as { __canvas: { setMode: (m: string) => void } }
    ).__canvas.setMode("prepress");
  });
}

test.describe("W2.12 — Preflight panel", () => {
  test("AC-PREFLIGHT-1 — Validate output runs the real exporter and reports a state @feat:editor-shell.panels.preflight @feat:the-renderer.pdf-export @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    // BEFORE loadIdml, not after: RegisterFont seeds the worker's font
    // registry, which the model reads when it LOADS a document. (Its
    // neighbour RegisterColorProfile does sync the live model, so the
    // asymmetry is easy to walk into — registering after the load is
    // accepted, replied to, and has no effect on the open document.)
    await preloadFonts(page, FIXTURE_FONTS);
    await loadIdml(page, FIXTURE);
    await openPreflight(page);
    await expect(page.locator("[data-preflight-panel]")).toBeVisible();
    await page.locator('[data-cockpit-action="run-validation"]').click();
    // The validation state pill lands once the export round-trips.
    await expect(
      page.locator('[data-status-pill="validation-state"]'),
    ).toBeVisible({ timeout: 60_000 });
    // This fixture exports cleanly → the "no findings" affordance.
    await expect(page.locator("[data-preflight-clean]")).toBeVisible();
  });

  test("AC-PREFLIGHT-2 — findings group by severity and jump to their page @feat:editor-shell.panels.preflight @feat:the-renderer.pdf-export @level:happy", async ({
    page,
  }) => {
    // 0.35.2 punch-list fix: the PDF export pipeline now promotes the
    // build-time "unhealthy publication" diagnostics (overset, missing
    // font) to `PreflightFinding`s with a page index, so the Preflight
    // panel surfaces them as jump-targets. `preflight.idml` carries an
    // overset story + a "Phantom Display" missing font (it also powers
    // AC-FONTS-3), so exporting it raises at least one paged finding.
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/idml/generated/preflight.idml`);
    await openPreflight(page);
    await page.locator('[data-cockpit-action="run-validation"]').click();
    // The validation pill lands once the export round-trips.
    await expect(
      page.locator('[data-status-pill="validation-state"]'),
    ).toBeVisible({ timeout: 60_000 });
    const finding = page.locator("[data-preflight-finding][data-finding-page]");
    await expect(finding.first()).toBeVisible();
    await finding.first().click();
  });
});
