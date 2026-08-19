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

// Cockpit panels (styleguide E): the Export Center drives the REAL
// Concept-3 PDF dialog; Preflight's "Validate output" runs the real
// export pipeline for its findings; Publication health reads live
// document metrics; the stub surfaces are visibly stubs.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

declare global {
  interface Window {
    __canvas: {
      ready: boolean;
      mode: string;
      setMode: (m: string) => void;
    };
  }
}

async function loadFixture(page: Page) {
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await expect
    .poll(() => page.evaluate(() => window.__canvas.ready))
    .toBe(true);
}

test.describe("Cockpit — Export Center", () => {
  test("the PDF target opens the real export dialog and completes @feat:editor-shell.panel-rail @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page);
    await page.evaluate(() => window.__canvas.setMode("export"));

    const center = page.locator("[data-export-center]");
    await expect(center).toBeVisible();
    // W2.6→ADR-022 Phase 5 — five built-in targets (two LIVE: PDF/image);
    // IDML left the built-in set for the paged.publish plugin exporter.
    // The honest-or-live invariant + per-target detail is covered in
    // export-family.spec.ts; here we just drive the PDF row through.
    await expect(page.locator("[data-export-target]")).toHaveCount(5);
    await expect(
      page.locator('[data-status-pill="readiness-pdf-x4"]'),
    ).toBeVisible();

    await page.locator('[data-cockpit-action="export-center-pdf-x4"]').click();
    await expect(page.locator("[data-export-dialog]")).toBeVisible();
    // Drive a real PDF 1.7 export through to the download.
    await page.locator("[data-export-standard]").selectOption("pdf17");
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-export-confirm]").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    await page.evaluate(() => window.__canvas.setMode("design"));
  });
});

test.describe("Cockpit — Preflight", () => {
  test("Validate output runs the real exporter and reports @feat:editor-shell.panel-rail @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page);
    await page.evaluate(() => window.__canvas.setMode("prepress"));

    await expect(page.locator("[data-preflight-panel]")).toBeVisible();
    await page.locator('[data-cockpit-action="run-validation"]').click();
    // The validation state pill lands once the export round-trips.
    await expect(
      page.locator('[data-status-pill="validation-state"]'),
    ).toBeVisible({ timeout: 60_000 });

    await page.evaluate(() => window.__canvas.setMode("design"));
  });
});

test.describe("Cockpit — document title bar", () => {
  test("U14 — the title shows the loaded file's name when the meta has none @feat:editor-shell.document-title @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    // Before any load the bar says so honestly.
    await expect(page.locator("[data-doc-title-bar]")).toContainText(
      "No document",
    );

    // The file-input flow sets the document context's `sourceName`
    // from the file name (extension stripped); the title prefers
    // meta.documentName, then sourceName, then "Untitled document".
    await loadFixture(page);
    const metaName = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: { documentMeta: () => Promise<{ documentName?: string }> };
          };
        }
      ).__canvas;
      try {
        return (await c.client.documentMeta()).documentName ?? "";
      } catch {
        return "";
      }
    });
    const expected = metaName || "geometry-groups";
    const title = page.locator("[data-doc-title-bar] span").first();
    await expect(title).toHaveText(expected);
    // Whatever the meta carries, a real file load must not fall
    // through to the untitled placeholder.
    await expect(title).not.toHaveText("Untitled document");
  });
});

test.describe("Cockpit — Publication health + stubs", () => {
  test("health shows live metrics; stubs are visibly stubs @feat:editor-shell.panel-rail @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page);

    // Content mode mounts the Stories panel — W2.12 made it a real
    // story list off `paged.stories()`; the fixture has stories, so
    // the list renders (not the empty-state ComingSoon).
    await page.evaluate(() => window.__canvas.setMode("content"));
    await expect(page.locator('[data-stories-panel="ready"]')).toBeVisible();
    await expect(
      page.locator("[data-story-list] [data-list-row]"),
    ).not.toHaveCount(0);

    await page.evaluate(() => window.__canvas.setMode("review"));
    await expect(
      page.locator("[data-comments-panel] [data-coming-soon]"),
    ).toBeVisible();

    await page.evaluate(() => window.__canvas.setMode("data"));
    // Data mode seeds the LIVE paged.data bindings panel (the mapping
    // ComingSoon stub is off the mode surface, Window-menu only).
    await expect(page.locator('text="Wire demo binding"')).toBeVisible();

    await page.evaluate(() => window.__canvas.setMode("design"));
  });
});
