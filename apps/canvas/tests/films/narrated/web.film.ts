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

// paged.web, the plugin film (ADR 224): the website's `films/web.yaml`.
// An HTML mailer opened onto the page, its CSS edited in the source panel,
// threaded into a second frame, saved, and opened again in a fresh editor.
// Everything goes through the editor's own controls (File ▸ Open…, the frame
// tool, the command palette, the source panel, ⌘S), and each step is
// asserted against the document.
//
// Left out on purpose: resizing a single web frame (it does not re-render
// until Web ▸ Render frame), editing text on the canvas (works, but is
// experimental in the capability record), and Bake (the baked text shows
// as a missing font).

import { expect, type Page } from "@playwright/test";
import { join } from "node:path";
import { film, type Kit } from "../kit/film";
import { typeHuman } from "../kit/pointer";
import { menu, press, screenPoint } from "../kit/ui";
import { sceneText, tapSceneLayers, webFrames, webSource, type ElementRef } from "../../journey/plugins/web-kit";

const ASSETS = join(process.env.PAGED_MEDIA_ROOT ?? "", "assets");

/** The two frames and the page around them, in page points. */
const FRAMES: [number, number, number, number] = [30, 30, 590, 270];

const pt = (k: Kit, x: number, y: number) => screenPoint(k.page, x, y);

/** A rectangle of the editor window (CSS px: x0, y0, x1, y1) in page points,
 *  for punching in on a panel: focus() aims through the page camera. */
async function viewRect(k: Kit, r: [number, number, number, number]): Promise<[number, number, number, number]> {
  const o = await pt(k, 0, 0);
  const s = ((await pt(k, 100, 0)).x - o.x) / 100;
  return [(r[0] - o.x) / s, (r[1] - o.y) / s, (r[2] - o.x) / s, (r[3] - o.y) / s];
}

/** Every page item of one kind, by id. */
async function ids(page: Page, kind: string): Promise<string[]> {
  return page.evaluate(async (want) => {
    type Node = { id?: { kind: string; id: string } | null; children?: Node[] };
    const c = (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<{ output: string[] }> } } }).__canvas;
    const r = await c.client.executeScript("JSON.stringify(paged.tree())");
    const out: string[] = [];
    const visit = (n: Node) => {
      if (n.id?.kind === want) out.push(n.id.id);
      for (const ch of n.children ?? []) visit(ch);
    };
    for (const root of JSON.parse(JSON.parse(r.output[0])) as Node[]) visit(root);
    return out;
  }, kind);
}

const selection = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { __canvas: { elementSelection?: ElementRef[] } }).__canvas.elementSelection ?? []);

/** Click the pasteboard beside the page: deselects, and leaves no hit marker
 *  on the page (a click on the page itself would). */
async function deselect(k: Kit): Promise<void> {
  const before = (await ids(k.page, "rectangle")).length;
  await k.key("v");
  await k.pointer.click(await pt(k, -110, 420), { targetWidth: 120 });
  await k.hold(200);
  expect((await ids(k.page, "rectangle")).length, "the deselect click created nothing").toBe(before);
}

film("web", async (k) => {
  const { page, designer, pointer } = k;

  await k.setup(async () => {
    // A step that cannot happen fails in half a minute, not at the 15-minute
    // test timeout (actions and navigations wait forever by default).
    page.setDefaultTimeout(30_000);
    await designer.open();
    await designer.newDocument();
    await tapSceneLayers(page);
    await k.key("v");
    await k.hold(800);
  });
  await k.roll();

  let first: ElementRef = { kind: "rectangle", id: "" };
  let second: ElementRef = { kind: "rectangle", id: "" };

  // ── An HTML file becomes a web frame. ──
  await k.scene("open", async () => {
    await k.hold(300);
    const chooser = page.waitForEvent("filechooser");
    await menu(k, ["File", "Open…"]);
    k.chip("spring-mailer.html", "file");
    await (await chooser).setFiles(join(ASSETS, "spring-mailer.html"));
    await expect.poll(async () => (await webFrames(page)).length, { timeout: 10_000 }).toBe(1);
    first = (await webFrames(page))[0];
    await expect.poll(() => sceneText(page, first.id), { timeout: 10_000 }).toContain("Spring line sheet");
    k.focus(FRAMES);
    await k.hold(1800);
  });

  // ── The source panel (already showing the imported frame): one CSS
  //    value changed and saved. Before the threading on purpose: selecting
  //    a threaded web frame while the screencast runs has frozen the page
  //    in two of three takes. ──
  await k.scene("css", async () => {
    k.unfocus();
    const css = page.locator("[data-web-css] [data-code-input]");
    await expect(css).toBeVisible({ timeout: 10_000 });
    const panel = (await page.locator("[data-web-css]").first().boundingBox())!;
    k.focus(await viewRect(k, [panel.x - 20, panel.y - 40, panel.x + panel.width + 20, Math.min(895, panel.y + panel.height + 300)]));
    await k.hold(700);
    await press(k, css);
    // Select the background colour, the way a double-click on it would.
    await css.evaluate((el: HTMLTextAreaElement) => {
      const i = el.value.indexOf("fff7ea");
      el.setSelectionRange(i, i + 6);
    });
    await k.hold(400);
    await typeHuman(page, "e9f5ee");
    const save = page.locator("[data-web-commit]");
    await save.scrollIntoViewIfNeeded();
    await press(k, save);
    await expect.poll(async () => (await webSource(page, first))?.css ?? "", { timeout: 10_000 }).toContain("#e9f5ee");
    await k.hold(600);
    k.focus(FRAMES);
    await k.hold(2200);
  });

  // ── A second frame beside it. ──
  await k.scene("frame", async () => {
    k.unfocus();
    await k.key("f", "Frame tool");
    k.focus(FRAMES);
    await k.hold(500);
    await pointer.drag(await pt(k, 320, 60), await pt(k, 560, 240), { speed: 1.3 });
    await expect.poll(async () => (await ids(page, "rectangle")).length).toBe(2);
    second = { kind: "rectangle", id: (await ids(page, "rectangle")).find((id) => id !== first.id)! };
    await k.hold(400);
  });

  // ── Both selected, the flow threaded from the command palette. ──
  await k.scene("thread", async () => {
    await k.key("v", "Selection tool");
    await pointer.click(await pt(k, 285, 72), { targetWidth: 30 });
    await page.keyboard.down("Shift");
    await pointer.click(await pt(k, 545, 72), { targetWidth: 30 });
    await page.keyboard.up("Shift");
    await expect.poll(async () => (await selection(page)).length).toBe(2);
    k.unfocus();
    await k.key("Meta+k", "Command palette", "⌘K");
    await k.hold(300);
    await typeHuman(page, "Thread web flow");
    await press(k, page.getByRole("option", { name: /Thread web flow into frames/ }).first());
    await expect.poll(async () => (await webSource(page, first))?.flow?.recipients?.[0]?.id, { timeout: 10_000 }).toBe(second.id);
    await expect.poll(() => sceneText(page, second.id), { timeout: 10_000 }).toContain("Cotton sailor shirt");
    await deselect(k);
    k.focus(FRAMES);
    await k.hold(1600);
  });

  // ── Saved. ──
  let saved = "";
  await k.scene("save", async () => {
    k.unfocus();
    const download = page.waitForEvent("download");
    await k.key("Meta+s", "Save", "⌘S");
    const file = await download;
    saved = join(k.dir, file.suggestedFilename());
    await file.saveAs(saved);
    k.chip(`${file.suggestedFilename()} saved`, "save");
    await k.hold(800);
  });

  // ── Opened again in a fresh editor: frames, flow and source come back. ──
  await k.scene("reopen", async () => {
    const origin = await pt(k, 0, 0);
    await k.cut("a fresh editor", async () => {
      // The save leaves the document marked as edited (a known bug), so the
      // reload asks before leaving; inside the cut, leaving is the answer.
      // openCanvas's handler dismisses every other dialog, which would
      // cancel the reload, so it goes first.
      page.removeAllListeners("dialog");
      page.on("dialog", (d) => void (d.type() === "beforeunload" ? d.accept() : d.dismiss()).catch(() => {}));
      await page.reload({ timeout: 30_000 });
      // No document yet, so no GPU canvas: wait for the editor itself.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const c = (globalThis as unknown as { __canvas?: { client?: unknown; registries?: unknown } }).__canvas;
            return !!c?.client && !!c?.registries;
          }),
        )
        .toBe(true);
      await page.locator("header").getByText("File", { exact: true }).first().waitFor();
      await tapSceneLayers(page);
      await k.hold(800);
    });
    const chooser = page.waitForEvent("filechooser");
    await menu(k, ["File", "Open…"]);
    k.chip(saved.split("/").pop()!, "file");
    await (await chooser).setFiles(saved);
    await expect.poll(async () => (await webFrames(page)).length, { timeout: 15_000 }).toBe(1);
    await expect.poll(() => designer.gpuActive(), { timeout: 30_000 }).toBe(true);
    const back = (await webFrames(page))[0];
    const source = await webSource(page, back);
    expect(source?.css, "the CSS came back").toContain("#e9f5ee");
    expect(source?.flow?.recipients?.length, "the flow came back").toBe(1);
    await expect.poll(() => sceneText(page, source!.flow!.recipients[0].id), { timeout: 15_000 }).toContain("Cotton sailor shirt");
    // Zooms are aimed through the camera logged at the roll: the reopened
    // page must sit where the first one did.
    const now = await pt(k, 0, 0);
    expect(Math.abs(now.x - origin.x) + Math.abs(now.y - origin.y), "the reopened page sits where it did").toBeLessThan(1.5);
    k.focus(FRAMES);
    await k.hold(2200);
  });
});
