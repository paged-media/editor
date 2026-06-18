// Journey: paged.image CROP — the on-canvas crop + straighten tool reaching
// the page. A designer imports a real PNG (the K-2 raster importer →
// engine decode), composites it in-frame (Stage-A Apply), arms the crop
// TOOL (media.paged.image.tool.crop, the "c" shortcut / transform rail),
// constrains the crop to a sub-region via the panel Aspect lock, then
// COMMITS the crop (the commitCrop command / "Apply crop" button) — the
// engine windows the source buffer (geom.crop, image.kernel.family-t2) and
// re-composites the cropped pixels in-frame. The page render must change.
//
// GPU-GATED: paged.image's adjust + composite kernels are WGSL compute with
// NO CPU fallback, so the cropped re-composite (engine.adjust on the Apply)
// only runs on the real-Chrome WebGPU lane (journeys-gpu). On the CPU lane
// the test skips with a note. The crop GEOMETRY itself is leaf-pure Rust
// (image-core::crop, property-tested in plugin-image); this journey proves
// the editor SURFACE — tool activate + aspect lock + commit → rendered cut.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";

const ADJ_PANEL = "media.paged.image.panel.adjustments";
const CROP_TOOL = "media.paged.image.tool.crop";

/** The adjustments panel's Source readout (`name W×H` once decoded) — the
 *  proof the real PNG decoded into the session, and (after a crop) the new
 *  dimensions, the proof the engine windowed the buffer. */
async function sourceReadout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? spans[i + 1]?.textContent ?? "?" : "Source row not found";
  });
}

const invoke = (page: Page, id: string) =>
  page.evaluate(
    (cmd) =>
      (
        globalThis as unknown as {
          __canvas: { registries: { commands: { invoke: (c: string) => Promise<unknown> } } };
        }
      ).__canvas.registries.commands.invoke(cmd),
    id,
  );

const activeTool = (page: Page) =>
  page.evaluate(
    () => (globalThis as unknown as { __canvas: { activeTool?: string | null } }).__canvas.activeTool ?? null,
  );

test.describe("journey · paged.image crop", () => {
  test("a designer imports an image, crops it with the crop tool + aspect lock, and the cropped composite renders @feat:image.editor.crop @feat:image.editor.ingest @feat:image.editor.decode-pool @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // The crop COMMIT re-composites through the GPU adjust path (Stage-A),
    // which is GPU-only — skip-with-note on the CPU fallback lane.
    if (!(await designer.gpuActive())) {
      test.skip(
        true,
        "paged.image kernels are GPU-only (no CPU path) — crop re-composite render-verified on the journeys-gpu lane",
      );
    }

    // A target frame for the composite (a non-square frame so the aspect-
    // locked crop is a genuine sub-region, not a near-identity).
    const frame = await designer.drawRectangle({ x0: 80, y0: 110, x1: 380, y1: 300 });
    expect(frame, "drew a target frame").not.toBe("");
    await designer.selectElement("rectangle", frame);

    // ── 1. IMPORT — drive the K-2 raster importer with a REAL PNG (a wide
    //    image so the crop visibly windows it). The decode runs through the
    //    K-3 decode pool (image.editor.decode-pool — boots on first ingest).
    //    The panel Source readout proves the engine decoded it. HARD. ──
    const importer = await designer.importImage({
      name: "crop-sample.png",
      width: 160,
      height: 90,
    });
    expect(importer, "the raster importer resolved + ran").toContain(
      "media.paged.image.importer.raster",
    );
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("crop-sample.png 160×90"));

    // ── 2. APPLY — composite the un-cropped image in-frame (Stage-A), so
    //    there is a baseline composite on the page to crop against. HARD. ──
    const beforeComposite = await designer.renderBytes();
    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeEnabled({ timeout: 10_000 });
    await applyBtn.click();
    const afterComposite = await designer.renderBytes();
    await designer.expectRenderChanged(beforeComposite, afterComposite);

    // ── 3. CROP TOOL — arm the crop tool the way a designer does (the
    //    transform-rail tool / "c" shortcut). The plugin tool registers its
    //    activation command (paged.tool.activate.<id> → tool.setBaseTool);
    //    invoke it the way the rail click / shortcut does. NOTE: the legacy
    //    `__canvas.activeTool` mirror only surfaces the canvas spine's
    //    built-in select/text keys (it is NOT the registry id for a plugin
    //    tool — see workflow-mode.spec), so the HARD proof of crop is the
    //    rendered EFFECT (steps 4–5), not that mirror. We still invoke the
    //    activation to exercise the contributed-tool wiring. ──
    await invoke(page, `paged.tool.activate.${CROP_TOOL}`).catch(() => {});
    // Record the legacy mirror for the trace (informational, not asserted).
    // eslint-disable-next-line no-console
    console.log(`[journey] crop tool armed; legacy activeTool=${await activeTool(page)}`);

    // ── 4. CONSTRAIN — set a 1:1 aspect lock in the panel. The crop machine
    //    re-imposes the ratio on the rect (cropApplyDrag from the BR grip),
    //    snapping the full 160×90 rect down to a 90×90 sub-region — a
    //    genuine crop window, not the identity. HARD. ──
    const aspect = page.locator("#pg-image-aspect");
    await expect(aspect).toBeEnabled({ timeout: 10_000 });
    await aspect.selectOption("1:1");

    // ── 5. COMMIT — Apply crop (the commitCrop command, surfaced as the
    //    panel button). The engine windows the buffer via geom.crop, swaps
    //    the engine source to the cropped result, recomputes the histogram,
    //    and re-composites the cropped pixels in-frame. The Source readout
    //    must report the NEW (square) dimensions and the page render must
    //    change from the un-cropped composite. HARD. ──
    const beforeCrop = await designer.renderBytes();
    const cropBtn = page.getByRole("button", { name: "Apply crop", exact: true });
    await expect(cropBtn).toBeEnabled();
    await cropBtn.click();

    // The cropped source is square (90×90 windowed out of 160×90).
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("90×90"));

    const afterCrop = await designer.renderBytes();
    const recut = await designer.expectRenderChanged(beforeCrop, afterCrop);
    expect(
      recut,
      "the cropped image re-composited in-frame (geom.crop window → Stage-A)",
    ).toBeGreaterThan(64);
  });
});
