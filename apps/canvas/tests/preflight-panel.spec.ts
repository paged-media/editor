// W2.12 — Preflight panel acceptance. "Validate output" runs the REAL
// PDF export pipeline; the structured findings (PreflightFinding) ride
// the pdfExported reply and land in the shared findings store. The
// generated fixtures export cleanly (installed fonts, resolvable
// images), so the live test asserts the clean path; the grouped-
// findings-with-page-jump path is fixme'd until a fixture raises a
// finding.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

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
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/preflight.idml`);
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
