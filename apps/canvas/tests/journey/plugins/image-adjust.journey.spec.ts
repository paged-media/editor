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

// Journey: paged.image RENDERED output — the real raster pipeline reaching
// the page. The sibling image.journey.spec.ts is @smoke: a SYNTHETIC
// placement that can't feed a real ingest, so it asserts plumbing (commands
// invoke, the panel mounts) and never the pixels. This drives the REAL path
// a designer hits and asserts the result renders:
//
//   import a real PNG through the K-2 importer (host registry → bundle
//   decode) → adjust it (exposure, the GPU-only WGSL kernels) → Apply
//   (C-1 Stage-A sceneLayer composite) → the page, blank before, now carries
//   the adjusted image.
//
// GPU-GATED: paged.image's kernels are WGSL compute with NO CPU fallback
// (engine is GPU-only by design), so the adjust + composite only run on the
// real-Chrome WebGPU lane (journeys-gpu). On the bundled-Chromium CPU lane
// the test skips with a note rather than asserting a path the engine cannot
// take headless.
//
// Stage-B per-drag PREVIEW (a live pixelLayer while dragging a slider) is a
// protocol-50 surface (SubmitPixelLayer) not in the published engine; it is
// verified separately on the feat/image-stage-b branch under the local v50
// override. This journey proves the COMMITTED Apply (Stage-A) renders on the
// published engine.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";

const ADJ_PANEL = "media.paged.image.panel.adjustments";

/** The adjustments panel's "Source" readout (`name W×H` once decoded, else
 *  "none") — the proof the real PNG decoded into the session. */
async function sourceReadout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? spans[i + 1]?.textContent ?? "?" : "Source row not found";
  });
}

test.describe("journey · paged.image render output", () => {
  test("a designer imports a real image, adjusts it, and Apply composites the adjusted pixels onto the page @feat:image.editor.ingest @feat:image.editor.curves @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // paged.image's adjustment kernels are GPU-only — skip-with-note on the
    // CPU fallback lane (the host-integration plumbing is covered by the
    // @smoke image.journey; pixels need the journeys-gpu lane).
    if (!(await designer.gpuActive())) {
      test.skip(
        true,
        "paged.image kernels are GPU-only (no CPU path) — render-verified on the journeys-gpu lane",
      );
    }

    // A target frame for the composite.
    const frame = await designer.drawRectangle({ x0: 90, y0: 120, x1: 360, y1: 320 });
    expect(frame, "drew a target frame").not.toBe("");
    await designer.selectElement("rectangle", frame);

    // ── 1. IMPORT — drive the K-2 raster importer with a REAL PNG (the host
    //    registry routes it to the bundle's decode). The panel's Source
    //    readout proves the engine decoded it. HARD. ──
    const importer = await designer.importImage({ name: "adjust-sample.png" });
    expect(importer, "the raster importer resolved + ran").toContain(
      "media.paged.image.importer.raster",
    );
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("adjust-sample.png"));

    // ── 2. ADJUST + APPLY — push Exposure up (real slider input → the GPU
    //    kernels) and click Apply (the C-1 Stage-A composite re-submits the
    //    adjusted RGBA as an in-frame sceneLayer). The page, blank before,
    //    must now carry the adjusted image. HARD. ──
    const beforeApply = await designer.renderBytes();

    const exposure = page.locator("input[type=range]").first();
    await expect(exposure).toBeEnabled({ timeout: 10_000 });
    await exposure.focus();
    for (let i = 0; i < 25; i++) await page.keyboard.press("ArrowRight"); // +2.5 EV

    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();

    const composited = await designer.expectRenderChangesFrom(beforeApply);
    expect(
      composited,
      "the adjusted image composited onto the frame (real decode → GPU adjust → Stage-A)",
    ).toBeGreaterThan(64);
  });
});
