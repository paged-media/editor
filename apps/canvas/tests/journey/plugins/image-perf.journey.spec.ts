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

// Journey: paged.image performance on a large image — a TREND LANE.
//
// REPORTED, NOT GATED. The numbers depend on the machine, its load and its
// GPU, so a threshold here would either be loose enough to say nothing or
// tight enough to flake. What the lane does instead is measure the three
// interactions a designer feels on a 12-megapixel photo, through the real
// editor, and write them down where a trend can be drawn:
//
//   · a 200-sample brush stroke (input span, and time until the page has
//     its last preview), with how many whole images and how many dirty-
//     rect tiles crossed to the renderer and their bytes;
//   · Apply of a pending adjustment;
//   · a 20-step layer-opacity drag (each step re-folds the stack).
//
// "Settled" is measured at the renderer boundary: the time of the last
// scene-image submission once none has followed for a quiet window. The
// numbers are printed and attached as `image-perf.json` (and written to
// `test-results/image-perf.json`, which the nightly uploads).
//
// The only hard assertions are that each interaction reached the
// renderer at all — a number measured over nothing is not a measurement.
//
// GPU-only like every paged.image pixel path (no CPU kernel ships).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { screenPoint } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

const ADJ_PANEL = "media.paged.image.panel.adjustments";
const BRUSH = "media.paged.image.tool.brush";
const WIDTH = 4000;
const HEIGHT = 3000;
const SAMPLES = 200;
const OPACITY_STEPS = 20;
const QUIET_MS = 1_500;

const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../test-results/image-perf.json",
);

interface Spy {
  images: number;
  tiles: number;
  json: number;
  imageBytes: number;
  tileBytes: number;
  last: number;
}

/** Count what crosses to the renderer. Patched on the editor's client
 *  (the object `PagedEditor.sceneLayers` closes over), not on the
 *  PagedEditor itself: that object is rebuilt when its inputs change, so
 *  a patch on it can silently stop seeing calls. */
async function installSpy(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Fn = (...a: unknown[]) => Promise<unknown>;
    const g = globalThis as unknown as {
      __paged: { client: Record<string, Fn> };
      __imgSpy?: Spy & { installed?: boolean };
    };
    const spy = { images: 0, tiles: 0, json: 0, imageBytes: 0, tileBytes: 0, last: 0 };
    const prior = g.__imgSpy;
    g.__imgSpy = Object.assign(prior ?? {}, spy);
    if (prior?.installed) return;
    g.__imgSpy.installed = true;
    const c = g.__paged.client;
    const wrap = (name: string, count: (args: unknown[]) => void) => {
      const orig = c[name].bind(c);
      c[name] = (...args: unknown[]) => {
        count(args);
        g.__imgSpy!.last = performance.now();
        return orig(...args);
      };
    };
    wrap("submitSceneImageBinary", (a) => {
      g.__imgSpy!.images++;
      g.__imgSpy!.imageBytes += (a[1] as { rgba: Uint8Array }).rgba.byteLength;
    });
    wrap("submitSceneImageTilesBinary", (a) => {
      g.__imgSpy!.tiles += (a[1] as unknown[]).length;
      for (const t of a[1] as Array<{ rgba: Uint8Array }>) g.__imgSpy!.tileBytes += t.rgba.byteLength;
    });
    wrap("submitSceneLayer", () => {
      g.__imgSpy!.json++;
    });
  });
}

async function readSpy(page: Page): Promise<Spy> {
  return page.evaluate(() => {
    const s = (globalThis as unknown as { __imgSpy: Spy }).__imgSpy;
    return { images: s.images, tiles: s.tiles, json: s.json, imageBytes: s.imageBytes, tileBytes: s.tileBytes, last: s.last };
  });
}

const now = (page: Page) => page.evaluate(() => performance.now());

/** Wait until something has reached the renderer and nothing has followed
 *  for QUIET_MS; return the time of the last submission. */
async function settled(page: Page, timeout = 120_000): Promise<number> {
  await expect
    .poll(
      () =>
        page.evaluate((quiet) => {
          const s = (globalThis as unknown as { __imgSpy: Spy }).__imgSpy;
          return s.last > 0 && performance.now() - s.last > quiet;
        }, QUIET_MS),
      { timeout, intervals: [250] },
    )
    .toBe(true);
  return (await readSpy(page)).last;
}

async function layerCount(page: Page): Promise<number> {
  const t = (await page.locator("[data-image-layers-title]").first().textContent()) ?? "";
  const m = t.match(/\((\d+)\)/);
  return m ? Number(m[1]) : 0;
}

test.describe("journey · paged.image performance (trend, not gated)", () => {
  test(`a ${WIDTH}×${HEIGHT} image: ${SAMPLES}-sample stroke, Apply and a ${OPACITY_STEPS}-step opacity drag, timed @feat:image.perf.budgets @level:edge`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(10 * 60_000);
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    if (!(await designer.gpuActive())) {
      test.skip(
        true,
        "paged.image is GPU-only (no CPU kernel path); this trend lane runs on journeys-gpu (`pnpm --filter paged-canvas test:journeys:gpu`) and in showcase-nightly",
      );
    }
    const frame = await designer.drawRectangle({ x0: 60, y0: 100, x1: 540, y1: 460 });
    expect(frame, "drew a target frame").not.toBe("");

    // A real 12 MP PNG, placed through the binary commit lane so the
    // frame holds bytes "Adjust image" can ingest.
    const placed = await page.evaluate(
      async ({ frame, w, h }) => {
        const cv = new OffscreenCanvas(w, h);
        const ctx = cv.getContext("2d");
        if (!ctx) return "no 2d context";
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, "#1830ff");
        g.addColorStop(0.5, "#20c040");
        g.addColorStop(1, "#ff3018");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        const bytes = new Uint8Array(
          await (await cv.convertToBlob({ type: "image/png" })).arrayBuffer(),
        );
        const paged = (
          globalThis as unknown as {
            __paged: {
              mutateWithBytes(m: unknown, b: Uint8Array, t?: boolean): Promise<{ kind: string }>;
            };
          }
        ).__paged;
        const reply = await paged.mutateWithBytes(
          {
            op: "batch",
            args: { ops: [{ op: "replaceImageBytes", args: { elementId: frame, bytes: [] } }] },
          },
          bytes,
          true,
        );
        return reply.kind;
      },
      { frame, w: WIDTH, h: HEIGHT },
    );
    expect(placed, "placed the large PNG").toBe("mutationApplied");

    const tIngest0 = Date.now();
    await designer.selectElement("rectangle", frame);
    await designer.runCommand("media.paged.image.command.adjustSelected");
    await designer.openPanel(ADJ_PANEL);
    await expect.poll(() => layerCount(page), { timeout: 120_000 }).toBeGreaterThan(0);
    const ingestMs = Date.now() - tIngest0;
    await installSpy(page);

    // ── 1. THE STROKE — 200 pointer samples across the frame. ──
    await designer.runCommand(`paged.tool.activate.${BRUSH}`).catch(() => {});
    const pts = await Promise.all(
      Array.from({ length: SAMPLES }, (_, i) => {
        const t = i / (SAMPLES - 1);
        return screenPoint(page, 100 + 400 * t, 280 + 120 * Math.sin(t * Math.PI * 4));
      }),
    );
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.waitForTimeout(750);
    await installSpy(page);
    const s0 = await now(page);
    await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
    await page.mouse.up();
    const sInput = await now(page);
    const sLast = await settled(page);
    const stroke = await readSpy(page);
    expect(stroke.images + stroke.tiles + stroke.json, "the stroke reached the renderer").toBeGreaterThan(0);

    // ── 2. APPLY — push Exposure (a pending adjustment), let its live
    //    preview settle, then time the Apply alone. ──
    const exposure = page.locator("input[type=range]").first();
    await expect(exposure).toBeEnabled({ timeout: 30_000 });
    await exposure.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(QUIET_MS);
    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeEnabled({ timeout: 60_000 });
    await installSpy(page);
    const a0 = await now(page);
    await applyBtn.click();
    const aLast = await settled(page);
    const apply = await readSpy(page);

    // ── 3. OPACITY DRAG — 20 steps on the layer's slider (1 → 0). ──
    const opacity = page.locator("[data-image-layer-opacity]").first();
    await expect(opacity).toBeEnabled({ timeout: 60_000 });
    await installSpy(page);
    // Keyboard steps: one slider step (0.05) per key, the same
    // input/change events a pointer drag across the track fires.
    await opacity.focus();
    const o0 = await now(page);
    for (let i = 0; i < OPACITY_STEPS; i++) await page.keyboard.press("ArrowLeft");
    const oInput = await now(page);
    const oLast = await settled(page);
    const drag = await readSpy(page);
    expect(drag.images + drag.tiles + drag.json, "the drag reached the renderer").toBeGreaterThan(0);

    const report = {
      when: new Date().toISOString(),
      image: { width: WIDTH, height: HEIGHT },
      ingestMs,
      stroke: {
        samples: SAMPLES,
        inputMs: Math.round(sInput - s0),
        settledMs: Math.round(sLast - s0),
        wholeImages: stroke.images,
        tiles: stroke.tiles,
        jsonLayers: stroke.json,
        imageMB: +(stroke.imageBytes / 1048576).toFixed(1),
        tileMB: +(stroke.tileBytes / 1048576).toFixed(1),
      },
      apply: {
        settledMs: Math.round(aLast - a0),
        wholeImages: apply.images,
        tiles: apply.tiles,
        jsonLayers: apply.json,
      },
      opacityDrag: {
        steps: OPACITY_STEPS,
        inputMs: Math.round(oInput - o0),
        settledMs: Math.round(oLast - o0),
        wholeImages: drag.images,
        tiles: drag.tiles,
        jsonLayers: drag.json,
      },
    };
    const json = JSON.stringify(report, null, 2);
    // eslint-disable-next-line no-console
    console.log(`[journey] paged.image perf (trend, not gated):\n${json}`);
    await testInfo.attach("image-perf.json", { body: json, contentType: "application/json" });
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, json);
  });
});
