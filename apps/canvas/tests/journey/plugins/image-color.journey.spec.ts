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

// Journey: paged.image's foreground colour comes from the HOST colour
// picker (protocol 66, `widgets.colorPicker@1`).
//
// The image panel's Colour section used to offer a browser
// `<input type=color>`. Where the host serves `host.widgets.ColorPicker`
// it now mounts the editor's own mixer — the one the Swatches and Color
// panels use — and keeps the browser input only as the older host's
// fallback. This journey drives that mixer like a designer: type a hex
// into it, and the foreground (and the brush colour with it) follows; a
// brush stroke then lays that colour on the page.
//
// Lane split: the picker, the foreground readout and the swatch are host
// UI and run on both lanes. The stroke's pixels need a GPU (every dab is a
// WGSL dispatch).

import { expect, test, type Page } from "@playwright/test";

import { screenPoint } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

const ADJ_PANEL = "media.paged.image.panel.adjustments";
const BRUSH = "media.paged.image.tool.brush";

/** Magenta: not on the sample's blue → green → red gradient, so any
 *  magenta pixel on the page is paint. */
const PICK = "e010e0";

async function sourceReadout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? (spans[i + 1]?.textContent ?? "?") : "Source row not found";
  });
}

/** The hex readout beside the foreground swatch. */
async function foregroundHex(page: Page): Promise<string> {
  return page.evaluate(() => {
    const sw = document.querySelector("[data-image-fg-swatch]");
    const row = sw?.parentElement;
    const spans = row ? Array.from(row.querySelectorAll("span")) : [];
    const hex = spans.map((s) => s.textContent ?? "").find((t) => /^#[0-9a-f]{6}$/i.test(t));
    return (hex ?? "").toLowerCase();
  });
}

/** Pixels in the page render that read as the picked magenta. */
async function magentaPixels(page: Page, png: Uint8Array): Promise<number> {
  return page.evaluate(async (bytes) => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 170 && d[i + 2] > 170 && d[i + 1] < 90) n++;
    }
    return n;
  }, Array.from(png));
}

test.describe("journey · paged.image colour", () => {
  test("the host colour picker sets the foreground, and a brush stroke paints it @feat:image.editor.color-fg-bg @feat:image.editor.paint @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const frame = await designer.drawRectangle({ x0: 90, y0: 120, x1: 360, y1: 320 });
    expect(frame, "drew a target frame").not.toBe("");
    await designer.selectElement("rectangle", frame);
    // The importer binds the selected frame, so the brush has a frame fit.
    const importer = await designer.importImage({ name: "color-sample.png" });
    expect(importer).toContain("media.paged.image.importer.raster");
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("color-sample.png"));

    // ── 1. THE HOST PICKER IS MOUNTED — and the browser input is not. ──
    const fgPicker = page.locator('[data-image-host-picker="fg"]');
    await expect(fgPicker, "the foreground uses the host picker").toHaveCount(1);
    await expect(fgPicker.locator("[data-host-color-picker]")).toHaveCount(1);
    await expect(page.locator('[data-image-host-picker="bg"]')).toHaveCount(1);
    await expect(
      page.locator("input[data-image-fg]"),
      "the browser colour input is the older host's fallback only",
    ).toHaveCount(0);

    // ── 2. CHOOSING A COLOUR SETS THE FOREGROUND — typed into the mixer's
    //    hex field the way a designer does, committed with Enter. ──
    const hex = fgPicker.locator("[data-mixer-hex]");
    await expect(hex).toBeVisible();
    await hex.fill(PICK);
    await hex.press("Enter");
    await expect.poll(() => foregroundHex(page), { timeout: 10_000 }).toBe(`#${PICK}`);
    await expect(page.locator("[data-image-fg-swatch]").first()).toHaveCSS(
      "background-color",
      "rgb(224, 16, 224)",
    );

    if (!(await designer.gpuActive())) {
      test.skip(
        true,
        "every dab is a WGSL dispatch (no CPU paint path). The picker → foreground half ran on this lane; run `pnpm --filter paged-canvas test:journeys:gpu` for the painted stroke",
      );
    }

    // ── 3. A STROKE PAINTS THE FOREGROUND. Same arming and coordinate
    //    rules as image-paint (document pt through `screenPoint`; hover
    //    first so the async frame fit lands). ──
    const before = await designer.renderBytes();
    expect(await magentaPixels(page, before), "no magenta before the stroke").toBeLessThan(16);
    await designer.runCommand(`paged.tool.activate.${BRUSH}`).catch(() => {});
    const path = await Promise.all(
      [
        [150, 180],
        [190, 210],
        [230, 190],
        [270, 220],
        [300, 200],
      ].map(([x, y]) => screenPoint(page, x, y)),
    );
    await page.mouse.move(path[0].x, path[0].y);
    await page.waitForTimeout(750);
    await page.mouse.down();
    for (const pt of path.slice(1)) {
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(60);
    }
    await page.mouse.up();

    await designer.expectRenderChangesFrom(before, { timeout: 20_000 });
    await expect
      .poll(async () => magentaPixels(page, await designer.renderBytes()), {
        timeout: 20_000,
        message: "the stroke laid the picked colour on the page",
      })
      .toBeGreaterThan(64);
  });
});
