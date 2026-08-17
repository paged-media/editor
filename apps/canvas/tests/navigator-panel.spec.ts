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

// Pages (navigator filmstrip) panel behaviour (audit 17082026 B8/B9 —
// this panel was green via the panel-sweep mount smoke only, and its
// test-map entry pointed at a file that did not exist). The panel
// renders one thumbnail tile per document page and clicking a tile
// fit-navigates the camera onto that page. The document is loaded
// through the real file-input flow because the panel reads
// `useDocument().handle` — the fidelity driver's direct
// `client.loadDocument` deliberately bypasses that React state.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
// A multi-page fixture: clicking a single page's tile must produce a
// camera that differs from the on-load fit (which frames ALL pages).
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

/** The live SAB camera the worker renders with. */
async function readCamera(
  page: Page,
): Promise<{ scale: number; tx: number; ty: number }> {
  return page.evaluate(() => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            camera: { read: () => { scale: number; tx: number; ty: number } };
          };
        };
      }
    ).__canvas;
    return c.client.camera.read();
  });
}

test.describe("Pages navigator panel", () => {
  test("AC-PAGESNAV-1 — one tile per document page; clicking a tile navigates the camera @feat:editor-shell.panels.pages-navigator @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadViaInput(page, FIXTURE);
    await openPanel(page, "paged.pages");

    // Real content: exactly one thumbnail tile per page of the
    // LOADED document (not a canned count — read the handle).
    const pageCount = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas: { handle: { pageCount: number } };
          }
        ).__canvas.handle.pageCount,
    );
    expect(pageCount).toBeGreaterThan(1);
    const tiles = page.locator('button[title^="Jump to page "]');
    await expect(tiles).toHaveCount(pageCount);

    // Primary action: clicking the LAST page's tile fit-navigates.
    // On load the viewport fits ALL pages, so a single-page fit must
    // move the camera — poll (the jump is an animated tween).
    const before = await readCamera(page);
    await page
      .locator(`button[title^="Jump to page ${pageCount} "]`)
      .click();
    await expect
      .poll(async () => JSON.stringify(await readCamera(page)))
      .not.toBe(JSON.stringify(before));
  });
});
