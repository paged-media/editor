// Journey: paged.image LEVELS / CURVES / WHITE-BALANCE — the tone panel
// reaching the page. A designer imports a real PNG (K-2 importer → engine
// decode → the histogram readout), then drives the panel's tone controls —
// the Levels sliders (In black / Gamma / In white), the White-balance
// sliders (Temp / Tint), and the SVG Curves control-point editor — and
// clicks Apply (the C-1 Stage-A composite re-submits the adjusted RGBA
// in-frame). Each committed adjustment must change the page render.
//
// This is the dedicated levels/curves/WB journey: image-adjust.journey
// drives Exposure (the base tone lane); THIS drives the Phase-6 panel —
// the levels stage (adjust.levels), the white-balance stage
// (adjust.white_balance), and the curves LUT pass — through their real
// controls, the editor surface for image.editor.curves +
// image.reduce.statistics (the histogram readout the panel renders).
//
// GPU-GATED: the levels / WB / curve-LUT adjust runs through the GPU-only
// WGSL kernels (no CPU fallback), so the composite is verified on the
// real-Chrome WebGPU lane (journeys-gpu); skip-with-note on the CPU lane.

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

/** Drive a real range input by index in DOM order (the panel renders the
 *  sliders in a fixed order): focus + ArrowRight × n = genuine keyboard
 *  input through the real <input type=range> onChange, the way a designer
 *  nudges a slider. */
async function nudgeSlider(page: Page, index: number, steps: number): Promise<void> {
  const slider = page.locator("input[type=range]").nth(index);
  await expect(slider).toBeEnabled({ timeout: 10_000 });
  await slider.focus();
  for (let i = 0; i < steps; i++) await page.keyboard.press("ArrowRight");
}

// Panel slider DOM order (image-panel.tsx): 0 Exposure, 1 Brightness,
// 2 Contrast, 3 Saturation, 4 Temp, 5 Tint, 6 In black, 7 Gamma,
// 8 In white, 9 Out black, 10 Out white, 11 Straighten°.
const SLIDER = {
  temp: 4,
  tint: 5,
  inBlack: 6,
  gamma: 7,
  inWhite: 8,
} as const;

test.describe("journey · paged.image levels / curves / white balance", () => {
  test("a designer drives the levels, white-balance, and curves controls and each committed adjustment renders @feat:image.editor.curves @feat:image.reduce.statistics @feat:image.editor.ingest @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    if (!(await designer.gpuActive())) {
      test.skip(
        true,
        "paged.image kernels are GPU-only (no CPU path) — levels/curves/WB render-verified on the journeys-gpu lane",
      );
    }

    const frame = await designer.drawRectangle({ x0: 90, y0: 120, x1: 360, y1: 320 });
    expect(frame, "drew a target frame").not.toBe("");
    await designer.selectElement("rectangle", frame);

    // ── 1. IMPORT — the K-2 raster importer with a REAL PNG. The panel
    //    Source readout proves the engine decoded it; the histogram (the
    //    image.reduce.statistics readout) is the levels/curves panel view. ──
    const importer = await designer.importImage({ name: "curves-sample.png" });
    expect(importer, "the raster importer resolved + ran").toContain(
      "media.paged.image.importer.raster",
    );
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("curves-sample.png"));

    // The histogram SVG renders once an image is ingested (the panel's
    // image.reduce.statistics readout — RGB + luma over the decoded pixels).
    await expect(
      page.locator('svg[aria-label="RGB and luma histogram"]'),
      "the histogram readout rendered from the engine statistics",
    ).toBeVisible({ timeout: 10_000 });

    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });

    // ── 2. WHITE BALANCE — push Temp + Tint (adjust.white_balance per-channel
    //    von-Kries gains) and Apply. The page must change. HARD. ──
    const beforeWb = await designer.renderBytes();
    await nudgeSlider(page, SLIDER.temp, 15); // +0.30 temp
    await nudgeSlider(page, SLIDER.tint, 10); // +0.20 tint
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();
    const afterWb = await designer.renderBytes();
    await designer.expectRenderChanged(
      beforeWb,
      afterWb,
    );

    // ── 3. LEVELS — pull In black up, In white down, lift Gamma
    //    (adjust.levels) and Apply. The page must change again. HARD. ──
    const beforeLevels = await designer.renderBytes();
    await nudgeSlider(page, SLIDER.inBlack, 20); // +0.20 in-black
    await nudgeSlider(page, SLIDER.gamma, 10); // +0.50 gamma
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();
    const afterLevels = await designer.renderBytes();
    await designer.expectRenderChanged(
      beforeLevels,
      afterLevels,
    );

    // ── 4. CURVES — drag the SVG curve editor's mid control point up (the
    //    monotone-cubic LUT the curves stage consumes) and Apply. Dragging
    //    the mid point off the identity diagonal builds a non-identity LUT,
    //    so the composite must change. The editor uses React pointer events
    //    with setPointerCapture on the circle, so dispatch a real pointer
    //    down (on the circle) → moves (on the SVG body, the move handler) →
    //    up sequence. HARD. ──
    const curve = page.locator('svg[aria-label="Tone curve editor"]');
    await curve.scrollIntoViewIfNeeded();
    await expect(curve).toBeVisible({ timeout: 10_000 });
    const midPoint = curve.locator("circle").nth(1); // the (0.5,0.5) mid point
    const box = await midPoint.boundingBox();
    expect(box, "the curve mid control point is hittable").not.toBeNull();
    const beforeCurve = await designer.renderBytes();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      // Several intermediate moves so the SVG's onPointerMove rebuilds the
      // curve points well off the identity diagonal (brighten the mids).
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(cx, cy - i * 6);
      }
      await page.mouse.up();
    }
    // The mid point moved off (0.5,0.5) ⇒ the session built a non-identity
    // curve LUT (the panel forwards control points → engine.curveLut).
    const curveLutSet = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll("circle"));
      // The mid control point's cy should now sit above the identity centre.
      const svg = document.querySelector('svg[aria-label="Tone curve editor"]');
      const circles = svg ? Array.from(svg.querySelectorAll("circle")) : spans;
      const mid = circles[1] as SVGCircleElement | undefined;
      const cy = mid ? Number(mid.getAttribute("cy")) : 70;
      return cy < 68; // identity mid sits at cy≈70 (1-0.5)*140; lifted ⇒ smaller
    });
    expect(curveLutSet, "the curve mid control point moved off identity").toBe(true);

    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();
    const afterCurve = await designer.renderBytes();
    const curved = await designer.expectRenderChanged(
      beforeCurve,
      afterCurve,
    );
    expect(
      curved,
      "the curve LUT pass changed the composited pixels",
    ).toBeGreaterThan(64);
  });

  // AUTO-ENHANCE — its OWN test (independent of the flaky curve-drag step
  // above), so its evidence stands alone. The finding: the kernel
  // image_auto_enhance_params shipped but had NO editor surface; it is now
  // wired (engine.autoEnhanceParams facade → session.autoEnhance →
  // "Auto-enhance" panel button + the autoEnhance command). It reads the
  // histogram for auto-levels + a gray-world white balance and fills the
  // Levels + WB sliders (preview-only, like every edit); Apply composites it.
  test("a designer clicks Auto-enhance and the histogram-derived levels + white balance composite @feat:image.editor.auto-enhance @feat:image.reduce.statistics @feat:image.editor.ingest @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    if (!(await designer.gpuActive())) {
      test.skip(
        true,
        "paged.image kernels are GPU-only (no CPU path) — auto-enhance render-verified on the journeys-gpu lane",
      );
    }

    const frame = await designer.drawRectangle({ x0: 90, y0: 120, x1: 360, y1: 320 });
    await designer.selectElement("rectangle", frame);
    const importer = await designer.importImage({ name: "auto-sample.png" });
    expect(importer, "the raster importer resolved + ran").toContain(
      "media.paged.image.importer.raster",
    );
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("auto-sample.png"));
    await expect(
      page.locator('svg[aria-label="RGB and luma histogram"]'),
    ).toBeVisible({ timeout: 10_000 });

    // HARD: the wired affordance exists + is enabled, the auto white point
    // flows from the kernel into the In white slider (identity 1 → below 1
    // for this full-range gradient), and Apply composites the change.
    const autoBtn = page.locator("[data-image-auto-enhance]");
    await expect(autoBtn, "the Auto-enhance affordance is wired + enabled").toBeEnabled({
      timeout: 6_000,
    });
    const beforeAuto = await designer.renderBytes();
    await autoBtn.click();
    await page.waitForTimeout(200);
    const inWhiteVal = await page
      .locator("input[type=range]")
      .nth(SLIDER.inWhite)
      .inputValue();
    expect(
      Number(inWhiteVal),
      "auto-enhance populated the In white point from the histogram",
    ).toBeLessThan(1);
    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();
    const afterAuto = await designer.renderBytes();
    await designer.expectRenderChanged(beforeAuto, afterAuto);
  });
});
