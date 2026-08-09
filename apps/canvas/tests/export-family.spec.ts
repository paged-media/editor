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

// W2.6 (Full-Green) — the EXPORT panel family is honest-or-live.
//
// One describe per panel in the family:
//   • Export Center  — the centred output table (canvas main).
//   • Outputs        — the left target nav.
//   • Export settings — the right per-target inspector.
//   • Output readiness — the Prepress right inspector (preflight-style).
//
// LIVE rows must do their REAL thing — a download with bytes
// (PDF / PNG page images / IDML) or a readiness verdict that reflects
// the actual document state. HONEST rows must show the visible,
// disabled "soon" seam. Every assertion rides the published client
// surface (`exportPdf`, `requestSnapshot`, `exportIdml`) + the W0.6
// wire summaries (fonts / links collections), not a mock.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const CLEAN = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;
const BROKEN_LINKS = `${REPO_ROOT}/corpus/generated/links-broken.idml`;

// Load through the FILE INPUT (not the driver's `loadIdml`, which
// bypasses the React onChange path) so the DocumentContext `handle`
// is populated — the export actions read `useDocument().handle` for
// the page list, and the PDF dialog gates on it.
async function loadDoc(page: Page, path = CLEAN) {
  await page.setInputFiles('input[type="file"]', path);
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

async function setMode(page: Page, mode: string) {
  await page.evaluate((m) => {
    (
      globalThis as unknown as { __canvas: { setMode: (m: string) => void } }
    ).__canvas.setMode(m);
  }, mode);
}

// ─────────────────────────────────────────────────────────────────
// Export Center — the centred readiness table (canvas main view).
// ─────────────────────────────────────────────────────────────────
test.describe("Export family — Export Center", () => {
  test("five rows: two LIVE (PDF/image), three HONEST seams @feat:editor-shell.panels.outputs @feat:plugin-platform.importer-exporter @feat:the-renderer.export-diagnostics @feat:the-renderer.pdf-export-marks @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadDoc(page, CLEAN);
    await setMode(page, "export");

    const center = page.locator("[data-export-center]");
    await expect(center).toBeVisible();

    // The honest-or-live invariant: every row is one or the other.
    // (IDML is no longer a built-in target — it's the paged.publish plugin
    // exporter now, ADR-022 Phase 5 — so the static grid is five rows/two LIVE.)
    await expect(page.locator("[data-export-target]")).toHaveCount(5);
    await expect(
      page.locator("[data-export-target][data-export-live]"),
    ).toHaveCount(2);
    // LIVE rows carry a real Export button; HONEST rows carry "soon".
    await expect(
      page.locator('[data-cockpit-action="export-center-pdf-x4"]'),
    ).toBeEnabled();
    await expect(
      page.locator('[data-cockpit-action="export-center-image"]'),
    ).toBeEnabled();
    // The web/social/package seams: no action button, a "soon" pill.
    await expect(
      page.locator('[data-export-target="web"]').getByText("soon"),
    ).toBeVisible();
    await expect(
      page.locator('[data-export-target="web"] [data-cockpit-action]'),
    ).toHaveCount(0);

    await setMode(page, "design");
  });

  test("LIVE — the PDF row opens the real dialog and downloads a .pdf @feat:editor-shell.panels.outputs @feat:plugin-platform.importer-exporter @feat:the-renderer.export-diagnostics @feat:the-renderer.pdf-export-marks @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadDoc(page, CLEAN);
    await setMode(page, "export");

    await page.locator('[data-cockpit-action="export-center-pdf-x4"]').click();
    await expect(page.locator("[data-export-dialog]")).toBeVisible();
    await page.locator("[data-export-standard]").selectOption("pdf17");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-export-confirm]").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    await setMode(page, "design");
  });

  // TODO(ADR-022 Phase 5): IDML is now the paged.publish plugin exporter, not a
  // built-in export-center row. Rewrite against the plugin-export flow (click
  // `[data-plugin-export="media.paged.publish.exporter.idml"]` in the Outputs
  // panel's "Plugin exports" section, assert the `.idml` download) — needs the
  // plugin bundle loaded at runtime.
  test.skip("LIVE — the IDML row downloads a real .idml package @feat:editor-shell.panels.outputs @feat:plugin-platform.importer-exporter @feat:the-renderer.export-diagnostics @feat:the-renderer.pdf-export-marks @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadDoc(page, CLEAN);
    await setMode(page, "export");

    const downloadPromise = page.waitForEvent("download");
    await page
      .locator('[data-plugin-export="media.paged.publish.exporter.idml"]')
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.idml$/);

    await setMode(page, "design");
  });
});

// ─────────────────────────────────────────────────────────────────
// Outputs — the left target nav (status dots reflect readiness).
// ─────────────────────────────────────────────────────────────────
test.describe("Export family — Outputs nav", () => {
  test("nav lists every target; LIVE ones flag live + ready dots @feat:editor-shell.panels.outputs @feat:plugin-platform.importer-exporter @feat:the-renderer.export-diagnostics @feat:the-renderer.pdf-export-marks @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadDoc(page, CLEAN);
    await openPanel(page, "paged.outputs");

    const nav = page.locator("[data-outputs-panel]");
    await expect(nav).toBeVisible();
    // IDML is no longer a built-in nav target (it's the paged.publish plugin
    // exporter, in the "Plugin exports" section) — five rows, two LIVE.
    await expect(page.locator("[data-output-nav]")).toHaveCount(5);
    await expect(
      page.locator("[data-output-nav][data-output-live]"),
    ).toHaveCount(2);

    // A clean doc → the image LIVE target reads a "ready" dot.
    await expect(
      page.locator('[data-output-nav="image"] [data-output-dot="ready"]'),
    ).toBeVisible();
    // The honest seams read the draft dot.
    await expect(
      page.locator('[data-output-nav="web"] [data-output-dot="draft"]'),
    ).toBeVisible();
  });

  test("clicking a target selects it (syncs the shared store) @feat:editor-shell.panels.outputs @feat:plugin-platform.importer-exporter @feat:the-renderer.export-diagnostics @feat:the-renderer.pdf-export-marks @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadDoc(page, CLEAN);
    await openPanel(page, "paged.outputs");

    await page.locator('[data-output-nav="image"]').click();
    await expect(
      page.locator('[data-output-nav="image"][data-selected]'),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────
// Export settings — the right per-target inspector (inline settings).
// ─────────────────────────────────────────────────────────────────
test.describe("Export family — Export inspector", () => {
  test("LIVE image target — inline DPI/scope settings drive a real PNG export @feat:editor-shell.panels.outputs @feat:plugin-platform.importer-exporter @feat:the-renderer.export-diagnostics @feat:the-renderer.pdf-export-marks @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadDoc(page, CLEAN);
    // Export mode mounts the Outputs nav (left) + Export inspector
    // (right) in separate, both-visible regions — the real layout.
    await setMode(page, "export");

    // Select the image output through the shared store.
    await page.locator('[data-output-nav="image"]').click();

    const insp = page.locator("[data-export-inspector-panel]");
    await expect(insp).toBeVisible();
    // Inline settings are real (persisted), not seams.
    await expect(page.locator("[data-export-image-settings]")).toBeVisible();
    await page.locator("[data-export-image-dpi]").selectOption("150");
    // Current-page scope keeps the download to a single PNG.
    await page.locator("[data-export-image-scope]").selectOption("current");

    const downloadPromise = page.waitForEvent("download");
    await page
      .locator('[data-cockpit-action="export-inspector-run-image"]')
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    // The done affordance reports a real file count.
    await expect(page.locator("[data-export-image-done]")).toBeVisible();

    await setMode(page, "design");
  });

  test("E-2 — a page RANGE exports the named pages, and a nonsense range REFUSES @feat:editor-shell.panels.outputs @feat:plugin-platform.importer-exporter @level:gesture", async ({
    page,
  }) => {
    // The range exists because all/current is a BINARY and the common
    // ask sits between its ends. This is paged's answer to Photoshop's
    // "Export As → artboards": a page already IS the containment those
    // artboards provide, so all that was missing was naming a subset.
    await openCanvas(page);
    await loadDoc(page, CLEAN);
    await setMode(page, "export");
    await page.locator('[data-output-nav="image"]').click();
    await expect(page.locator("[data-export-inspector-panel]")).toBeVisible();

    // The range input appears only for the range scope — a control
    // that cannot act should not be on screen.
    await expect(page.locator("[data-export-image-range]")).toHaveCount(0);
    await page.locator("[data-export-image-scope]").selectOption("range");
    await expect(page.locator("[data-export-image-range]")).toBeVisible();

    // A range naming ONE page yields exactly one download. Asserted as
    // a download rather than a file count, so it measures what the user
    // gets rather than what the model reports.
    await page.locator("[data-export-image-range]").fill("1");
    const dl = page.waitForEvent("download");
    await page
      .locator('[data-cockpit-action="export-inspector-run-image"]')
      .click();
    expect((await dl).suggestedFilename()).toMatch(/\.png$/);
    await expect(page.locator("[data-export-image-done]")).toBeVisible();

    // A range naming NO page in this document REFUSES, and says so with
    // the document's own page count. The alternative — falling back to
    // every page — answers a typo with a folder full of files.
    await page.locator("[data-export-image-range]").fill("999");
    await page
      .locator('[data-cockpit-action="export-inspector-run-image"]')
      .click();
    await expect(page.locator("[data-export-image-done]")).toHaveCount(0);
    await expect(
      page.getByText(/names no page in this .*-page document/),
    ).toBeVisible();

    await setMode(page, "design");
  });

  // TODO(ADR-022 Phase 5): IDML is now the paged.publish plugin exporter. Rewrite
  // against the "Plugin exports" section (click
  // `[data-plugin-export="media.paged.publish.exporter.idml"]`, assert the `.idml`
  // download) — needs the plugin bundle loaded at runtime.
  test.skip("LIVE IDML target — the run button downloads the package @feat:editor-shell.panels.outputs @feat:plugin-platform.importer-exporter @feat:the-renderer.export-diagnostics @feat:the-renderer.pdf-export-marks @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadDoc(page, CLEAN);
    await setMode(page, "export");

    const downloadPromise = page.waitForEvent("download");
    await page
      .locator('[data-plugin-export="media.paged.publish.exporter.idml"]')
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.idml$/);

    await setMode(page, "design");
  });

  test("HONEST target — the web seam shows the concept copy, no run button @feat:editor-shell.panels.outputs @feat:plugin-platform.importer-exporter @feat:the-renderer.export-diagnostics @feat:the-renderer.pdf-export-marks @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadDoc(page, CLEAN);
    await setMode(page, "export");

    await page.locator('[data-output-nav="web"]').click();
    await expect(
      page.locator('[data-status-pill="export-inspector-readiness"]'),
    ).toHaveText(/Coming soon/i);
    // No live run action for a seam target.
    await expect(
      page.locator('[data-cockpit-action="export-inspector-run-image"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-cockpit-action="export-inspector-run"]'),
    ).toHaveCount(0);

    await setMode(page, "design");
  });
});

// ─────────────────────────────────────────────────────────────────
// Output readiness — the Prepress right inspector (preflight checks).
// ─────────────────────────────────────────────────────────────────
test.describe("Export family — Output readiness", () => {
  test("checks are LIVE verdicts off the wire; bleed stays the one HONEST seam @feat:editor-shell.panels.outputs @feat:plugin-platform.importer-exporter @feat:the-renderer.export-diagnostics @feat:the-renderer.pdf-export-marks @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadDoc(page, CLEAN);
    await setMode(page, "prepress");
    await openPanel(page, "paged.output-readiness");

    const panel = page.locator("[data-output-readiness-panel]");
    await expect(panel).toBeVisible();
    // The font / link / PPI rows are LIVE: each carries a real
    // pass/fail verdict (data-readiness-pass present) rather than the
    // "soon" seam. (geometry-groups.idml resolves all links + PPI; its
    // default font doesn't resolve in the test font set, so the fonts
    // row is a real FAIL — a live verdict, which is the point.)
    for (const key of ["fonts", "links", "ppi"]) {
      await expect(
        page.locator(`[data-readiness-row="${key}"]`),
      ).toHaveAttribute("data-readiness-pass", /true|false/);
      await expect(
        page.locator(`[data-readiness-row="${key}"]`),
      ).not.toHaveAttribute("data-seam", "");
    }
    // Links + PPI resolve cleanly on this fixture → those pass.
    await expect(page.locator('[data-readiness-row="links"]')).toHaveAttribute(
      "data-readiness-pass",
      "true",
    );
    await expect(page.locator('[data-readiness-row="ppi"]')).toHaveAttribute(
      "data-readiness-pass",
      "true",
    );
    // Bleed has no wire accessor → it's the one HONEST seam ("soon").
    await expect(
      page.locator('[data-readiness-row="bleed"][data-seam]'),
    ).toBeVisible();

    await setMode(page, "design");
  });

  test("broken-links doc — the LIVE checks reflect REAL missing links + low-res @feat:editor-shell.panels.outputs @feat:plugin-platform.importer-exporter @feat:the-renderer.export-diagnostics @feat:the-renderer.pdf-export-marks @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadDoc(page, BROKEN_LINKS);
    await setMode(page, "prepress");
    await openPanel(page, "paged.output-readiness");

    await expect(page.locator("[data-output-readiness-panel]")).toBeVisible();
    // links-broken.idml ships dangling images → the links check FAILS,
    // and a 96-ppi placement → the PPI check FAILS. Both are real
    // verdicts off LinkSummary, not stubs.
    await expect(
      page.locator('[data-readiness-row="links"][data-readiness-pass="false"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-readiness-row="ppi"][data-readiness-pass="false"]'),
    ).toBeVisible();
    // The overall X-4 verdict flips to "Not ready".
    await expect(page.locator('[data-status-pill="readiness-x4"]')).toHaveText(
      /Not ready/i,
    );

    await setMode(page, "design");
  });
});
