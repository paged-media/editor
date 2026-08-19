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

// U5 (A7) — the DEFAULT-FONT INVARIANT: every load path reaches the
// engine with a default font, so a document whose declared fonts the
// editor cannot resolve still renders its text through the fallback
// face instead of silently painting a BLANK page (the U5 audit
// finding's editor half; the engine-side PINK substitute marker ships
// separately — nothing here asserts pink, only that ink lands).
//
// The oracle: `corpus/idml/generated/text.idml` declares "Open Sans", which
// the editor never registers. Its page-1 text frame (57.6, 145.8,
// 480×400 pt, no fill/stroke) paints NOTHING but glyphs — so ink
// inside that region IS the fallback face rendering.
//
// Three doors:
//   · the corpus-picker door (the header <select> → loadDocumentFile);
//   · the file-input door (drag/open → loadDocumentFile);
//   · the BARE client door — `client.loadDocument(bytes)` with no font
//     bytes, the plugin native-document fallback's exact call — which
//     only renders text because of `defaultFontProvider` (the A7 fix:
//     before it, this path had no default font at all).

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { openCanvas, snapshotPagePng } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const TEXT_FIXTURE = `${REPO_ROOT}/corpus/idml/generated/text.idml`;

// Page 1 of text.idml: A4 (595.276 × 841.89 pt); the lone text frame
// sits at (57.638, 145.824), 480 × 400 pt, FillColor/StrokeColor None.
const PAGE_W_PT = 595.276;
const FRAME = { x: 57.638, y: 145.824, w: 480, h: 400 };
const SNAPSHOT_WIDTH_PX = 256;

/** Count "ink" pixels (luminance < 200) inside the text frame's region
 *  of a page snapshot. Blank-text bug ⇒ 0; a rendered paragraph at
 *  this scale ⇒ hundreds. */
function inkPixelsInFrame(pngBytes: Uint8Array): number {
  const png = PNG.sync.read(Buffer.from(pngBytes));
  const scale = png.width / PAGE_W_PT;
  const x0 = Math.floor(FRAME.x * scale);
  const x1 = Math.ceil((FRAME.x + FRAME.w) * scale);
  const y0 = Math.floor(FRAME.y * scale);
  const y1 = Math.ceil((FRAME.y + FRAME.h) * scale);
  let ink = 0;
  for (let y = y0; y < Math.min(y1, png.height); y++) {
    for (let x = x0; x < Math.min(x1, png.width); x++) {
      const i = (y * png.width + x) * 4;
      const lum =
        0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
      if (png.data[i + 3] > 0 && lum < 200) ink += 1;
    }
  }
  return ink;
}

/** Poll a fresh page-1 snapshot until text ink shows (a single cold
 *  sample can race the layout cache — the render-poll rule). */
async function expectTextInk(page: Page, pageId: string): Promise<void> {
  await expect
    .poll(
      async () =>
        inkPixelsInFrame(
          await snapshotPagePng(page, pageId, SNAPSHOT_WIDTH_PX, 31),
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(200);
}

async function firstPageIdOfMirror(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (globalThis as unknown as { __canvas: { handle: { pageIds: string[] } } })
        .__canvas.handle.pageIds[0],
  );
}

test.describe("U5/A7 — the default-font invariant (unresolvable fonts still render)", () => {
  test("corpus-picker door: text.idml (Open Sans, unregistered) renders text ink @feat:the-renderer.missing-asset-fallback @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    // The header <select> the CorpusPicker renders (dev-only route).
    const picker = page.getByLabel("Load corpus IDML");
    await expect(picker).toBeVisible({ timeout: 15_000 });
    await picker.selectOption("generated/text");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (globalThis as unknown as { __canvas: { ready: boolean } })
              .__canvas.ready,
        ),
      )
      .toBe(true);
    await expectTextInk(page, await firstPageIdOfMirror(page));
  });

  test("file-input door: text.idml renders text ink @feat:the-renderer.missing-asset-fallback @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await page.setInputFiles('input[type="file"]', TEXT_FIXTURE);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (globalThis as unknown as { __canvas: { ready: boolean } })
              .__canvas.ready,
        ),
      )
      .toBe(true);
    await expectTextInk(page, await firstPageIdOfMirror(page));
  });

  test("bare client door: loadDocument with NO font bytes rides defaultFontProvider and renders text ink @feat:the-renderer.missing-asset-fallback @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    // The plugin native-document fallback's exact call shape:
    // `client.loadDocument(bytes)` — no font argument. Before A7 this
    // reached the engine with no default font and the page painted
    // blank; the provider now supplies Inter.
    const pageId = await page.evaluate(async (url) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              loadDocument: (
                b: Uint8Array,
              ) => Promise<{ pageIds: string[] }>;
            };
          };
        }
      ).__canvas;
      const handle = await c.client.loadDocument(bytes);
      return handle.pageIds[0];
    }, "/@fs" + TEXT_FIXTURE);
    await expectTextInk(page, pageId);
  });
});
