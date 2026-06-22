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

// Demo capture — records the showcase flows as rrweb sessions (DOM chrome from
// rrweb + WebGPU document frames from the editor frame-tap) for the docs live
// demos. Run: `npx playwright test --project=demo-capture`. Each flow writes
// tests/demo/out/<id>.rrweb.json; CI uploads them as release assets, docs pull.
//
// Flows are authored here (not the assertion-heavy journey specs) so they're
// paced + narrated for viewing. Add a flow + a manifest entry to publish one.
// NOTE: fast-channel actions (drawRectangle/applyFill) change the document via
// frames with no cursor; for cursor-visible GESTURE demos, drive with real
// pointer input (see the master journeys) — a follow-up refinement.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";

import { expect } from "@playwright/test";
import { Designer } from "../journey/driver/designer";
import { screenPoint, activateTool, treeCount, treeIds } from "../e2e/harness/viewport";
import { startCapture, step, finishCapture } from "./capture";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "out");
const manifest = JSON.parse(readFileSync(join(HERE, "showcase.manifest.json"), "utf8")) as {
  canvasSelector: string;
  fps?: number;
  demos: Array<{ id: string; title?: string; description?: string }>;
};
const CANVAS_SELECTOR = manifest.canvasSelector;
const FPS = manifest.fps ?? 24;

type PWPage = import("@playwright/test").Page;

/** A paced beat so the replay has watchable duration per step. */
async function beat(page: PWPage, ms = 900): Promise<void> {
  await page.waitForTimeout(ms);
}

// The render loop ticks ~every 16ms and the frame-tap captures one frame per
// rendered tick (throttled to the manifest fps). Playwright's stepped mouse.move
// fires all its steps in a few ms, so a whole drag spans only 1-2 ticks → 1-2
// frames. To make GESTURES SMOOTH we pace the pointer over REAL TIME: one small
// move per ~stepMs, so each increment gets its own render tick and tapped frame.
const STEP_MS = 36; // ~28 pointer samples/sec → smooth, comfortably under the loop rate

/** Glide the real cursor to a document point over real time (cursor-visible). */
async function cursorTo(page: PWPage, ptX: number, ptY: number, ms = 450): Promise<void> {
  const p = await screenPoint(page, ptX, ptY);
  await pacedMove(page, p.x, p.y, ms);
}

/** Move the pointer from its current spot to (x,y), paced over `ms` real time so
 *  the render loop + frame-tap sample a smooth path. Assumes a known start: call
 *  after a cursorTo / mouse.move so interpolation has an origin. */
let lastPointer = { x: 0, y: 0 };
async function pacedMove(page: PWPage, x: number, y: number, ms: number): Promise<void> {
  const steps = Math.max(2, Math.round(ms / STEP_MS));
  const from = lastPointer;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
    await page.waitForTimeout(STEP_MS);
  }
  lastPointer = { x, y };
}

/** REAL, SMOOTH pointer translate: select tool, press inside the element, drag it
 *  to a new spot paced over real time, release. The cursor follows and the frame
 *  glides — captured as a smooth frame sequence. */
async function smoothMove(
  page: PWPage,
  from: { x: number; y: number },
  to: { x: number; y: number },
  ms = 1100,
): Promise<void> {
  await activateTool(page, "select");
  const a = await screenPoint(page, from.x, from.y);
  const b = await screenPoint(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  lastPointer = { x: a.x, y: a.y };
  await page.mouse.down();
  await page.waitForTimeout(STEP_MS);
  await pacedMove(page, b.x, b.y, ms);
  await page.waitForTimeout(120);
  await page.mouse.up();
}

/** REAL, SMOOTH rectangle draw with the shape tool (paced), returning the new
 *  element id. Mirrors Designer.drawRectangle's id-tracking but drags over real
 *  time so the rubber-band renders as a smooth sequence. */
async function smoothDrawRectangle(
  page: PWPage,
  rect: { x0: number; y0: number; x1: number; y1: number },
  ms = 1000,
): Promise<string> {
  await activateTool(page, "shape");
  const before = await treeIds(page, "rectangle");
  const a = await screenPoint(page, rect.x0, rect.y0);
  const b = await screenPoint(page, rect.x1, rect.y1);
  await page.mouse.move(a.x, a.y);
  lastPointer = { x: a.x, y: a.y };
  await page.mouse.down();
  await page.waitForTimeout(STEP_MS);
  await pacedMove(page, b.x, b.y, ms);
  await page.waitForTimeout(120);
  await page.mouse.up();
  await expect.poll(() => treeCount(page, "rectangle")).toBeGreaterThan(before.length);
  const after = await treeIds(page, "rectangle");
  return after.find((f) => !before.some((b2) => b2.id === f.id))?.id ?? "";
}

type Flow = (designer: Designer, page: PWPage, say: (label: string) => Promise<void>) => Promise<void>;

const flows: Record<string, Flow> = {
  "new-document": async (designer, page, say) => {
    await say("New blank Letter document");
    await designer.newDocument();
    await beat(page);
  },

  gradient: async (designer, page, say) => {
    await say("Create two brand swatches");
    const red = await designer.createSwatch("Red", [220, 30, 30]);
    const blue = await designer.createSwatch("Blue", [30, 60, 220]);
    await beat(page);
    await say("Build a linear gradient");
    const grad = await designer.createGradient("Sunset", [red, blue]);
    await beat(page);
    await say("Draw a frame (real pointer drag)");
    await cursorTo(page, 90, 120);
    const id = await smoothDrawRectangle(page, { x0: 90, y0: 120, x1: 460, y1: 320 });
    await beat(page, 500);
    await say("Fill it with the gradient");
    await designer.selectElement("rectangle", id);
    await designer.applyFill("rectangle", id, grad);
    await beat(page);
  },

  "draw-fill": async (designer, page, say) => {
    await say("Draw a rectangle (real pointer drag)");
    await cursorTo(page, 120, 140);
    const id = await smoothDrawRectangle(page, { x0: 120, y0: 140, x1: 420, y1: 320 });
    await beat(page, 500);
    await say("Apply a solid fill");
    await designer.selectElement("rectangle", id);
    await designer.applyFill("rectangle", id, "Color/Black");
    await beat(page, 600);
    await say("Move it across the page (real pointer drag)");
    // Drag from inside the frame to a new spot — a smooth cursor-visible translate.
    await smoothMove(page, { x: 270, y: 230 }, { x: 470, y: 380 });
    await beat(page);
  },
};

mkdirSync(OUT_DIR, { recursive: true });

for (const demo of manifest.demos) {
  const flow = flows[demo.id];
  // Only flows authored above are captured; the rest of the manifest is the
  // backlog of journeys to turn into demo flows. (Don't use top-level
  // test.skip here — at file scope it would skip the WHOLE suite.)
  if (!flow) continue;

  test(`capture · ${demo.id}`, async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    await startCapture(page, { canvasSelector: CANVAS_SELECTOR, fps: FPS });
    await flow(designer, page, (label) => step(page, label));
    const session = await finishCapture(page);

    writeFileSync(
      join(OUT_DIR, `${demo.id}.rrweb.json`),
      JSON.stringify({ meta: { id: demo.id, title: demo.title, description: demo.description }, ...session }),
    );
  });
}
