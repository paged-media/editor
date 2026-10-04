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

// Journey: the paged.image Image-menu COMMANDS that had no journey —
// the rank filters, the canvas rotations and flips, the pattern trio, the
// smart-object conversion and the two layer-mask forms.
//
// Every one is driven through the command registry, the way the menu and
// the palette reach it, and each step asserts what the command DID:
//
//   · on the GPU lane, the page render changes (polled, never sampled
//     once) — or, where the command is documented to change no pixel,
//     stays put;
//   · on both lanes, whatever the session can say without a device: the
//     Source row's extent, the pattern size, the layer's kind, the mask's
//     edit target — and, for the GPU-only kernels, the refusal line that
//     names the kernel. A refusal that names the right kernel is the proof
//     the command reached the session rather than dying in the registry.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";
import {
  FRAME,
  armTool,
  compositeBaseline,
  dragPt,
  ingest,
  primeStatus,
  settledRender,
  sourceReadout,
  statusText,
  undoDepth,
} from "./image-helpers";

type Page = import("@playwright/test").Page;

const CMD = {
  median: "media.paged.image.command.median",
  maximum: "media.paged.image.command.maximum",
  minimum: "media.paged.image.command.minimum",
  rotateCw: "media.paged.image.command.rotateCw",
  rotateCcw: "media.paged.image.command.rotateCcw",
  rotate180: "media.paged.image.command.rotate180",
  flipHorizontal: "media.paged.image.command.flipHorizontal",
  flipVertical: "media.paged.image.command.flipVertical",
  definePattern: "media.paged.image.command.definePattern",
  fillPattern: "media.paged.image.command.fillPattern",
  shapeBlur: "media.paged.image.command.shapeBlur",
  convertLayerToSmart: "media.paged.image.command.convertLayerToSmart",
  addLayerMask: "media.paged.image.command.addLayerMask",
  addLayerMaskHideAll: "media.paged.image.command.addLayerMaskHideAll",
} as const;

const ERASER = "media.paged.image.tool.eraser";

/** The active layer row's edit-target toggle ("M"): null until a mask
 *  exists, then "mask" or "pixels". */
async function editTarget(page: Page): Promise<string | null> {
  const el = page.locator("[data-image-layer-edit-target]");
  if ((await el.count()) === 0) return null;
  return el.first().getAttribute("data-target");
}

/** The Smart object section's kind readout ("pixels" | "smart"). */
async function layerKind(page: Page): Promise<string> {
  return (
    (await page.locator("[data-image-make-smart] + span").first().textContent()) ??
    ""
  ).trim();
}

test.describe("journey · paged.image commands", () => {
  test("median, maximum and minimum each rewrite the image @feat:image.editor.rank-filters @feat:image.editor.filters @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(4 * 60_000);
    const designer = new Designer(page);
    // Noise: a 3×3 rank filter on a smooth ramp moves pixels by less than
    // the differ's tolerance; on noise it moves nearly all of them.
    const { empty } = await ingest(designer, page, "rank-sample.png", "noise");

    const steps = [
      [CMD.median, "Median"],
      [CMD.maximum, "Maximum"],
      [CMD.minimum, "Minimum"],
    ] as const;

    if (!(await designer.gpuActive())) {
      // Each command reaches the session and is refused BY NAME: the
      // three are WGSL kernels and no CPU path ships.
      for (const [id, label] of steps) {
        await designer.runCommand(id);
        await expect
          .poll(() => statusText(page), { timeout: 10_000 })
          .toContain(`${label} is a GPU-only kernel`);
      }
      test.skip(
        true,
        "the rank filters are GPU kernels (no CPU path); the command→session half ran on this lane. Run `pnpm --filter paged-canvas test:journeys:gpu` for the pixels",
      );
    }

    let before = await compositeBaseline(designer, page, empty);
    for (const [id, label] of steps) {
      const depth = await undoDepth(page);
      await designer.runCommand(id);
      await expect
        .poll(() => statusText(page), { timeout: 20_000 })
        .toContain(`${label} applied`);
      await expect
        .poll(() => undoDepth(page), { timeout: 10_000, message: `${label} is one journal step` })
        .toBeGreaterThan(depth);
      await designer.expectRenderChangesFrom(before, { timeout: 20_000 });
      before = await settledRender(designer, page);
    }
  });

  test("rotating and flipping the canvas turns the image, and a quarter turn swaps its extent @feat:image.editor.canvas-ops @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(4 * 60_000);
    const designer = new Designer(page);
    // Non-square, so a quarter turn is visible in the Source row's extent
    // and not only in pixels.
    const name = "canvas-sample.png";
    const { empty } = await ingest(designer, page, name, "gradient", 120, 72);
    const gpu = await designer.gpuActive();
    let before = gpu ? await compositeBaseline(designer, page, empty) : null;

    const steps = [
      [CMD.rotateCw, "72×120"],
      [CMD.rotateCcw, "120×72"],
      [CMD.rotate180, "120×72"],
      [CMD.flipHorizontal, "120×72"],
      [CMD.flipVertical, "120×72"],
    ] as const;
    for (const [id, extent] of steps) {
      // Three of the five keep the extent, so the Source row alone cannot
      // tell a step that ran from one that did nothing: prime the status
      // line and require the op's own report.
      await primeStatus(designer, page);
      await designer.runCommand(id);
      // The layer graph's canvas op runs engine-side without a kernel
      // dispatch, so the extent and the status are asserted on BOTH lanes.
      // The op's "Canvas → W×H" line is immediately replaced by the frame
      // re-composite's "Composited W×H into the frame"; either names the
      // new extent.
      await expect
        .poll(() => statusText(page), { timeout: 20_000, message: `${id} reports its result` })
        .toMatch(new RegExp(`(Canvas → |Composited )${extent}`));
      await expect.poll(() => sourceReadout(page), { timeout: 10_000 }).toBe(`${name} ${extent}`);
      if (before) {
        await designer.expectRenderChangesFrom(before, { timeout: 20_000 });
        before = await settledRender(designer, page);
      }
    }
  });

  test("a defined pattern fills the image back and shapes a blur @feat:image.editor.pattern-fill @feat:image.editor.filters @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(4 * 60_000);
    const designer = new Designer(page);
    const { empty } = await ingest(designer, page, "pattern-sample.png", "noise");

    // ── 1. NO PATTERN YET is a stated refusal, not a silent no-op — for
    //    both consumers of the pattern. ──
    await designer.runCommand(CMD.fillPattern);
    await expect
      .poll(() => statusText(page), { timeout: 10_000 })
      .toContain("No pattern defined");
    await designer.runCommand(CMD.shapeBlur);
    await expect
      .poll(() => statusText(page), { timeout: 10_000 })
      .toContain("Shape blur uses the defined pattern as its shape");

    // ── 2. DEFINE — a CPU window copy; with no selection it takes the
    //    whole image, and the panel reports the captured size. ──
    await expect(page.locator("[data-image-pattern-size]")).toHaveText("none");
    await designer.runCommand(CMD.definePattern);
    await expect(page.locator("[data-image-pattern-size]")).toHaveText("96×96", {
      timeout: 10_000,
    });
    expect(await statusText(page)).toContain("from the whole image");

    if (!(await designer.gpuActive())) {
      await designer.runCommand(CMD.fillPattern);
      await expect
        .poll(() => statusText(page), { timeout: 10_000 })
        .toContain("Pattern fill is a GPU-only kernel");
      await designer.runCommand(CMD.shapeBlur);
      await expect
        .poll(() => statusText(page), { timeout: 10_000 })
        .toContain("Shape blur is a GPU-only kernel");
      test.skip(
        true,
        "pattern fill and shape blur are GPU kernels (no CPU path); define + both refusals ran on this lane. Run `pnpm --filter paged-canvas test:journeys:gpu` for the pixels",
      );
    }

    // ── 3. FILL — the pattern is the image itself, so filling the
    //    unchanged image would be an identity. Flip it first: the fill
    //    must then CHANGE the page, and change it back to the original. ──
    const original = await compositeBaseline(designer, page, empty);
    await designer.runCommand(CMD.flipHorizontal);
    await designer.expectRenderChangesFrom(original, { timeout: 20_000 });
    const flipped = await settledRender(designer, page);
    await designer.runCommand(CMD.fillPattern);
    await expect
      .poll(() => statusText(page), { timeout: 20_000 })
      .toContain("Pattern fill applied");
    await designer.expectRenderChangesFrom(flipped, { timeout: 20_000 });
    const filled = await settledRender(designer, page);
    await designer.expectRenderStable(original, filled, 64);

    // ── 4. SHAPE BLUR — the pattern's alpha as the kernel's footprint;
    //    on noise any real blur moves most pixels. ──
    await designer.runCommand(CMD.shapeBlur);
    await expect
      .poll(() => statusText(page), { timeout: 20_000 })
      .toContain("Shape blur applied");
    await designer.expectRenderChangesFrom(filled, { timeout: 20_000 });
  });

  test("converting the active layer to a smart object changes its kind and no pixel @feat:image.layers.smart-objects @feat:image.editor.layers @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    const { empty } = await ingest(designer, page, "smart-sample.png", "gradient");
    const gpu = await designer.gpuActive();
    const before = gpu ? await compositeBaseline(designer, page, empty) : null;

    await expect.poll(() => layerKind(page), { timeout: 15_000 }).toBe("pixels");
    await designer.runCommand(CMD.convertLayerToSmart);
    await expect.poll(() => layerKind(page), { timeout: 15_000 }).toBe("smart");
    // Converting twice is not offered: the control disables itself.
    await expect(page.locator("[data-image-make-smart]")).toBeDisabled();

    // "Converting alone changes no pixel" — the render must not move.
    if (before) {
      await page.waitForTimeout(1_500);
      await designer.expectRenderStable(before, await designer.renderBytes());
    }
  });

  test("a reveal-all mask becomes the paint target, and the M toggle hands it back to the pixels @feat:image.editor.mask-painting @feat:image.editor.layers @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    const { empty } = await ingest(designer, page, "mask-sample.png", "gradient");
    const gpu = await designer.gpuActive();
    const before = gpu ? await compositeBaseline(designer, page, empty) : null;

    expect(await editTarget(page), "no mask, no edit-target toggle").toBeNull();
    await designer.runCommand(CMD.addLayerMask);
    // Mask creation is layer-graph state: the row grows its M toggle on
    // both lanes, and the new mask IS the target.
    await expect.poll(() => editTarget(page), { timeout: 15_000 }).toBe("mask");
    await expect(page.locator("[data-image-layer-mask]").first()).toBeChecked();

    // Reveal-all is the identity mask: the page must not move.
    if (before) {
      await expect
        .poll(() => statusText(page), { timeout: 15_000 })
        .toContain("Added a reveal-all mask");
      await page.waitForTimeout(1_500);
      await designer.expectRenderStable(before, await designer.renderBytes());
    }

    // The Pixels/Mask toggle: one click back to painting the pixels.
    await page.locator("[data-image-layer-edit-target]").first().click();
    await expect.poll(() => editTarget(page), { timeout: 10_000 }).toBe("pixels");
    await page.locator("[data-image-layer-edit-target]").first().click();
    await expect.poll(() => editTarget(page), { timeout: 10_000 }).toBe("mask");
  });

  test("a hide-all mask hides the layer, and erasing the mask paints it back in @feat:image.editor.mask-painting @feat:image.editor.paint @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(4 * 60_000);
    const designer = new Designer(page);
    const { empty } = await ingest(designer, page, "hide-sample.png", "gradient");
    const gpu = await designer.gpuActive();
    const shown = gpu ? await compositeBaseline(designer, page, empty) : null;

    await designer.runCommand(CMD.addLayerMaskHideAll);
    await expect.poll(() => editTarget(page), { timeout: 15_000 }).toBe("mask");

    if (!gpu) {
      test.skip(
        true,
        "hiding the layer is a re-composite and painting the mask is a GPU stroke (no CPU path); the mask + edit-target half ran on this lane. Run `pnpm --filter paged-canvas test:journeys:gpu`",
      );
    }

    // ── 1. HIDE ALL — the only layer disappears from the page. ──
    await expect
      .poll(() => statusText(page), { timeout: 15_000 })
      .toContain("hide-all mask");
    await designer.expectRenderChangesFrom(shown!, { timeout: 20_000 });
    const hidden = await settledRender(designer, page);

    // ── 2. PAINT THE MASK — with the mask as the target the eraser
    //    REVEALS; a stroke across the frame brings part of the image back.
    //    A stroke that landed on the pixels instead would change nothing
    //    visible, because the mask still hides them. ──
    const depth = await undoDepth(page);
    await armTool(designer, ERASER);
    await dragPt(page, [
      [FRAME.x0 + 60, FRAME.y0 + 60],
      [FRAME.x0 + 100, FRAME.y0 + 90],
      [FRAME.x0 + 140, FRAME.y0 + 70],
      [FRAME.x0 + 180, FRAME.y0 + 100],
      [FRAME.x0 + 210, FRAME.y0 + 80],
    ]);
    await expect
      .poll(() => undoDepth(page), { timeout: 20_000, message: "the mask stroke is journaled" })
      .toBeGreaterThan(depth);
    await designer.expectRenderChangesFrom(hidden, { timeout: 20_000 });
    // The edit target survived the stroke.
    expect(await editTarget(page)).toBe("mask");
  });
});
