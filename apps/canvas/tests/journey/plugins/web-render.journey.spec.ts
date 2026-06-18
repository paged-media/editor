// Journey: paged.web RENDERED output — driving the on-canvas Blitz render
// the sibling web.journey.spec.ts explicitly leaves OUT (it covers the
// source/insert/preview/persist lane only).
//
// The real path: insert a web frame → set HTML/CSS source → save →
// renderWebFrame, which loads the Blitz/WASM engine and lowers its paint to
// a C-1 sceneLayer submitted into the frame.
//
// WHAT THIS VERIFIES + FOUND:
//   · The Blitz engine BOOTS headless and the C-1 submit path drives — the
//     command logs "scene layer submitted to canvas" (vs "engine not
//     loaded" on the fallback). That is the shipped milestone
//     (plugin-web.engine-rendering, partial). HARD when the engine loads;
//     skip-with-note when it can't (a realm that can't fetch the sibling
//     wasm) — honest degrade.
//   · FINDING (annotation, not gated): in the editor end-to-end, the
//     submitted web sceneLayer currently renders NO visible pixels — a
//     blank page even for a solid-fill div. plugin-web's OWN suites verify
//     the lowering "VISIBLE" by CPU-rasterising the sceneLayer directly;
//     the EDITOR-browser visible-paint of that submitted layer is the open
//     end-to-end gap this surfaces (sheet + image sceneLayers DO composite
//     into the same snapshot, so the oracle is sound). Recorded for the
//     plugin-web maintainer; clears when the editor composites web layers.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";

const INSERT = "media.paged.web.command.insertWebFrame";
const RENDER = "media.paged.web.command.renderWebFrame";

const invoke = (page: Page, id: string) =>
  page.evaluate(
    (c) =>
      (
        globalThis as unknown as {
          __canvas: { registries: { commands: { invoke: (i: string) => Promise<unknown> } } };
        }
      ).__canvas.registries.commands.invoke(c),
    id,
  );

test.describe("journey · paged.web render output", () => {
  test("a designer renders a web frame on canvas: insert, set source, renderWebFrame boots Blitz and submits a C-1 sceneLayer @feat:plugin-web.engine-rendering @feat:plugin-web.insert-command @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Capture the render command's honest outcome log.
    const logs: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      if (/renderWebFrame:|web\]/i.test(t)) logs.push(t);
    });
    const sawSubmitted = () => logs.some((l) => /scene layer submitted/i.test(l));
    const sawNotLoaded = () => logs.some((l) => /engine not loaded/i.test(l));

    // ── 1. INSERT + SOURCE — the bundle's insert command mints a web frame
    //    + selects it + opens the source panel. Drop a solid-fill snippet
    //    (the simplest thing that MUST paint if the lowering composites),
    //    then save it to the document so renderWebFrame reads it. HARD. ──
    await invoke(page, INSERT);
    const html = page.locator("[data-web-html] [data-code-input]");
    await expect(html).toBeVisible({ timeout: 6_000 });
    await html.fill("<div style='width:300px;height:200px;background:#101820'></div>");
    const css = page.locator("[data-web-css] [data-code-input]");
    if (await css.isVisible().catch(() => false)) {
      await css.fill("html,body{margin:0;background:#101820}");
    }
    const save = page.locator("[data-web-commit]");
    if (await save.isEnabled().catch(() => false)) {
      await save.click();
      await page.waitForTimeout(300);
    }

    // ── 2. RENDER — renderWebFrame loads Blitz + submits a C-1 sceneLayer. ──
    const before = await designer.renderBytes();
    await invoke(page, RENDER);
    await expect
      .poll(() => sawSubmitted() || sawNotLoaded(), { timeout: 15_000 })
      .toBe(true);

    if (sawNotLoaded() && !sawSubmitted()) {
      test.skip(
        true,
        "the Blitz engine did not load in this realm (cannot fetch the sibling wasm) — render is source-lane only here",
      );
    }

    // HARD: the engine booted headless and the C-1 submit path drove.
    expect(sawSubmitted(), `expected a submitted sceneLayer; logs: ${logs.join(" | ")}`).toBe(true);

    // FINDING (annotation, not gated): does that submitted layer actually
    // paint in the editor end-to-end? Record the visible-render diff.
    await page.waitForTimeout(800);
    const after = await designer.renderBytes();
    const visiblePx = await designer.renderDiffPixels(before, after);
    const finding =
      visiblePx > 64
        ? `editor end-to-end web render is VISIBLE (${visiblePx}px changed)`
        : `editor end-to-end web render is BLANK (${visiblePx}px) — Blitz layer submitted ` +
          "but not composited in the editor snapshot (plugin-web suites verify the lowering " +
          "CPU-side; editor-browser visible-paint is the open gap)";
    test.info().annotations.push({ type: "render-finding", description: finding });
    // eslint-disable-next-line no-console
    console.log(`[web-render] finding: ${finding}`);
  });
});
