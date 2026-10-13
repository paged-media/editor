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

// The home film (ADR 224): the website's `films/home.yaml`, on the editor's
// own 134-page showcase annual. Everything the voice describes happens
// through the editor's controls: File ▸ Open…, the Document Map's search,
// the Type tool, Window ▸ Developer ▸ Script, the AI Assistant card and the
// export centre. Each step is asserted against the engine.
//
// Claude's replies come from a tape (kit/ai-tape.ts): recorded once from the
// dev server's /api/ai proxy with AI_TAPE=record and the user's own key, and
// streamed back at their own pace in every take.
//
// Off camera, the annual's open-licensed typefaces (core's corpus/fonts, the
// faces the showcase was built with) are given to the engine, the way the
// showcase build does: the .paged file names its fonts but does not carry
// them, and the editor has no user path to add fonts yet.

import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { film, type Kit } from "../kit/film";
import { hover, menu, press, screenPoint } from "../kit/ui";
import { typeHuman } from "../kit/pointer";
import { aiTape } from "../kit/ai-tape";
import { ShowcaseDoc } from "../../showcase/driver";
import { CORPUS_FONTS } from "../../showcase/chapter";

const ROOT = process.env.PAGED_MEDIA_ROOT ?? "";
const DOC = join(import.meta.dirname, "..", "..", "..", "showcase", "showcase.paged");
/** Pages stack vertically, 540 × 720 pt, 24 pt apart (ui/layout.ts). */
const PAGE_STEP = 744;
const pageTop = (n: number) => (n - 1) * PAGE_STEP;
/** The contact sheet's middle-left photo, page 88 (spread 88–89), in the
 *  spread's own coordinates: top, left, bottom, right. */
const PHOTO_BOUNDS = [304, -480, 391, -350];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TreeNode {
  id?: { kind: string; id: string } | null;
  kind?: string;
  children?: TreeNode[];
  pluginMetadata?: unknown[];
}

async function tree(page: Page): Promise<TreeNode[]> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<{ output: string[] }> } } }).__canvas;
    const r = await c.client.executeScript("JSON.stringify(paged.tree())");
    return JSON.parse(JSON.parse(r.output[0])) as TreeNode[];
  });
}

/** Kinds and plugin envelopes on one spread (the tree lists a spread's
 *  items under its first page). */
function census(spread: TreeNode): { kinds: Record<string, number>; plugins: string[] } {
  const kinds: Record<string, number> = {};
  const plugins = new Set<string>();
  const walk = (n: TreeNode) => {
    if (n.kind && n.id) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
    for (const m of n.pluginMetadata ?? []) {
      const key = typeof m === "string" ? m : JSON.stringify(m);
      const hit = /x-paged:media\.paged\.([a-z]+)/.exec(key);
      if (hit) plugins.add(hit[1]);
    }
    for (const ch of n.children ?? []) walk(ch);
  };
  for (const ch of spread.children ?? []) walk(ch);
  return { kinds, plugins: [...plugins] };
}

async function props(page: Page, kind: string, id: string): Promise<Record<string, string>> {
  return page.evaluate(
    async ({ kind, id }) => {
      const c = (globalThis as unknown as { __canvas: { client: { elementProperties(r: unknown): Promise<{ entries: Array<{ path: string; value?: { value?: unknown } }> } | null> } } }).__canvas;
      const r = await c.client.elementProperties({ kind, id });
      return Object.fromEntries((r?.entries ?? []).map((e) => [e.path, JSON.stringify(e.value?.value ?? null)]));
    },
    { kind, id },
  );
}

/** The story the text caret is in. */
async function caretStory(page: Page): Promise<string> {
  return page.evaluate(
    () => (globalThis as unknown as { __canvas: { contentSelection?: { storyId: string } | null } }).__canvas.contentSelection?.storyId ?? "",
  );
}

/** A story's character count (paged.stories, the script door's own list):
 *  a stray keystroke in the text changes it. */
async function storyLength(page: Page, storyId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const c = (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<{ output: string[]; error: string | null }> } } }).__canvas;
    const r = await c.client.executeScript("paged.stories()");
    if (r.error) return `error: ${r.error}`;
    const list = JSON.parse(r.output[0]) as Array<{ selfId: string; characterCount: number }>;
    const s = list.find((x) => x.selfId === id || x.selfId.endsWith(`/${id}`) || id.endsWith(`/${x.selfId}`));
    return s ? `${s.selfId}: ${s.characterCount} chars` : `no story ${id}`;
  }, storyId);
}

/** Punch in on a rectangle of the recording in CSS px, aimed through the
 *  camera as it is now (call after k.recamera()). */
async function aimCss(k: Kit, [x0, y0, x1, y1]: [number, number, number, number], max?: number): Promise<void> {
  const o = await screenPoint(k.page, 0, 0);
  const s = (await screenPoint(k.page, 100, 0)).x - o.x;
  const doc = (x: number, y: number) => [(x - o.x) / (s / 100), (y - o.y) / (s / 100)];
  const [a, b] = doc(x0, y0);
  const [c, d] = doc(x1, y1);
  k.focus([a, b, c, d], max);
}

/** Hold until a scene's line has been spoken (the kit's plan: the voice
 *  starts leadMs into the scene and speaks for speechMs), so a move to the
 *  next subject never starts under the line about this one. */
async function afterLine(k: Kit, id: string, sceneStart: number): Promise<void> {
  const plan = JSON.parse(readFileSync(join(ROOT, ".build", "plans", "home.json"), "utf8")) as {
    scenes: Array<{ id: string; leadMs: number; speechMs: number }>;
  };
  const s = plan.scenes.find((x) => x.id === id)!;
  await k.hold(Math.max(0, sceneStart + s.leadMs + s.speechMs + 200 - Date.now()));
}

/** Jump to a spread with the Document Map's search: type the page number,
 *  click its entry, let the camera settle, log the new camera. */
async function go(k: Kit, n: number | "Cover"): Promise<void> {
  const search = k.page.locator("[data-document-map-search] input, input[data-document-map-search]").first();
  await press(k, search);
  await k.page.keyboard.press("Meta+a");
  await typeHuman(k.page, n === "Cover" ? "1" : String(n), n === "Cover" ? 3 : n);
  await k.hold(120);
  const entry = k.page
    .locator("[data-document-map-spread]")
    .filter({ hasText: n === "Cover" ? /^Cover/ : new RegExp(`Pages ${n}–`) })
    .first();
  await press(k, entry);
  // The page is on screen when its middle sits inside the canvas.
  const target = n === "Cover" ? 1 : n;
  await expect
    .poll(async () => {
      const p = await screenPoint(k.page, 270, pageTop(target) + 360);
      return p.y > 150 && p.y < 900 && p.x > 300 && p.x < 1300;
    }, { timeout: 8000 })
    .toBe(true);
  await k.hold(600);
  await k.recamera();
}

film("home", async (k) => {
  const { page, designer, pointer } = k;
  const doc = new ShowcaseDoc(page);
  let spreads: TreeNode[] = [];
  let photoId = "";
  let typedStory = "";
  let typedLength = "";
  let before: Record<string, string> = {};

  await k.setup(async () => {
    await aiTape(page, ROOT, "home");
    await designer.open();
    await designer.newDocument();
    await doc.registerFonts(CORPUS_FONTS);
    await k.key("v");
    await k.hold(600);
  });
  await k.roll();

  // Each scene starts on its subject: the move to the next subject (a page,
  // a panel) happens at the end of the scene before, inside its tail, so the
  // voice never describes a page the camera has not reached.

  // ── A whole book from one file. The load and the editor's fit-all view
  //    are cut: at 1 % the cover renders far too large (reported). ──
  await k.scene("open", async () => {
    const chooser = page.waitForEvent("filechooser");
    await menu(k, ["File", "Open…"]);
    k.chip("showcase.paged", "file");
    await (await chooser).setFiles(DOC);
    // The last frame before a cut is what shows until a new one arrives (a
    // still screen sends none): let the menu close, but not long enough for
    // the book to land in the fit-all view.
    await k.hold(250);
    await k.cut("load", async () => {
      await page.waitForFunction(() => ((globalThis as unknown as { __canvas?: { handle?: { pageCount?: number } } }).__canvas?.handle?.pageCount ?? 0) > 100, null, {
        timeout: 120_000,
      });
      expect(await page.evaluate(() => (globalThis as unknown as { __canvas: { handle: { pageCount: number } } }).__canvas.handle.pageCount)).toBe(134);
      // What the montage's spreads hold, read while the book settles.
      spreads = await tree(page);
      expect(spreads.length).toBe(68);
      const draw = census(spreads[39]);
      const image = census(spreads[44]);
      expect((draw.kinds.Polygon ?? 0) + (draw.kinds.GraphicLine ?? 0), "the drawing office has vector paths").toBeGreaterThan(20);
      expect(image.kinds.Rectangle ?? 0, "the contact sheet has its photo frames").toBeGreaterThanOrEqual(6);
      expect(census(spreads[48]).plugins, "the chart wall is paged.sheet's").toContain("sheet");
      expect(census(spreads[52]).plugins, "the long read's frame is paged.web's").toContain("web");
      expect(census(spreads[55]).plugins, "the record card is paged.data's").toContain("data");
      // The photo Claude will frame, by its place on the contact sheet.
      const rects = (spreads[44].children ?? []).flatMap((p) => p.children ?? []).filter((c) => c.id?.kind === "rectangle");
      for (const r of rects) {
        const b = JSON.parse((await props(page, "rectangle", r.id!.id)).frameBounds ?? "null") as number[] | null;
        if (b && b.every((v, i) => Math.abs(v - PHOTO_BOUNDS[i]) < 1)) photoId = r.id!.id;
      }
      expect(photoId, "found the contact sheet photo").not.toBe("");
      const cover = page.locator("[data-document-map-spread]").filter({ hasText: /^Cover/ }).first();
      await cover.click();
      await expect.poll(async () => (await screenPoint(page, 270, 360)).y > 150 && (await screenPoint(page, 270, 360)).y < 900, { timeout: 8000 }).toBe(true);
      await sleep(1200);
      // A caret in the map's search blinks, so frames keep coming after the
      // cut; the next move types there anyway.
      await page.locator("[data-document-map-search] input, input[data-document-map-search]").first().focus();
    });
    await k.recamera();
  });

  // ── 134 pages, laid out live; then to the paragraph composer's spread. ──
  await k.scene("cover", async () => {
    const t0 = Date.now();
    expect(await designer.gpuActive(), "the book renders on WebGPU").toBe(true);
    k.focus([-40, -30, 580, 750], 1.4);
    await k.hold(2600);
    await afterLine(k, "cover", t0);
    k.unfocus();
    await go(k, 24);
  });

  // ── Type, set like print: the caret in a body paragraph shows its style
  //    and face in the control bar. Then out of the text by the rail's
  //    Selection tool (a key would land in the story) and on to the
  //    drawing office. ──
  await k.scene("type", async () => {
    const t0 = Date.now();
    await k.key("t", "Type tool");
    await pointer.click(await screenPoint(page, 200, pageTop(24) + 300), { targetWidth: 40 });
    // The control bar's style and face pickers now name the paragraph's.
    const picked = () =>
      page.$$eval("select", (els) => els.filter((e) => e.getBoundingClientRect().top < 110).map((e) => (e as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() ?? ""));
    await expect.poll(picked).toEqual(expect.arrayContaining(["Annual Body", "EB Garamond"]));
    typedStory = await caretStory(page);
    expect(typedStory, "the caret is in a story").not.toBe("");
    [typedLength] = await Promise.all([storyLength(page, typedStory), k.hold(700)]);
    k.focus([30, pageTop(24) + 60, 510, pageTop(24) + 420], 1.8);
    await k.hold(1500);
    await afterLine(k, "type", t0);
    k.unfocus();
    await press(k, page.locator('[data-tool-slot="select"]'));
    await go(k, 78);
  });

  // ── Drawings, photographs, charts and web pages, a page each; every
  //    scene arrives on its page before its line, the last on the record
  //    card. ──
  for (const [id, next] of [["plugins", 88], ["photos", 96], ["charts", 104], ["web", 110]] as const) {
    await k.scene(id, async () => {
      const t0 = Date.now();
      await k.hold(1000);
      await afterLine(k, id, t0);
      await go(k, next);
    });
  }

  // ── Records merged into the layout (experimental); then the Script panel. ──
  await k.scene("records", async () => {
    const t0 = Date.now();
    await k.hold(1000);
    await afterLine(k, "records", t0);
    await menu(k, ["Window", "Developer", "Script"]);
    await expect(page.locator("[data-script-editor]")).toBeVisible();
  });

  // ── One line of script; then to the contact sheet, a photo selected and
  //    the AI Assistant open. ──
  await k.scene("script", async () => {
    const panel = page.locator("[data-script-editor]");
    const source = panel.locator("[data-script-source]");
    await press(k, source);
    await page.keyboard.press("Meta+a");
    await page.keyboard.press("Backspace");
    const box = await source.boundingBox();
    if (box) await aimCss(k, [box.x - 40, box.y - 90, box.x + box.width + 30, box.y + 260], 2);
    await typeHuman(page, "console.log(JSON.parse(paged.pages()).length)", 11);
    await k.hold(300);
    await press(k, panel.locator("[data-action=run]"));
    const log = panel.locator("[data-script-log]");
    await expect(log).toContainText("134");
    // The answer prints at the panel's foot, far below the source.
    const logBox = await log.boundingBox();
    if (logBox) await aimCss(k, [logBox.x - 40, logBox.y - 120, logBox.x + logBox.width + 30, logBox.y + 60], 2);
    await k.hold(1800);
    k.unfocus();
    await go(k, 88);
    before = await props(page, "rectangle", photoId);
    await press(k, page.locator('[data-tool-slot="select"]'));
    // Page-local centre of the photo: spread x + 540, on page 88.
    await pointer.click(await screenPoint(page, (-480 + -350) / 2 + 540, pageTop(88) + (304 + 391) / 2), { targetWidth: 60 });
    await expect
      .poll(() => page.evaluate(() => JSON.stringify((globalThis as unknown as { __canvas: { elementSelection: unknown } }).__canvas.elementSelection)))
      .toContain(photoId);
    await press(k, page.getByText("Properties", { exact: true }).first());
    // The button sits at the foot of the Properties panel, below the fold
    // for a picture: the panel scrolls to it, as it would for a person.
    const askButton = page.getByText("Ask the AI Assistant…", { exact: true }).first();
    await askButton.scrollIntoViewIfNeeded();
    await k.hold(300);
    await press(k, askButton);
    await expect(page.locator("[data-ai-assistant]")).toBeVisible();
  });

  // ── The request, typed in plain words. ──
  await k.scene("ask", async () => {
    const card = page.locator("[data-ai-assistant]");
    const photo = await screenPoint(page, -480 + 540 - 30, pageTop(88) + 304 - 60);
    const cardBox = await card.boundingBox();
    if (cardBox) await aimCss(k, [photo.x - 20, photo.y - 20, cardBox.x + cardBox.width, cardBox.y + cardBox.height * 0.75], 1.6);
    await press(k, card.locator("[data-ai-input]"));
    await typeHuman(page, "Frame this photo with a six point black border.", 5);
    await k.hold(300);
  });

  // ── Claude reads the page, writes a script and runs it. ──
  await k.scene("claude", async () => {
    const card = page.locator("[data-ai-assistant]");
    await press(k, card.getByRole("button", { name: "Ask Claude" }));
    // Claude's reply streams at its own pace; a long wait is cut, and the
    // film says by how much.
    // An error (no key on the dev server) ends the take at once, not after
    // the long wait.
    const summary = card.locator("[data-ai-summary]");
    const settled = card.locator("[data-ai-summary], [data-ai-error]").first();
    const quick = await settled.waitFor({ timeout: 7000 }).then(() => true, () => false);
    if (!quick) await k.cut("claude", () => settled.waitFor({ timeout: 180_000 }));
    const error = card.locator("[data-ai-error]");
    if (await error.count()) throw new Error(`the AI Assistant reported: ${await error.first().innerText()}`);
    await expect(summary).toBeVisible();
    await expect(card.locator("[data-ai-step=ok]").first()).toBeVisible();
    const after = await props(page, "rectangle", photoId);
    expect(Number(after.frameStrokeWeight), "Claude gave the photo a border").toBeGreaterThan(0);
    expect(after.frameStrokeWeight).not.toBe(before.frameStrokeWeight);
    await k.hold(1600);
  });

  // ── One undo takes all of it back. ──
  await k.scene("undo", async () => {
    const card = page.locator("[data-ai-assistant]");
    await press(k, card.locator("[data-cockpit-action=ai-undo]"));
    await expect(card).toHaveAttribute("data-ai-assistant-state", "idle");
    const undone = await props(page, "rectangle", photoId);
    const differ = Object.keys(before).filter((key) => undone[key] !== before[key]);
    expect(differ, "one undo restored every property Claude changed").toEqual([]);
    await k.hold(900);
  });

  // ── Out as IDML and as PDF, from the export centre. ──
  await k.scene("export", async () => {
    k.unfocus();
    await press(k, page.getByRole("button", { name: "Export", exact: true }).last());
    await k.hold(500);
    const idml = page.waitForEvent("download");
    await press(k, page.locator('[data-plugin-export="media.paged.publish.exporter.idml"]'));
    const idmlFile = await idml;
    k.chip(`${idmlFile.suggestedFilename()} saved`, "save");
    await idmlFile.saveAs(join(k.dir, "exported.idml"));
    const idmlBytes = readFileSync(join(k.dir, "exported.idml"));
    expect(idmlBytes.subarray(0, 2).toString()).toBe("PK");
    expect(idmlBytes.includes(Buffer.from("designmap.xml")), "an IDML package").toBe(true);
    await k.hold(600);
    await press(k, page.getByRole("button", { name: /^Export…$/ }).first());
    const dialog = page.locator("[role=dialog], dialog").first();
    await expect(dialog).toBeVisible();
    // PDF/X-4 needs an output-intent profile this document has not got;
    // PDF 1.7 does not.
    const conformance = dialog.locator("select").first();
    await hover(k, conformance);
    await conformance.selectOption({ label: "PDF 1.7" });
    await k.hold(400);
    const pdf = page.waitForEvent("download");
    await press(k, dialog.getByRole("button", { name: /^Export$/ }));
    let pdfFile = await Promise.race([pdf, sleep(3000).then(() => null)]);
    if (!pdfFile) await k.cut("pdf", async () => void (pdfFile = await pdf));
    k.chip(`${pdfFile!.suggestedFilename()} saved`, "save");
    await pdfFile!.saveAs(join(k.dir, "exported.pdf"));
    expect(readFileSync(join(k.dir, "exported.pdf")).subarray(0, 5).toString()).toBe("%PDF-");
    // The type scene changed no text (checked while the shot holds).
    const [typedAfter] = await Promise.all([storyLength(page, typedStory), k.hold(1400)]);
    expect(typedAfter, "the type scene changed no text").toBe(typedLength);
  });
});
