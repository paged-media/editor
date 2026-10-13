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

// IMG-3 — a frame tool's shortcut inside its own frame.
//
// paged.image's healing brush declares `j`, and so does the host's
// fill/stroke cluster ("formatting affects container/text"). Both
// bindings are guarded the same way, and the dispatcher picks the first
// enabled guarded binding in REGISTRATION order: the cluster registers
// at shell mount, the bundle's tool later, so inside the raster frame J
// toggled formatting instead of arming the tool the rail advertises —
// and since hiding and showing the rail re-registers the cluster, which
// one won depended on history. A tool's shortcut now outranks every
// other binding on its key while an edit context that claims the tool
// is active, and yields to them everywhere else.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../journey/driver/designer";

const HEAL = "media.paged.image.tool.heal";

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

/** A frame holding real PNG bytes, selected, with "Adjust image" run:
 *  the rasterImage edit context is active. */
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
  await designer.selectElement("rectangle", frame);
  await designer.runCommand("media.paged.image.command.adjustSelected");
  await expect
    .poll(async () => (await debug(page)).context, { timeout: 20_000 })
    .toBe("rasterImage");
}

test.describe("IMG-3 — frame tool shortcuts", () => {
  test("AC-FRAMEKEY-1 — J arms the healing brush inside a raster frame @feat:editor-shell.tool-rail @level:edge", async ({
    page,
  }) => {
    await enterRasterContext(page);
    // The key goes to the page, not to a field.
    await page.locator("body").focus();
    await page.keyboard.press("j");
    await expect.poll(async () => (await debug(page)).tool).toBe(HEAL);
    await expect.poll(async () => (await debug(page)).context).toBe("rasterImage");
  });

  test("AC-FRAMEKEY-2 — outside the frame J stays the host's and does not arm a frame tool @feat:editor-shell.tool-rail @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await designer.activate("select");
    await page.locator("body").focus();
    await page.keyboard.press("j");
    await page.waitForTimeout(200);
    expect((await debug(page)).tool).toBe("paged.tool.select");
  });
});
