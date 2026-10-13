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

// ED-11 — the chrome of a plugin's edit context (paged.image's raster
// frame), three rough edges the image film caught:
//
//   · the bar above the canvas printed the context's raw type and a raw
//     comma-separated list of tool titles ("Editing rasterImage — Brush
//     (raster), Pencil (raster), …") — a sentence where a toolbar
//     belongs;
//   · picking the Zoom tool left the context, as if zooming to look at
//     the pixels were reaching for another editing tool;
//   · after Escape the raster tool stayed armed on the page.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../journey/driver/designer";

async function debug(page: Page): Promise<{ tool: string | null; context: string | null }> {
  return page.evaluate(() => {
    const d = (
      globalThis as unknown as {
        __canvas: {
          debugContext?: () => {
            tools?: { base?: string };
            editContext?: { type?: string } | null;
          };
        };
      }
    ).__canvas.debugContext?.();
    return { tool: d?.tools?.base ?? null, context: d?.editContext?.type ?? null };
  });
}

/** A frame holding real PNG bytes, selected with the Selection tool,
 *  then "Adjust image": the rasterImage edit context is active. */
async function enterRasterContext(page: Page): Promise<void> {
  const designer = new Designer(page);
  await designer.open();
  await designer.newDocument();
  const frame = await designer.drawRectangle({ x0: 90, y0: 120, x1: 360, y1: 320 });
  const placed = await page.evaluate(async (elementId) => {
    const cv = new OffscreenCanvas(160, 120);
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#2050d0";
    ctx.fillRect(0, 0, 160, 120);
    const bytes = Array.from(
      new Uint8Array(await (await cv.convertToBlob({ type: "image/png" })).arrayBuffer()),
    );
    const c = (
      globalThis as unknown as {
        __canvas: { client: { mutate: (m: unknown) => Promise<{ kind: string }> } };
      }
    ).__canvas;
    return (await c.client.mutate({ op: "replaceImageBytes", args: { elementId, bytes } })).kind;
  }, frame);
  expect(placed).toBe("mutationApplied");
  await designer.activate("select");
  await designer.selectElement("rectangle", frame);
  await designer.runCommand("media.paged.image.command.adjustSelected");
  await expect
    .poll(async () => (await debug(page)).context, { timeout: 20_000 })
    .toBe("rasterImage");
  await page.locator("body").focus();
}

test.describe("ED-11 — raster context chrome", () => {
  test("AC-CTXBAR-1 — the bar names the context and offers its tools as tools, not as a raw list @feat:editor-shell.context-toolbars @level:edge", async ({
    page,
  }) => {
    await enterRasterContext(page);
    const segment = page.locator("[data-context-segment]");
    await expect(segment).toBeVisible();
    await expect(segment).not.toContainText("rasterImage");
    await expect(segment).not.toContainText(",");
    await expect(segment.locator("[data-context-label]")).toHaveText("Raster image");
    const pills = segment.locator("[data-context-tool]");
    expect(await pills.count()).toBeGreaterThan(1);
    // A pill IS the tool: pressing one arms it, inside the context.
    const second = await pills.nth(1).getAttribute("data-context-tool");
    await pills.nth(1).click();
    await expect.poll(async () => (await debug(page)).tool).toBe(second);
    await expect(pills.nth(1)).toHaveAttribute("aria-pressed", "true");
    expect((await debug(page)).context).toBe("rasterImage");
  });

  test("AC-CTXBAR-2 — Zoom (rail or Z) looks at the frame without leaving it @feat:editor-shell.context-toolbars @level:edge", async ({
    page,
  }) => {
    await enterRasterContext(page);
    await page.locator('[data-tool-slot="zoom"]').click();
    await expect.poll(async () => (await debug(page)).tool).toBe("paged.tool.zoom");
    expect((await debug(page)).context, "the rail's Zoom keeps the context").toBe("rasterImage");

    await page.locator("[data-context-tool]").first().click();
    await page.locator("body").focus();
    await page.keyboard.press("z");
    await expect.poll(async () => (await debug(page)).tool).toBe("paged.tool.zoom");
    await page.waitForTimeout(200);
    expect((await debug(page)).context, "Z keeps the context").toBe("rasterImage");
  });

  test("AC-CTXBAR-3 — Escape leaves the frame and puts its tool down @feat:editor-shell.context-toolbars @level:edge", async ({
    page,
  }) => {
    await enterRasterContext(page);
    const inside = (await debug(page)).tool;
    expect(inside, "entry arms the context's first tool").toMatch(/^media\.paged\.image\./);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await debug(page)).context).toBe(null);
    await expect.poll(async () => (await debug(page)).tool).toBe("paged.tool.select");
  });
});
