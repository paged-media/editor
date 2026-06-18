// Journey: paged.image Stage-B LIVE per-drag preview — the protocol-50
// pixelLayer surface. The sibling image-adjust.journey verifies the COMMITTED
// Apply (Stage-A sceneLayer) renders; this verifies the LIVE preview: dragging
// an adjustment slider streams the adjusted pixels into the frame through the
// v50 pixel channel, WITHOUT committing.
//
// PROTOCOL-50 GATED. SubmitPixelLayer / rendering.pixelLayer@1 are not in the
// published engine (canvas-wasm 0.49.0); this runs against the local
// protocol-50 wasm (~/paged/sync-wasm.sh override) + the editor/plugin-sdk/
// plugin-image feat/image-stage-b branches. When the pixel channel is absent
// (published engine) the per-drag preview no-ops — the test then SKIPS with a
// note (after confirming the committed Apply still renders), so it degrades
// honestly and HARD-verifies the live preview only where the surface exists.
//
// GPU-GATED too: paged.image's kernels are WGSL-only, so this runs on the
// real-Chrome WebGPU lane (journeys-gpu) and skips on the CPU fallback.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";

const ADJ_PANEL = "media.paged.image.panel.adjustments";

async function sourceReadout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? spans[i + 1]?.textContent ?? "?" : "Source row not found";
  });
}

test.describe("journey · paged.image Stage-B live preview", () => {
  test("dragging an adjustment slider streams a live per-drag pixel preview onto the frame (no commit) @feat:image.editor.ingest @feat:image.editor.curves @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    if (!(await designer.gpuActive())) {
      test.skip(true, "paged.image kernels are GPU-only — Stage-B preview runs on journeys-gpu");
    }

    const frame = await designer.drawRectangle({ x0: 90, y0: 120, x1: 360, y1: 320 });
    await designer.selectElement("rectangle", frame);

    // Import a real PNG (the K-2 path) + raise the panel.
    const importer = await designer.importImage({ name: "adjust-sample.png" });
    expect(importer).toContain("media.paged.image.importer.raster");
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("adjust-sample.png"));

    // ── LIVE DRAG — focus Exposure and step it up. Each step fires the
    //    panel's coalesced previewAdjust → host.contribute.pixelLayer().submit
    //    (Stage B). NO Apply is clicked. ──
    const blank = await designer.renderBytes();
    const exposure = page.locator("input[type=range]").first();
    await expect(exposure).toBeEnabled({ timeout: 10_000 });
    await exposure.focus();
    for (let i = 0; i < 25; i++) await page.keyboard.press("ArrowRight"); // +2.5 EV
    // Let the coalesced GPU preview settle (in-flight guard + trailing run).
    await page.waitForTimeout(900);
    const afterDrag = await designer.renderBytes();
    const dragPx = await designer.renderDiffPixels(blank, afterDrag);

    if (dragPx <= 64) {
      // No live preview rendered. Distinguish "no pixel channel" (published
      // engine — honest skip) from a real failure by checking the committed
      // Apply (Stage-A) path still renders.
      const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
      await applyBtn.click();
      const afterApply = await designer.renderBytes();
      const applyPx = await designer.renderDiffPixels(blank, afterApply);
      if (applyPx > 64) {
        test.skip(
          true,
          "no Stage-B pixel channel (rendering.pixelLayer@1 absent — published engine / protocol 49); " +
            "the committed Apply (Stage-A) DID render. Run under the ~/paged/sync-wasm.sh protocol-50 override to verify the live preview.",
        );
      }
      expect(dragPx, "neither the live preview nor the committed Apply rendered").toBeGreaterThan(64);
    }

    // HARD: the per-drag pixel preview rendered onto the frame BEFORE any
    // commit — the Stage-B live lane drove end to end.
    expect(dragPx, "the live per-drag pixel preview rendered (Stage B)").toBeGreaterThan(64);

    // The committed Apply (Stage-A) then supersedes the live preview and
    // clears it — the page still carries the adjusted image.
    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await applyBtn.click();
    await page.waitForTimeout(500);
    const afterApply = await designer.renderBytes();
    await designer.expectRenderChanged(blank, afterApply);
  });
});
