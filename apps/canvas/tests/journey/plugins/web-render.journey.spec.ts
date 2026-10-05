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
//     wasm) — honest degrade — and a FAILURE under REQUIRE_REAL_ENGINE=1.
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
import { words } from "./web-kit";

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
    // The baseline is taken BEFORE the save: a bundle that renders on
    // save (plugin-web's auto render) has already painted by the time
    // renderWebFrame runs, and a re-render of the same layer changes
    // nothing — the oracle is "the web frame painted", not "this command
    // was the first to paint it".
    const before = await designer.renderBytes();
    const save = page.locator("[data-web-commit]");
    if (await save.isEnabled().catch(() => false)) {
      await save.click();
      await page.waitForTimeout(300);
    }

    // ── 2. RENDER — renderWebFrame loads Blitz + submits a C-1 sceneLayer. ──
    await invoke(page, RENDER);
    await expect
      .poll(() => sawSubmitted() || sawNotLoaded(), { timeout: 15_000 })
      .toBe(true);

    if (sawNotLoaded() && !sawSubmitted()) {
      // Under REQUIRE_REAL_ENGINE=1 a missing engine is a FAILURE, not a
      // skip: a lane that is supposed to render must not pass vacuously.
      const reason =
        "the Blitz engine did not load in this realm (cannot fetch the sibling wasm) — render is source-lane only here";
      if (process.env.REQUIRE_REAL_ENGINE === "1") {
        throw new Error(`REQUIRE_REAL_ENGINE=1: ${reason}; logs: ${logs.join(" | ")}`);
      }
      test.skip(true, reason);
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
    const visiblePx = await designer.expectRenderChangesFrom(before);
    // eslint-disable-next-line no-console
    console.log(
      `[web-render] editor end-to-end web render VISIBLE (${visiblePx}px changed)`,
    );

    // ── 4. NEGATIVE CONTROL — the oracle is sound: re-snapshot with no
    //    further edit and assert the page is STABLE (the deterministic
    //    tiny-skia readback diffs to ~0 for an unchanged page, so the
    //    visible-paint signal above is real, not snapshot jitter). ──
    // `expectRenderChangesFrom` above POLLS and returns the changed-pixel
    // count, not the bytes — so the settled frame is re-sampled here to be
    // this control's baseline. (Merging #17's polling helper onto the
    // branch that added this control silently orphaned the old `after`
    // binding: neither side conflicted, and the test tree is outside
    // `tsc -b`, so only the runner caught it.)
    const settled = await designer.renderBytes();
    const again = await designer.renderBytes();
    await designer.expectRenderStable(settled, again);
  });

  // Protocol 68 — the web text reaches the engine as VALUES, not just
  // pixels: each run names its family (the bundle's vendored Inter) and
  // its CSS weight (a <b> run 700, the rest 400); with Inter registered
  // by name the host's report (`fontFallbacks`, returned to the bundle
  // from `SceneLayerSurface.submit`) is empty — nothing drew in a face the
  // run did not ask for. Read at the editor's client, the object the
  // PagedEditor's `sceneLayers.submit` closes over.
  test("a web frame's rendered text carries its face on the wire and nothing falls back when the document registers Inter @feat:plugin-web.engine-rendering @feat:plugin-web.web-fonts @feat:plugin-platform.scene-layer @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Inter BY NAME: the editor's default Inter is the document default
    // font, which the engine counts as a fallback for a run naming it.
    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              registerFont(f: string, b: Uint8Array, s?: string | null): Promise<void>;
            };
          };
        }
      ).__canvas;
      const resp = await fetch("/fonts/Inter.ttf");
      if (!resp.ok) throw new Error(`/fonts/Inter.ttf: ${resp.status}`);
      await c.client.registerFont("Inter", new Uint8Array(await resp.arrayBuffer()), null);
    });

    await page.evaluate(() => {
      type Fn = (...a: unknown[]) => Promise<unknown>;
      const g = globalThis as unknown as {
        __paged: { client: Record<string, Fn> };
        __webFaces: Array<{ items: unknown[]; fontFallbacks: unknown }>;
      };
      g.__webFaces = [];
      const c = g.__paged.client;
      const orig = c.submitSceneLayer.bind(c);
      c.submitSceneLayer = async (...args: unknown[]) => {
        const reply = (await orig(...args)) as { fontFallbacks?: unknown };
        const layer = args[1] as { items?: unknown[] };
        g.__webFaces.push({
          items: (layer.items ?? []).filter(
            (i) => (i as { kind?: string }).kind === "text",
          ),
          fontFallbacks: reply?.fontFallbacks,
        });
        return reply;
      };
    });

    const logs: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      if (/renderWebFrame:/i.test(t)) logs.push(t);
    });

    await invoke(page, INSERT);
    const html = page.locator("[data-web-html] [data-code-input]");
    await expect(html).toBeVisible({ timeout: 6_000 });
    await html.fill(
      "<p style='margin:0;font:400 28px Inter;color:#101820'>Spring <b>line</b> sheet</p>",
    );
    // Baseline before the save, as above (a bundle may render on save).
    const before = await designer.renderBytes();
    const save = page.locator("[data-web-commit]");
    if (await save.isEnabled().catch(() => false)) {
      await save.click();
      await page.waitForTimeout(300);
    }

    await invoke(page, RENDER);
    await expect
      .poll(() => logs.some((l) => /scene layer submitted|engine not loaded/i.test(l)), {
        timeout: 15_000,
      })
      .toBe(true);
    if (!logs.some((l) => /scene layer submitted/i.test(l))) {
      test.skip(true, "the Blitz engine did not load in this realm — no scene text to read");
    }

    type Item = { text?: string; family?: string; weight?: number; italic?: boolean };
    const read = () =>
      page.evaluate(
        () =>
          (
            globalThis as unknown as {
              __webFaces: Array<{ items: unknown[]; fontFallbacks: unknown }>;
            }
          ).__webFaces,
      );
    // The submit that carries the text (an auto render may submit first).
    await expect
      .poll(async () => (await read()).some((s) => s.items.length > 0), { timeout: 10_000 })
      .toBe(true);
    const submits = await read();
    const last = [...submits].reverse().find((s) => s.items.length > 0)!;
    const items = last.items as Item[];

    // HARD — the face is on the wire and the host reports, as values: every
    // run names Inter; the bold run carries weight 700 and the plain runs
    // 400 or none (the face-carrying bundle, @paged-media/web 0.1.0-canary.9 on);
    // with Inter registered nothing fell back.
    expect(
      words(items.map((i) => i.text ?? "").join(" ")),
      "the run text is the source text",
    ).toEqual(["Spring", "line", "sheet"]);
    for (const it of items) {
      expect(it.family, `run ${JSON.stringify(it)} names its family`).toBe("Inter");
      expect(it.italic ?? false, `run ${JSON.stringify(it)} is upright`).toBe(false);
    }
    const bold = items.filter((i) => /line/.test(i.text ?? ""));
    expect(bold.length, "the <b> run is its own scene item").toBeGreaterThan(0);
    for (const it of bold) {
      expect(it.text?.trim(), "the bold run holds only the bold text").toBe("line");
      expect(it.weight, "the bold run carries weight 700").toBe(700);
    }
    // A regular run may omit the field (absent = 400 on the wire).
    for (const it of items.filter((i) => !/line/.test(i.text ?? ""))) {
      expect(it.weight ?? 400, `plain run "${it.text}" is weight 400`).toBe(400);
    }
    expect(last.fontFallbacks, "the host reports fallbacks as a list").toEqual([]);

    // And it paints.
    await designer.expectRenderChangesFrom(before);
  });
});
