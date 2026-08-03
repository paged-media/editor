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

// Journey: paged.web RENDERED output — driving the on-canvas Blitz render
// the sibling web.journey.spec.ts explicitly leaves OUT (it covers the
// source/insert/preview/persist lane only).
//
// The real path: insert a web frame → set HTML/CSS source → save →
// renderWebFrame, which loads the Blitz/WASM engine and lowers its paint to
// a C-1 sceneLayer submitted into the frame.
//
// WHAT THIS VERIFIES:
//   · The Blitz engine BOOTS headless and the C-1 submit path drives — the
//     command logs "scene layer submitted to canvas" (vs "engine not
//     loaded" on the fallback). That is the shipped milestone
//     (plugin-web.engine-rendering). HARD when the engine loads;
//     skip-with-note when it can't (a realm that can't fetch the sibling
//     wasm) — honest degrade.
//   · The submitted web sceneLayer PAINTS in the editor end-to-end — a
//     solid-fill div lights real pixels in the deterministic snapshot
//     (the same composite path sheet + image scene layers ride). This is a
//     HARD render-diff assertion (no longer an annotation).
//
// HISTORY (WS-A root-cause, fixed): the bake path created a scene-layer
// surface, submitted, then DISPOSED it in a `finally`. The SDK treats
// `dispose()` as releasing the contribution → `clearSceneLayer(id)` for
// every submitted element, so the submit was immediately wiped and the
// frame rendered 0 visible pixels. The fix (plugin-web/web-bundle/bake.ts)
// keeps ONE host-persistent surface (like the sheet session) and never
// disposes it per-bake, so the baked layer persists.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";

const INSERT = "media.paged.web.command.insertWebFrame";
const RENDER = "media.paged.web.command.renderWebFrame";

const invoke = (page: Page, id: string) =>
  page.evaluate(
    (c) =>
      (
        globalThis as unknown as {
          __canvas: {
            registries: {
              commands: { invoke: (i: string) => Promise<unknown> };
            };
          };
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
    const sawSubmitted = () =>
      logs.some((l) => /scene layer submitted/i.test(l));
    const sawNotLoaded = () => logs.some((l) => /engine not loaded/i.test(l));

    // ── 1. INSERT + SOURCE — the bundle's insert command mints a web frame
    //    + selects it + opens the source panel. Drop a solid-fill snippet
    //    (the simplest thing that MUST paint if the lowering composites),
    //    then save it to the document so renderWebFrame reads it. HARD. ──
    await invoke(page, INSERT);
    const html = page.locator("[data-web-html] [data-code-input]");
    await expect(html).toBeVisible({ timeout: 6_000 });
    await html.fill(
      "<div style='width:300px;height:200px;background:#101820'></div>",
    );
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
    expect(
      sawSubmitted(),
      `expected a submitted sceneLayer; logs: ${logs.join(" | ")}`,
    ).toBe(true);

    // ADR-020 READOUT — the render outcome now lands in the source panel
    // (frames submitted / not-loaded, overset, bake deferred counts), not
    // just the log + Problems lane.
    await expect(
      page.locator('[data-web-render-report="renderFrame"]'),
    ).toBeVisible({ timeout: 5_000 });

    // ── 3. VISIBLE PAINT — HARD. The submitted layer must composite into
    //    the deterministic CPU snapshot (the same path sheet + image scene
    //    layers ride). A solid-fill div over a 240×180pt content box lights
    //    tens of thousands of px; `expectRenderChanged`'s 64px floor sits
    //    far below that yet above the snapshot's 0px noise floor. ──
    await page.waitForTimeout(800);
    const after = await designer.renderBytes();
    const visiblePx = await designer.expectRenderChanged(before, after);
    // eslint-disable-next-line no-console
    console.log(
      `[web-render] editor end-to-end web render VISIBLE (${visiblePx}px changed)`,
    );

    // ── 4. NEGATIVE CONTROL — the oracle is sound: re-snapshot with no
    //    further edit and assert the page is STABLE (the deterministic
    //    tiny-skia readback diffs to ~0 for an unchanged page, so the
    //    visible-paint signal above is real, not snapshot jitter). ──
    const again = await designer.renderBytes();
    await designer.expectRenderStable(after, again);
  });
});
