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

// Spike S1 (ADR 224): which capture keeps the WebGPU canvas, the UI text and
// the motion of a real editing session. Two takes of one sequence: the
// screencast's own frames (B) and Playwright's recordVideo (A). Each writes
// reference `page.screenshot`s with the wall time they were taken, so the
// analysis can compare the nearest captured frame against them (SSIM), and a
// clapper flash for clock alignment. The analysis lives in the website's
// media/ package; this only records.

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { Designer } from "../../journey/driver/designer";
import { screenPoint } from "../../e2e/harness/viewport";
import { startCapture } from "../kit/capture";
import { Pointer, typeHuman } from "../kit/pointer";

const ROOT = process.env.PAGED_MEDIA_ROOT;
test.skip(!ROOT, "PAGED_MEDIA_ROOT is not set (films are recorded locally)");

const VIEW = { width: 1600, height: 900 };
const DPR = 2;

async function clapper(page: Page, log: string): Promise<void> {
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "film-clapper";
    d.style.cssText =
      "position:fixed;left:8px;top:8px;width:24px;height:24px;background:#00ff00;z-index:2147483647";
    document.body.appendChild(d);
  });
  appendFileSync(log, `${JSON.stringify({ mark: "clapper-on", wall: Date.now() })}\n`);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById("film-clapper")?.remove());
  appendFileSync(log, `${JSON.stringify({ mark: "clapper-off", wall: Date.now() })}\n`);
}

async function sequence(page: Page, dir: string): Promise<void> {
  const marks = join(dir, "marks.jsonl");
  const shots = join(dir, "shots");
  mkdirSync(shots, { recursive: true });
  const designer = new Designer(page);
  const pointer = new Pointer(page, join(dir, "cursor.jsonl"));
  await pointer.place({ x: 800, y: 450 });

  const shot = async (name: string) => {
    const wall = Date.now();
    await page.screenshot({ path: join(shots, `${name}.png`) });
    appendFileSync(marks, `${JSON.stringify({ mark: `shot:${name}`, wall, done: Date.now() })}\n`);
  };

  await clapper(page, marks);
  await shot("start");

  // A real rectangle drag with the shape tool.
  const slot = page.locator('[data-tool-slot="shape"]');
  const box = await slot.boundingBox();
  if (!box) throw new Error("no shape tool slot");
  await pointer.click({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, { targetWidth: box.width });
  const a = await screenPoint(page, 90, 260);
  const b = await screenPoint(page, 520, 560);
  await pointer.drag(a, b);
  await page.waitForTimeout(600);
  await shot("rect");

  // Type into a text frame.
  const { storyId } = await designer.addTextFrame({ x0: 90, y0: 90, x1: 520, y1: 220 });
  expect(storyId).toBeTruthy();
  await designer.placeCaret(storyId!, 0);
  const t = await screenPoint(page, 300, 150);
  await pointer.moveTo(t);
  await typeHuman(page, "Desktop publishing has left the desktop.");
  await page.waitForTimeout(500);
  await shot("typed");

  // Pan the canvas: the camera animates the whole WebGPU surface.
  await pointer.moveTo({ x: 800, y: 500 });
  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(16);
  }
  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel(0, -40);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(500);
  await shot("panned");
  appendFileSync(marks, `${JSON.stringify({ mark: "end", wall: Date.now() })}\n`);
}

async function boot(page: Page): Promise<void> {
  const designer = new Designer(page);
  await designer.open();
  await designer.newDocument();
  await expect.poll(() => designer.gpuActive(), { timeout: 30_000 }).toBe(true);
  // The Vite error overlay is dev chrome; it must never be filmed.
  await page.addStyleTag({ content: "vite-error-overlay{display:none!important}" });
  await page.waitForTimeout(800);
}

test("S1 · B · screencast frames", async ({ page }) => {
  const dir = join(ROOT!, ".build", "spike", "screencast");
  mkdirSync(dir, { recursive: true });
  await boot(page);
  const cap = await startCapture(page, {
    dir,
    size: { width: VIEW.width * DPR, height: VIEW.height * DPR },
    quality: 92,
  });
  const t0 = Date.now();
  await sequence(page, dir);
  await page.waitForTimeout(300);
  await cap.stop();
  writeFileSync(
    join(dir, "meta.json"),
    JSON.stringify({ method: "screencast", frames: cap.count, ms: Date.now() - t0, dpr: DPR, view: VIEW }, null, 2),
  );
});

test("S1 · A · recordVideo", async ({ browser }) => {
  const dir = join(ROOT!, ".build", "spike", "recordvideo");
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: DPR,
    colorScheme: "dark",
    recordVideo: { dir, size: { width: VIEW.width, height: VIEW.height } },
  });
  const page = await context.newPage();
  const created = Date.now();
  await boot(page);
  const t0 = Date.now();
  await sequence(page, dir);
  await page.waitForTimeout(300);
  const video = page.video();
  await context.close();
  writeFileSync(
    join(dir, "meta.json"),
    JSON.stringify(
      { method: "recordVideo", contextCreated: created, sequenceStart: t0, video: await video?.path(), view: VIEW },
      null,
      2,
    ),
  );
});
