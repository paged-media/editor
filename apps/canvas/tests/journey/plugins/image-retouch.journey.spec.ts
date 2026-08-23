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
  test("the clone and heal tools register, and the panel reports no source yet @feat:image.editor.clone-stamp @feat:image.editor.healing-brush @feat:editor-shell.plugin-bundles @level:smoke", async ({
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

    // ── 3. What the tool does and where it stops, stated where the
    //    designer is standing. This row used to warn that a mean match
    //    seams across a ramp; the gradient-domain solve removed that
    //    limit and the warning went with it, because keeping it would be
    //    its own kind of lie. What is left is the real edge case. ──
    const limit = page.locator("[data-image-heal-limit]");
    await expect(limit).toContainText("gradient domain");
    await expect(limit).toContainText("follows a ramp");
    await expect(limit).toContainText("falls back to a plain clone");

    // ── 4. CONTENT-AWARE FILL is offered, and disabled until there is
    //    something to fill — a button that did nothing would read as
    //    broken rather than as "select first". ──
    const caf = page.locator("[data-image-content-aware-fill]");
    await expect(caf).toBeVisible();
    await expect(caf).toBeDisabled();
    await expect(page.getByText("select an area first")).toBeVisible();

    // Its two real limits are stated where a retoucher will read them.
    const note = page.locator("[data-image-caf-note]");
    await expect(note).toContainText("copied from real image data");
    await expect(note).toContainText("coarse to fine");

    // With a selection it becomes available — the CPU search needs no
    // device, so this holds on the lane that actually runs in CI.
    await designer.runCommand("media.paged.image.command.selectAll");
    await expect(caf).toBeEnabled({ timeout: 15_000 });
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
