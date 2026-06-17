// Journey: the WebGPU render backend actually engages.
//
// Runs ONLY in the `journeys-gpu` project (real Chrome, new headless, WebGPU
// enabled). The worker's `initGpu` claims the OffscreenCanvas's WebGPU context
// and wires the present path; success surfaces as `attachReady.gpuActive`,
// mirrored onto `__canvas.gpuActive`. Asserting it is true proves the Vello/
// WebGPU backend ran — not the CPU/tiny-skia fallback every other journey
// exercises. (The deterministic CPU snapshot path stays the assertion engine
// for content; this one is purely about which renderer claimed the canvas.)

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · GPU backend", () => {
  test("the WebGPU/Vello backend claims the canvas @feat:the-renderer.gpu-backend @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Sanity: the browser exposes WebGPU at all (the lane's whole premise).
    const hasGpu = await page.evaluate(() => "gpu" in navigator);
    expect(hasGpu, "navigator.gpu present (real Chrome + WebGPU flags)").toBe(true);

    // The worker attaches and reports its backend; gpuActive flips from null
    // (not attached) to true (GPU) / false (CPU fallback). Poll until known.
    const gpuActive = await page
      .waitForFunction(
        () => {
          const v = (
            globalThis as unknown as { __canvas?: { gpuActive?: boolean | null } }
          ).__canvas?.gpuActive;
          return v === true || v === false ? { v } : null;
        },
        null,
        { timeout: 20_000 },
      )
      .then((h) => h.jsonValue() as Promise<{ v: boolean }>);

    expect(gpuActive.v, "the WebGPU backend engaged (not CPU fallback)").toBe(true);
  });
});
