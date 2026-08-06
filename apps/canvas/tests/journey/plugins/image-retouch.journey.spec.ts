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

// Journey: the RETOUCHING pair — clone stamp and healing brush.
//
// LANE SPLIT, as with the selection journey. The two tools' PIXELS are
// GPU-only (every dab composite is a registered WGSL dispatch and no CPU
// blend path ships), so a pixel assertion here would skip on CI and
// prove nothing. What is NOT GPU-bound is everything around it: that the
// tools are registered and activatable, that alt-click sets the source
// and does not paint, that the panel reports the anchor, and — the part
// worth having a journey for at all — that the healing brush's real
// limit is stated where a designer will read it.
//
// The pixel proofs live on a real adapter in `image-js/src/stroke.rs`,
// including the measurement that separates the two tools: from the same
// source, a heal must land nearer the destination tone than a clone.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

const ADJ_PANEL = "media.paged.image.panel.adjustments";
const CLONE_TOOL = "media.paged.image.tool.clone";
const HEAL_TOOL = "media.paged.image.tool.heal";

async function sourceReadout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? (spans[i + 1]?.textContent ?? "?") : "Source row not found";
  });
}

async function anchor(page: Page): Promise<string | null> {
  const el = page.locator("[data-image-clone-source]");
  if ((await el.count()) === 0) return null;
  return (await el.first().textContent())?.trim() ?? null;
}

test.describe("journey · paged.image retouching", () => {
  test("the clone and heal tools register, and the panel reports no source yet @feat:image.editor.clone-stamp @feat:image.editor.healing-brush @feat:editor-shell.plugin-bundles @level:surface", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const frame = await designer.drawRectangle({
      x0: 90,
      y0: 120,
      x1: 360,
      y1: 320,
    });
    await designer.selectElement("rectangle", frame);
    await designer.importImage({ name: "retouch-sample.png" });
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("retouch-sample.png"));

    // ── 1. BOTH TOOLS EXIST on the rail. A tool that registers but
    //    cannot be activated is the failure a bundle spec cannot see. ──
    for (const id of [CLONE_TOOL, HEAL_TOOL]) {
      await designer.runCommand(`paged.tool.activate.${id}`);
    }

    // ── 2. NO ANCHOR YET is a state with its own text, not a blank. ──
    await expect.poll(() => anchor(page), { timeout: 10_000 }).toBe("not set");

    // ── 3. The limit, stated where the designer is standing. This is the
    //    assertion this journey exists for: a mean match is not a Poisson
    //    solve, and someone healing across a gradient needs to know that
    //    from the panel rather than from a changelog. ──
    const limit = page.locator("[data-image-heal-limit]");
    await expect(limit).toContainText("MEAN tone");
    await expect(limit).toContainText("Poisson");
    await expect(limit).toContainText("still shows a seam");

    // ── 4. And content-aware fill's ABSENCE is stated too, rather than
    //    offered as a button that would smear. ──
    await expect(
      page.getByText("Content-aware fill is not offered"),
    ).toBeVisible();
  });

  test("alt-click sets the clone source without painting @feat:image.editor.clone-stamp @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const frame = await designer.drawRectangle({
      x0: 90,
      y0: 120,
      x1: 360,
      y1: 320,
    });
    await designer.selectElement("rectangle", frame);
    await designer.importImage({ name: "anchor-sample.png" });
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("anchor-sample.png"));

    await designer.runCommand(`paged.tool.activate.${CLONE_TOOL}`);
    await expect.poll(() => anchor(page), { timeout: 10_000 }).toBe("not set");

    // Alt-click inside the frame. The anchor is engine-independent
    // state, so this runs on BOTH lanes — and the assertion that it did
    // NOT start a stroke is the one that matters: painting the anchor
    // click is the single thing a retoucher never wants.
    const box = await page.locator("canvas").first().boundingBox();
    expect(box, "the canvas is on screen").not.toBeNull();
    await page.keyboard.down("Alt");
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.keyboard.up("Alt");

    await expect
      .poll(() => anchor(page), { timeout: 10_000 })
      .not.toBe("not set");
    // A stroke would have raised the in-progress readout; there is none.
    await expect(page.locator("[data-image-brush-stats]")).toHaveCount(0);
  });
});
