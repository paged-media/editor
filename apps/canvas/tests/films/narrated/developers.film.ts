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

// For developers, the developers page's film (ADR 224): the website's
// `films/developers.yaml`. The editor is programmable, and every way in goes
// through the same engine: the playground stepping a live script, paged.*
// queries and one-step batches in the Script panel, Claude writing a script
// (a real reply, recorded once with `AI_TAPE=record` and replayed), a
// plugin's manifest and its panel, and the paged command line in a terminal
// (the two terminal scenes are real recorded sessions the stage plays).

import { expect, type Locator, type Page } from "@playwright/test";
import { film, type Kit } from "../kit/film";
import { aiTape } from "../kit/ai-tape";
import { typeHuman } from "../kit/pointer";
import { hover, menu, press, screenPoint } from "../kit/ui";

const ROOT = process.env.PAGED_MEDIA_ROOT ?? "";

const SWATCHES = `for (const [selfId, name, rgb] of [
  ["Color/Rose", "Rose", [244, 127, 192]],
  ["Color/Mint", "Mint", [111, 220, 155]],
  ["Color/Violet", "Violet", [169, 139, 245]],
  ["Color/Night", "Night", [42, 33, 64]],
]) paged.createSwatch({ selfId, name, space: "RGB", value: rgb, model: "Process" });
const page = JSON.parse(paged.pages())[0].selfId;
[[90, 80, 250, 290, "Color/Rose"], [90, 322, 250, 532, "Color/Mint"], [290, 80, 450, 290, "Color/Mint"], [290, 322, 450, 532, "Color/Rose"]]
  .forEach(([t, l, b, r, fill]) => paged.set(paged.insertFrame(page, [t, l, b, r]), "frameFillColor", fill));
paged.clearSelection();`;

const QUERY = `paged.query("page:#1 > frame")`;

const BATCH = `const frames = JSON.parse(paged.query("page:#1 > frame"));
paged.batch(frames.flatMap((f) => [
  { op: "set", address: f, path: "frameFillColor", value: "Color/Violet" },
  { op: "set", address: f, path: "frameRotationAngle", value: -6 },
]));`;

const ASK = "Give every frame on this page a 4 pt stroke in the Night swatch.";

async function run(page: Page, source: string): Promise<string[]> {
  const r = await page.evaluate(
    async (s) =>
      (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<{ output: string[]; error: string | null }> } } }).__canvas.client.executeScript(s),
    source,
  );
  if (r.error) throw new Error(`script failed: ${r.error}`);
  return r.output;
}

/** Each frame on page 1: its fill, rotation, stroke weight and stroke colour. */
async function frames(page: Page): Promise<Array<{ fill: unknown; angle: unknown; weight: unknown; stroke: unknown }>> {
  const out = await run(
    page,
    `const v = (f, p) => JSON.parse(paged.get(f, p)).value;
console.log(JSON.stringify(JSON.parse(paged.query("page:#1 > frame")).map((f) => ({ fill: v(f, "frameFillColor"), angle: v(f, "frameRotationAngle"), weight: v(f, "frameStrokeWeight"), stroke: v(f, "frameStrokeColor") }))));`,
  );
  return JSON.parse(out[0].replace(/^\[log\] /, ""));
}

/** Aim a punch-in at a rectangle of the editor's UI (CSS px), through the
 *  live camera: focus() takes page points. */
async function aimView(k: Kit, box: { x: number; y: number; width: number; height: number }): Promise<[number, number, number, number]> {
  const o = await screenPoint(k.page, 0, 0);
  const s = ((await screenPoint(k.page, 100, 0)).x - o.x) / 100;
  return [(box.x - o.x) / s, (box.y - o.y) / s, (box.x + box.width - o.x) / s, (box.y + box.height - o.y) / s];
}

/** The script panel's ask bar, source and log, as one region. */
async function scriptArea(rows: Locator[]): Promise<{ x: number; y: number; width: number; height: number }> {
  const boxes = await Promise.all(rows.map(async (r) => (await r.boundingBox())!));
  const x = Math.min(...boxes.map((b) => b.x)) - 8;
  const y = Math.min(...boxes.map((b) => b.y)) - 8;
  const r = Math.max(...boxes.map((b) => b.x + b.width)) + 8;
  const b = Math.max(...boxes.map((b) => b.y + b.height)) + 8;
  return { x, y, width: r - x, height: b - y };
}

film("developers", async (k) => {
  const { page, designer, pointer } = k;
  const panel = page.locator("[data-script-editor]");
  const source = panel.locator("[data-script-source]");
  const log = panel.locator("[data-script-log]");

  await k.setup(async () => {
    await aiTape(page, ROOT, "developers");
    await designer.open({ search: "?script=draw-live" });
    // A document first: the canvas runs on WebGPU once one is open.
    await designer.newDocument();
    await expect(page.locator("[data-playground-source]")).toBeVisible();
    await expect(page.locator("[data-playground-chapter]")).toHaveCount(5);
    await k.hold(800);
  });
  await k.roll();

  // ── The playground: play; the script draws in the editor. ──
  const status = page.locator("[data-playground-status]");
  await k.scene("playground", async () => {
    await k.hold(400);
    await press(k, page.locator("[data-playground-play]"));
    await expect(status).toHaveAttribute("data-playground-status", "playing");
    // The dome, drawn by its anchors.
    await expect(page.getByText("A curve, by its anchors", { exact: true }).last()).toBeVisible({ timeout: 30_000 });
    await k.hold(600);
  });

  // ── Pause, step twice (the card appears, then fills), play on. ──
  await k.scene("step", async () => {
    await press(k, page.locator("[data-playground-play]"));
    await expect(status).toHaveAttribute("data-playground-status", "paused", { timeout: 10_000 });
    // The narration box running when it paused finishes on its own clock;
    // the next step is then the card's statement.
    await expect(page.getByText("A curve, by its anchors", { exact: true })).toHaveCount(0, { timeout: 10_000 });
    const rects = async () => (await run(page, `console.log(JSON.parse(paged.query("page:#1 > frame")).length)`))[0];
    const before = await rects();
    await press(k, page.locator("[data-playground-step]"));
    await expect.poll(rects).not.toBe(before);
    await k.hold(700);
    await press(k, page.locator("[data-playground-step]"));
    await k.hold(700);
    await press(k, page.locator("[data-playground-play]"));
    await expect(page.getByText("Live corners", { exact: true }).last()).toBeVisible({ timeout: 30_000 });
    await k.hold(1500);
  });

  // The script plays to its end, then a fresh page with four frames; the
  // edit removes the wait. (Restart does not stop a statement already
  // running: it would go on drawing into the fresh page.)
  await k.cut("a fresh page", async () => {
    await expect(page.locator("[data-playground-status]")).toHaveAttribute("data-playground-status", "done", { timeout: 60_000 });
    await page.locator("[data-playground-toggle]").click();
    await expect(page.locator("[data-playground-source]")).toHaveCount(0);
    await designer.newDocument();
    await run(page, SWATCHES);
    await expect.poll(async () => (await frames(page)).length).toBe(4);
    await k.hold(600);
    await k.recamera();
  });

  // ── The Script panel: one query, every frame's address. ──
  await k.scene("console", async () => {
    await menu(k, ["Window", "Developer", "Script"]);
    await expect(panel).toBeVisible();
    k.focus(await aimView(k, await scriptArea([panel.locator("[data-script-ask]"), source, log])), 1.8);
    await press(k, source);
    await page.keyboard.press("Meta+a");
    await page.keyboard.press("Backspace");
    await typeHuman(page, QUERY, 11);
    await press(k, panel.locator("[data-action=run]"));
    for (const n of [1, 2, 3, 4]) await expect(log).toContainText(`rectangle:u${n}`);
  });

  // ── One batch: every frame restyled, as one step. ──
  await k.scene("batch", async () => {
    await press(k, source);
    await page.keyboard.press("Meta+a");
    k.chip("Paste", "key", "⌘V");
    await page.keyboard.insertText(BATCH);
    await k.hold(900);
    await press(k, panel.locator("[data-action=run]"));
    await expect.poll(async () => (await frames(page)).every((f) => f.fill === "Color/Violet" && f.angle === -6)).toBe(true);
    k.unfocus();
    await k.hold(600);
  });

  // ── One undo takes all eight writes back. ──
  await k.scene("undo", async () => {
    await k.key("Meta+z", "Undo", "⌘Z");
    await expect
      .poll(async () => (await frames(page)).map((f) => `${f.fill}/${f.angle}`))
      .toEqual(["Color/Rose/0", "Color/Mint/0", "Color/Mint/0", "Color/Rose/0"]);
  });

  // ── Ask Claude, in plain words; wait for its script to land. ──
  await k.scene("ask", async () => {
    const input = panel.locator("[data-script-ask-input]");
    k.focus(await aimView(k, await scriptArea([panel.locator("[data-script-ask]"), source])));
    await press(k, input);
    await typeHuman(page, ASK, 13);
    await press(k, panel.locator("[data-action=ask]"));
    await expect(source).not.toHaveValue(BATCH, { timeout: 90_000 });
  });

  // ── Claude's script runs through the same door; it reads the result. ──
  await k.scene("claude", async () => {
    await expect(panel.locator("[data-script-note]").last()).toContainText("Claude:", { timeout: 90_000 });
    await expect
      .poll(async () => (await frames(page)).every((f) => f.weight === 4 && f.stroke === "Color/Night"), { timeout: 15_000 })
      .toBe(true);
    await k.hold(900);
    k.unfocus();
    await k.hold(1200);
  });

  // ── A plugin is a manifest: the terminal shows paged.draw's. ──
  await k.scene("plugin");

  // ── Its panel opens like any other. ──
  await k.scene("panel", async () => {
    // Select the first frame, so the panel shows its appearance.
    await k.key("v");
    await pointer.click(await screenPoint(page, 120, 120), { targetWidth: 60 });
    await expect.poll(async () => (await run(page, `console.log(paged.selection())`))[0]).toContain('"id":"u1"');
    await press(k, page.locator("header").getByText("Plugins", { exact: true }).first());
    await k.hold(250);
    await hover(k, page.getByRole("menuitem", { name: /^Draw/ }).first());
    await k.hold(400);
    // Settle into the Draw row (the way down crossed Data, whose submenu
    // can stay open) until Draw's own submenu shows.
    await pointer.moveTo({ x: pointer.position.x + 10, y: pointer.position.y }, { targetWidth: 60 });
    await expect(page.getByRole("menuitem", { name: /^Compound path/ })).toBeVisible({ timeout: 5000 });
    // The submenu lists the plugin's commands, then its panels: the second
    // "Appearance" is the panel. Into the submenu's column first, then down
    // it: a diagonal would cross the main menu's other rows and close it.
    const panelItem = page.getByRole("menuitem", { name: /^Appearance$/ }).last();
    await panelItem.waitFor({ state: "visible", timeout: 5000 });
    const column = (await panelItem.boundingBox())!;
    await pointer.moveTo({ x: column.x + column.width / 2, y: pointer.position.y }, { targetWidth: column.width });
    await k.hold(200);
    await press(k, panelItem);
    await expect(page.locator('[data-dock-tab="media.paged.draw.panel.appearance"]')).toBeVisible();
    await k.hold(1200);
  });

  // ── The paged command line: the terminal shows a real session. ──
  await k.scene("cli");
});
