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

// Journey: the C-6 tile-fill LOOP — a plugin claims a frame's image
// resource and the pixels it serves reach the page.
//
// WHY THIS EXISTS, and why the sibling `image.journey.spec.ts` did not
// catch what it missed. That spec drives `claimTiles` and records the
// step as driven — "degrades honestly if the host wires no resource
// channel" — without ever asking whether a tile arrived. It could not
// have: nothing on that page looks at the frame.
//
// What it was hiding: the fill loop had NO PRODUCER. `paged-canvas-wasm`
// answers a claim with the tiles the build LACKED, carried on the
// `resourceClaimApplied` ack; `CanvasClient` waited instead for an
// unsolicited `resourceTilesNeeded` notification that nothing in core or
// the editor ever posts. Meanwhile the worker DROPS a frame's cached
// tiles when its claim is replaced. So a plugin claim evicted whatever
// was in the frame and refilled it with nothing — the frame went BLANK
// while `claimTiles` reported "Claimed tile resource for the frame".
// Measured on the showcase's raster page: a 228 x 240 pt frame carrying
// a photograph, 97,280 px of content, dropped to 0 px on the claim.
//
// So this asserts the one thing that matters and the smoke journey
// cannot: after a plugin claims the frame, the frame still has pixels.
// No GPU needed — the tile lane is plain RGBA8 through the CPU snapshot;
// only paged.image's ADJUSTMENT kernels are WebGPU-only.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";

const ADJ_PANEL = "media.paged.image.panel.adjustments";
const CMD_ADJUST = "media.paged.image.command.adjustSelected";
const CMD_CLAIM = "media.paged.image.command.claimTiles";

/** The frame, in page pt, and the px-per-pt of `renderBytes`' snapshot
 *  (816 px across a 612 pt Letter page). */
const FRAME = { x0: 120, y0: 140, x1: 348, y1: 380 };
const PX_PER_PT = 816 / 612;

/** How many pixels inside the frame's rect are not page-white — the
 *  direct question "is there anything in this frame". Decoded in the
 *  page context (`createImageBitmap` + `OffscreenCanvas`), the same door
 *  `Designer.renderDiffPixels` uses, so no Node PNG decoder is needed. */
async function contentPixels(page: Page, png: Uint8Array): Promise<number> {
  return page.evaluate(
    async ({ bytes, r }) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
      const bmp = await createImageBitmap(blob);
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = cv.getContext("2d");
      if (!ctx) throw new Error("no 2d context for the frame read");
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      let n = 0;
      for (let y = r.y0; y < Math.min(r.y1, bmp.height); y++) {
        for (let x = r.x0; x < Math.min(r.x1, bmp.width); x++) {
          const i = (y * bmp.width + x) * 4;
          if (!(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) n++;
        }
      }
      return n;
    },
    {
      bytes: Array.from(png),
      r: {
        x0: Math.round(FRAME.x0 * PX_PER_PT),
        y0: Math.round(FRAME.y0 * PX_PER_PT),
        x1: Math.round(FRAME.x1 * PX_PER_PT),
        y1: Math.round(FRAME.y1 * PX_PER_PT),
      },
    },
  );
}

test.describe("journey · the C-6 tile-fill loop", () => {
  test("a plugin's tile claim leaves the frame with pixels @feat:plugin-platform.image-resource @feat:image.editor.tile-provider @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. the frame, its link, and the HOST's own tiles ────────────
    const frame = await designer.addFrame(FRAME);
    expect(frame?.id, "the target frame exists").toBeTruthy();
    expect(
      await designer.placeImageLink(frame!.id, `x-paged-image:${frame!.id}`),
      "the frame carries a placed-image link",
    ).toBe(true);

    const blank = await designer.renderBytes();
    expect(
      await contentPixels(page, blank),
      "the frame starts empty (a link alone paints nothing)",
    ).toBeLessThan(64);

    await designer.serveTiledImage(frame!.id);
    const served = await designer.renderBytes();
    const hostServed = await contentPixels(page, served);
    expect(
      hostServed,
      "the host's own C-6 tiles paint the frame",
    ).toBeGreaterThan(1000);

    // ── 1. hand the frame to paged.image ───────────────────────────
    await designer.selectElement("rectangle", frame!.id);
    await designer.runCommand(CMD_ADJUST);
    await designer.openPanel(ADJ_PANEL);
    const importer = await designer.importImage({ name: "tile-loop.png" });
    expect(importer, "the raster importer claimed the bytes").toContain(
      "media.paged.image.importer.raster",
    );

    // ── 2. THE ASSERTION — the plugin's claim REPLACES the frame's
    //    tiles, so the loop that refills them has to run. Poll: the fill
    //    is claim → ack → source → submit → rebuild, all async. ──
    await designer.runCommand(CMD_CLAIM);
    await expect
      .poll(
        async () => contentPixels(page, await designer.renderBytes()),
        {
          message:
            "the plugin claimed the frame's image resource and served no " +
            "tiles — the frame is blank. The claim evicts the cached " +
            "tiles, so a fill loop that never runs is strictly worse than " +
            "no claim at all",
          timeout: 20_000,
        },
      )
      .toBeGreaterThan(1000);
  });
});
