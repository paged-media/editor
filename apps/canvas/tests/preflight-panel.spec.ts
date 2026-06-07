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
  test("AC-PREFLIGHT-1 — Validate output runs the real exporter and reports a state", async ({
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

  test.fixme("AC-PREFLIGHT-2 — findings group by severity and jump to their page", async ({
    page,
  }) => {
    // NOT fixture-shaped on 0.35.1 (W2.2 investigation). The PDF exporter
    // emits a `PreflightFinding` for exactly two cases:
    //   • `font_not_embeddable` — an fsType-locked font. The OFL corpus
    //     fonts (and the harness's registered faces) are all embeddable,
    //     so this never fires.
    //   • `image_missing_bytes` — an `<Image>` command that survives to
    //     the exporter with undecodable bytes. But `paged-renderer`
    //     decodes inline `<Contents>` at BUILD time, fails, and stamps the
    //     missing-image placeholder, so NO `<Image>` command reaches the
    //     exporter — verified: `preflight.idml` carries a deliberately
    //     undecodable image yet `exportPdf` returns zero findings.
    // The "unhealthy publication" signals (overset, missing-link,
    // missing-font) are build-time / model-level; surfacing them as
    // export-time findings with a page index is an ENGINE GAP. Flips the
    // day the export pipeline promotes those diagnostics to
    // `PreflightFinding`s (or a non-embeddable corpus font lands).
    // `preflight.idml` is staged as the host (overset + Phantom Display
    // missing font already round-trip; it powers AC-FONTS-3 today).
    await openCanvas(page);
    await loadIdml(page, `${REPO_ROOT}/corpus/generated/preflight.idml`);
    await openPreflight(page);
    await page.locator('[data-cockpit-action="run-validation"]').click();
    const finding = page.locator("[data-preflight-finding][data-finding-page]");
    await expect(finding.first()).toBeVisible();
    await finding.first().click();
  });
});
