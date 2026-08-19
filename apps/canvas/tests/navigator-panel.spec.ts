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
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

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

/** Mirror of `layoutPages`' vertical-stack gap (ui/layout.ts). */
const LAYOUT_GAP_PT = 24;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Recompute the doc-space page rects the app's camera-fit math uses:
 *  pages stacked vertically with the fixed layout gap. */
async function pageRects(page: Page): Promise<Rect[]> {
  const sizes = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __canvas: { handle: { pageSizesPt: [number, number][] } };
        }
      ).__canvas.handle.pageSizesPt,
  );
  const rects: Rect[] = [];
  let y = 0;
  for (const [w, h] of sizes) {
    rects.push({ x: 0, y, w, h });
    y += h + LAYOUT_GAP_PT;
  }
  return rects;
}

/** The canvas viewport's CSS-pixel size (the space the camera maps
 *  document points into). */
async function viewportPx(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-paged-canvas]");
    return el ? [el.clientWidth, el.clientHeight] : [0, 0];
  });
}

/** True when the camera has actually LANDED ON `rect`: the rect is
 *  fully inside the viewport AND fills a substantial share of it in at
 *  least one dimension. The share check is what discriminates a
 *  single-page fit from the on-load fit-all-pages camera (which also
 *  CONTAINS every page, just tiny). */
function cameraShowsRect(
  cam: { scale: number; tx: number; ty: number },
  [vw, vh]: [number, number],
  r: Rect,
  minShare = 0.5,
  slopPx = 1.5,
): boolean {
  if (vw <= 0 || vh <= 0) return false;
  const x0 = r.x * cam.scale + cam.tx;
  const y0 = r.y * cam.scale + cam.ty;
  const x1 = (r.x + r.w) * cam.scale + cam.tx;
  const y1 = (r.y + r.h) * cam.scale + cam.ty;
  const contained =
    x0 >= -slopPx && y0 >= -slopPx && x1 <= vw + slopPx && y1 <= vh + slopPx;
  const share = Math.max((x1 - x0) / vw, (y1 - y0) / vh);
  return contained && share >= minShare;
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
    // U4 — assert the landed camera actually SHOWS the target page:
    // the page rect (recomputed from pageSizesPt + the layout gap,
    // the same math the panel uses) is fully inside the viewport and
    // fills it — not merely "camera changed". Poll: the jump is an
    // animated tween.
    const before = await readCamera(page);
    const rects = await pageRects(page);
    const target = rects[pageCount - 1];
    await page
      .locator(`button[title^="Jump to page ${pageCount} "]`)
      .click();
    await expect
      .poll(async () => JSON.stringify(await readCamera(page)))
      .not.toBe(JSON.stringify(before));
    await expect
      .poll(async () =>
        cameraShowsRect(await readCamera(page), await viewportPx(page), target),
      )
      .toBe(true);
  });

  test("AC-PAGESNAV-2 — clicking a thumbnail-rail spread lands the camera on the spread's first page @feat:editor-shell.panels.pages-navigator @level:happy", async ({
    page,
  }) => {
    // U4 — the bottom filmstrip (ThumbnailRail) navigates by SPREAD.
    // Pages stack vertically in doc space, so the navigator must land
    // on the spread's FIRST page (fitting the spread UNION centred the
    // camera on the inter-page gap). Spread membership mirrors
    // `groupSpreads`: consume page indices in document order,
    // `pageCount` per spread row of the `spreads` collection.
    await openCanvas(page);
    await loadViaInput(page, FIXTURE);

    const rail = page.locator("[data-thumbnail-rail]");
    await expect(rail).toBeVisible();
    const spreadButtons = rail.locator("[data-thumbnail-spread]");
    await expect.poll(() => spreadButtons.count()).toBeGreaterThan(0);
    const count = await spreadButtons.count();

    // First page index of the LAST spread, via the wire's spread rows
    // (same consumption order as the rail's groupSpreads).
    const spreadPageCounts = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              collection: (n: string) => Promise<Array<{ pageCount: number }>>;
            };
          };
        }
      ).__canvas;
      return (await c.client.collection("spreads")).map((s) =>
        Math.max(1, s.pageCount),
      );
    });
    const rects = await pageRects(page);
    let firstIndexOfLast = 0;
    if (spreadPageCounts.length > 0 && spreadPageCounts.length === count) {
      let cursor = 0;
      for (let i = 0; i < spreadPageCounts.length - 1; i++) {
        cursor += spreadPageCounts[i];
      }
      firstIndexOfLast = Math.min(cursor, rects.length - 1);
    } else {
      // Fallback grouping (one page per rail entry).
      firstIndexOfLast = Math.min(count - 1, rects.length - 1);
    }
    const target = rects[firstIndexOfLast];

    await spreadButtons.last().click();
    await expect
      .poll(async () =>
        cameraShowsRect(await readCamera(page), await viewportPx(page), target),
      )
      .toBe(true);
  });
});
