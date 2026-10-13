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

// For designers, the audience film for /designers (ADR 224): the website's
// `films/designers.yaml`. A page whose copy is already in a frame, with an
// empty frame beside it, then the
// things a layout person does with it, each through the editor's own
// controls: the threading ports, the Type tool, View ▸ Show text threads, the
// Paragraph styles and Glyphs panels, File ▸ Place…, a frame handle, the
// command palette and the workflow modes. Every step is asserted.
//
// Off camera: the fonts the styles name are registered (OFL faces from
// core's corpus/fonts; the editor has no user path to add a font yet), two
// paragraph styles are defined, the copy is inserted through the same
// insertText op the keyboard uses (the editor has no text paste yet), and the
// second, empty frame is made.

import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { film, type Kit } from "../kit/film";
import { typeHuman } from "../kit/pointer";
import { menu, press, screenPoint } from "../kit/ui";

const MEDIA = process.env.PAGED_MEDIA_ROOT ?? "";
const FONTS = join(import.meta.dirname, "..", "..", "..", "..", "..", "..", "core", "corpus", "fonts");
const PHOTO = join(MEDIA, "assets", "pexels-618833-dolomites.jpg");

type Bounds = [number, number, number, number]; // top, left, bottom, right (pt)
type Rect = [number, number, number, number]; // x0, y0, x1, y1 (pt), for focus()

const LEFT: Bounds = [96, 54, 290, 294];
const RIGHT: Bounds = [96, 318, 290, 558];
const COPY: Rect = [30, 70, 582, 320];
const PICTURE: Rect = [30, 300, 582, 680];
const PLACE_AT = { x: 54, y: 322 };
const CROP_TO = { right: 294, bottom: 560 };

const HEAD = "The quiet page";
const BODY = [
  "Good typography is invisible until it is missing. A line that breaks in the wrong place, a word left alone at the top of a column, a heading that crowds its text: the reader feels each of them without knowing why.",
  "The work of a layout is to remove those small frictions. Measure, leading and rhythm decide how a page reads long before anyone looks at the words themselves.",
  "A grid gives the page its order. Columns, margins and a baseline that every line sits on let text and pictures share a page without arguing.",
  "Styles keep that order from drifting. A heading set once is set everywhere; change the style, and every heading in the document follows it.",
];

interface Item {
  id: { kind: string; id: string };
  bounds: Bounds;
  hasImage: boolean;
  storyId?: string;
}

const pt = (k: Kit, x: number, y: number) => screenPoint(k.page, x, y);
const mid = (b: Bounds) => [(b[1] + b[3]) / 2, (b[0] + b[2]) / 2] as const;

async function mutate(page: Page, op: string, args: unknown): Promise<{ kind: string }> {
  return page.evaluate(async (m) => {
    const c = (globalThis as unknown as { __canvas: { client: { mutate(m: unknown): Promise<{ kind: string }> } } }).__canvas;
    return c.client.mutate(m);
  }, { op, args });
}

async function registerFonts(page: Page): Promise<void> {
  const faces = [
    { family: "Fraunces", style: null, file: "Fraunces-VF.ttf" },
    { family: "Source Serif 4", style: null, file: "SourceSerif4.ttf" },
  ];
  await page.route("**/__film-fonts/*", (route) => {
    const name = decodeURIComponent(route.request().url().split("/__film-fonts/")[1]);
    return route.fulfill({ status: 200, contentType: "font/ttf", body: readFileSync(join(FONTS, name)) });
  });
  await page.evaluate(async (list) => {
    const c = (globalThis as unknown as { __canvas: { client: { registerFont(f: string, b: Uint8Array, s: string | null): Promise<void> } } }).__canvas;
    for (const f of list) {
      const res = await fetch(`/__film-fonts/${encodeURIComponent(f.file)}`);
      if (!res.ok) throw new Error(`font ${f.file}: ${res.status}`);
      await c.client.registerFont(f.family, new Uint8Array(await res.arrayBuffer()), f.style);
    }
  }, faces);
  await page.unroute("**/__film-fonts/*");
}

/** Every page item with its bounds, whether it holds an image, and its story. */
async function items(page: Page): Promise<Item[]> {
  return page.evaluate(async () => {
    type Node = { id?: { kind: string; id: string } | null; children?: Node[] };
    const c = (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<{ output: string[] }>; send(m: unknown): Promise<{ payload: { items?: unknown[] } }> } } }).__canvas;
    const r = await c.client.executeScript("JSON.stringify(paged.tree())");
    const ids: { kind: string; id: string }[] = [];
    const walk = (n: Node) => {
      if (n.id) ids.push(n.id);
      for (const ch of n.children ?? []) walk(ch);
    };
    for (const root of JSON.parse(JSON.parse(r.output[0])) as Node[]) walk(root);
    const g = await c.client.send({ kind: "requestElementGeometry", payload: { ids } });
    return (g.payload.items ?? []) as Item[];
  });
}

async function story(page: Page, storyId: string): Promise<Array<{ style: string; text: string }>> {
  return page.evaluate(async (sid) => {
    const c = (globalThis as unknown as { __canvas: { client: { send(m: unknown): Promise<{ payload: { content?: { paragraphs: Array<{ paragraphStyle: string; runs: Array<{ text: string }> }> } } }> } } }).__canvas;
    const r = await c.client.send({ kind: "requestStoryContent", payload: { storyId: sid } });
    return (r.payload.content?.paragraphs ?? []).map((p) => ({ style: p.paragraphStyle, text: p.runs.map((x) => x.text).join("") }));
  }, storyId);
}

/** Click the pasteboard beside the page with the selection tool. */
async function deselect(k: Kit): Promise<void> {
  await press(k, k.page.locator('[data-tool-slot="select"]').first());
  await k.pointer.click(await pt(k, -110, 420), { targetWidth: 120 });
  await k.hold(200);
}

film("designers", async (k) => {
  const { page, pointer } = k;
  let storyId = "";

  await k.setup(async () => {
    await k.designer.open();
    await k.designer.newDocument();
    await registerFonts(page);
    const styles: Array<[string, string, Array<[string, unknown]>]> = [
      ["ParagraphStyle/Headline", "Headline", [["characterFontFamily", "Fraunces"], ["characterFontSize", 28], ["characterLeading", 32], ["paragraphSpaceAfter", 6]]],
      ["ParagraphStyle/Body", "Body", [["characterFontFamily", "Source Serif 4"], ["characterFontSize", 11], ["characterLeading", 16]]],
    ];
    for (const [selfId, name, props] of styles) {
      await mutate(page, "createParagraphStyle", { selfId, name, basedOn: null });
      for (const [path, v] of props) {
        const value = typeof v === "string" ? { type: "text", value: v } : { type: "length", value: v };
        expect((await mutate(page, "setStyleProperty", { collection: "paragraph", styleId: selfId, path, value })).kind).toBe("mutationApplied");
      }
    }
    const pageId = await page.evaluate(() => (globalThis as unknown as { __canvas: { handle: { pageIds: string[] } } }).__canvas.handle.pageIds[0]);
    await mutate(page, "insertTextFrame", { pageId, bounds: LEFT });
    storyId = (await items(page)).find((i) => i.id.kind === "textFrame")!.storyId!;
    // The empty frame the story will continue into. Made here, not drawn on
    // camera: after a frame is drawn with the Type tool, every later pointer
    // move across the canvas pans the view (a product bug).
    await mutate(page, "insertTextFrame", { pageId, bounds: RIGHT });
    const text = [HEAD, ...BODY].join("\n");
    await mutate(page, "insertText", { storyId, offset: 0, text });
    await mutate(page, "applyStyle", { storyId, start: HEAD.length + 1, end: text.length, style: "ParagraphStyle/Body", scope: "paragraph" });
    await page.keyboard.press("Escape");
    await k.hold(1200);
  });
  await k.roll();

  // ── The copy runs over its frame. ──
  await k.scene("story", async () => {
    k.focus(COPY);
    await k.hold(500);
    await press(k, page.locator('[data-tool-slot="select"]').first());
    const [x, y] = mid(LEFT);
    await pointer.click(await pt(k, x, y), { targetWidth: 120 });
    await expect(page.locator('[data-thread-port="out"]')).toHaveAttribute("data-thread-state", "overset");
    await k.hold(600);
  });

  // ── Thread the story into it. ──
  await k.scene("thread", async () => {
    // The copy frame is still selected from the last scene: its out-port is
    // the red marker.
    await press(k, page.locator('[data-thread-port="out"]').first());
    await k.hold(300);
    const [rx, ry] = mid(RIGHT);
    await pointer.click(await pt(k, rx, ry), { targetWidth: 120 });
    await expect
      .poll(async () => (await items(page)).filter((i) => i.id.kind === "textFrame" && i.storyId === storyId).length)
      .toBe(2);
    await expect(page.locator('[data-thread-port="out"]')).not.toHaveAttribute("data-thread-state", "overset");
    await k.hold(400);
  });

  // ── Where the story goes. ──
  await k.scene("threads", async () => {
    k.unfocus();
    await menu(k, ["View", "Show text threads"]);
    await expect(page.locator("[data-thread-hop]")).toHaveCount(1);
    // Punch-ins hold at least 2 s, or the compositor drops them as twitches.
    k.focus(COPY);
    await k.hold(2200);
  });

  // ── The heading takes its style. ──
  await k.scene("styles", async () => {
    k.unfocus();
    await press(k, page.locator('[data-tool-slot="type"]').first());
    await pointer.click(await pt(k, LEFT[1] + 30, LEFT[0] + 8), { targetWidth: 40 });
    await menu(k, ["Type", "Paragraph styles"]);
    await press(k, page.locator('[data-apply-item="ParagraphStyle/Headline"]').first());
    await expect.poll(async () => (await story(page, storyId))[0]?.style).toBe("ParagraphStyle/Headline");
    k.focus(COPY);
    await k.hold(2200);
  });

  // ── A character from the Glyphs panel. ──
  await k.scene("glyph", async () => {
    k.unfocus();
    await k.key("End");
    await menu(k, ["Type", "Glyphs…"]);
    await press(k, page.locator('[data-glyph="†"]:visible').first());
    await expect.poll(async () => (await story(page, storyId))[0]?.text).toBe(`${HEAD}†`);
    k.focus(COPY);
    await k.hold(2200);
    k.unfocus();
    await deselect(k);
  });

  // ── A photograph, placed at its own size. ──
  await k.scene("place", async () => {
    const chooser = page.waitForEvent("filechooser");
    await menu(k, ["File", "Place…"]);
    k.chip("dolomites.jpg", "file");
    await (await chooser).setFiles(PHOTO);
    await k.hold(500);
    await pointer.click(await pt(k, PLACE_AT.x, PLACE_AT.y), { targetWidth: 40 });
    await expect.poll(async () => (await items(page)).some((i) => i.hasImage)).toBe(true);
    k.focus(PICTURE);
    await k.hold(900);
  });

  // ── Cropped by its frame. ──
  await k.scene("crop", async () => {
    const photo = (await items(page)).find((i) => i.hasImage)!;
    await pointer.drag(await pt(k, photo.bounds[3], photo.bounds[2]), await pt(k, CROP_TO.right, CROP_TO.bottom), { speed: 0.9 });
    await expect
      .poll(async () => (await items(page)).find((i) => i.hasImage)?.bounds.map(Math.round))
      .toEqual([Math.round(photo.bounds[0]), Math.round(photo.bounds[1]), CROP_TO.bottom, CROP_TO.right]);
    await deselect(k);
    await k.hold(900);
  });

  // ── Every command by name. ──
  await k.scene("palette", async () => {
    k.unfocus();
    await k.key("Meta+k", "Command palette", "⌘K");
    await k.hold(300);
    await typeHuman(page, "show text threads", 11);
    await k.hold(300);
    await press(k, page.locator('[role="option"], [cmdk-item]').filter({ hasText: /^Show text threads/ }).first());
    await expect(page.locator("[data-thread-hop]")).toHaveCount(0);
    await k.hold(600);
  });

  // ── The workspace follows the job. ──
  await k.scene("modes", async () => {
    const mode = () => page.evaluate(() => (globalThis as unknown as { __canvas: { mode?: string } }).__canvas.mode ?? null);
    for (const [label, id] of [["Content", "content"], ["Export", "export"], ["Design", "design"]] as const) {
      await press(k, page.getByRole("button", { name: label, exact: true }).last());
      await expect.poll(mode).toBe(id);
      await k.hold(label === "Design" ? 400 : 1000);
    }
  });
});
