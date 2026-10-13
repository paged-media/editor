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

// The six screens on paged.media (website ADR 858), captured from the real
// editor: one still per theme, each state reached through the editor's own
// automation and asserted against the engine before the picture is taken.
// Not a film: no voice, no cursor. Recorded locally (PAGED_MEDIA_ROOT), into
// <media>/.build/stills/<id>.png at 1536×860 CSS px, device scale 2.
//
// Five come from the showcase annual (tests/showcase, a 134-page document
// built by driving this editor, with its fonts registered first so no run
// falls back to a substitute); the catalogue is built here from the data
// film's product list.

import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Designer } from "../../journey/driver/designer";
import { ShowcaseDoc } from "../../showcase/driver";
import { dressStage } from "../kit/stage";

const ROOT = process.env.PAGED_MEDIA_ROOT;
test.skip(!ROOT, "PAGED_MEDIA_ROOT is not set (stills are captured locally)");
test.use({ viewport: { width: 1536, height: 860 }, deviceScaleFactor: 2, colorScheme: "dark" });

const OUT = join(ROOT ?? "", ".build", "stills");
const WORKSPACE = resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const FONTS = join(WORKSPACE, "core", "corpus", "fonts");
/** The showcase annual as the showcase project last built it. */
const SHOWCASE = process.env.SHOWCASE_PAGED ?? join(WORKSPACE, "editor", "apps", "canvas", "showcase", "showcase.paged");
const CSV = join(ROOT ?? "", "assets", "catalogue.csv");

type CanvasGlobal = { __canvas: any };
const canvas = <T>(page: Page, fn: (c: any, arg: any) => T | Promise<T>, arg?: unknown) =>
  page.evaluate(async ({ src, arg }) => new Function("c", "arg", `return (${src})(c, arg)`)((globalThis as unknown as CanvasGlobal).__canvas, arg), { src: fn.toString(), arg });

function editorCommit(): { commit: string; dirty: boolean } {
  const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8" }).trim();
  return { commit: git("rev-parse", "--short", "HEAD"), dirty: git("status", "--porcelain").length > 0 };
}

const record: Record<string, unknown> = {};
function shot(page: Page, id: string, facts: Record<string, unknown>) {
  record[id] = facts;
  return page.screenshot({ path: join(OUT, `${id}.png`) });
}

/** The page under the camera, from the control bar (only shown with nothing selected). */
async function current(page: Page): Promise<number> {
  return Number((await page.locator("[data-control-page]").textContent({ timeout: 3000 }))?.split("/")[0].trim());
}

/** Nothing selected, canvas focused: a click on the pasteboard left of the pages. */
async function deselect(page: Page): Promise<void> {
  const vp = (await page.locator("[data-paged-viewport]").boundingBox())!;
  await page.keyboard.press("Escape");
  // The selection tool: a mode (the raster editor) can leave another armed.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("v");
  await page.mouse.click(vp.x + 12, vp.y + vp.height / 2);
  await page.locator("[data-control-page]").waitFor({ timeout: 5000 });
}

/** The pointer rests on the pasteboard, where it hovers nothing. */
async function park(page: Page): Promise<void> {
  const vp = (await page.locator("[data-paged-viewport]").boundingBox())!;
  await page.mouse.move(vp.x + 10, vp.y + vp.height - 10);
}

/** To page n with the editor's own page keys. */
async function goTo(page: Page, n: number): Promise<void> {
  await deselect(page);
  for (let g = 0; g < 200; g++) {
    const c = await current(page);
    if (c === n) return;
    await page.keyboard.press(c < n ? "PageDown" : "PageUp");
    await page.waitForTimeout(110);
  }
  throw new Error(`could not reach page ${n}`);
}

/** Screen point of a point on page n (pages stack 24 pt apart). */
async function pagePt(page: Page, n: number, x: number, y: number) {
  return canvas(page, (c, a) => {
    const sizes: [number, number][] = c.handle.pageSizesPt;
    let top = 0;
    for (let j = 0; j < a.n - 1; j++) top += sizes[j][1] + 24;
    let best: Element | null = null;
    let area = 0;
    for (const cv of Array.from(document.querySelectorAll("canvas"))) {
      const r = cv.getBoundingClientRect();
      if (r.width * r.height > area) { area = r.width * r.height; best = cv; }
    }
    const wrap = ((best as HTMLElement).parentElement ?? (best as HTMLElement)).getBoundingClientRect();
    const cam = c.client.camera.read();
    return { x: wrap.left + a.x * cam.scale + cam.tx, y: wrap.top + (top + a.y) * cam.scale + cam.ty };
  }, { n, x, y });
}

/** Zoom with the wheel (Ctrl) anchored at a page point, to at least `scale`. */
async function zoomAt(page: Page, n: number, x: number, y: number, scale: number): Promise<number> {
  const at = await pagePt(page, n, x, y);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down("Control");
  for (let i = 0; i < 80; i++) {
    if ((await canvas(page, (c) => c.client.camera.read().scale)) >= scale) break;
    await page.mouse.wheel(0, -10);
    await page.waitForTimeout(40);
  }
  await page.keyboard.up("Control");
  await page.waitForTimeout(700);
  return canvas(page, (c) => c.client.camera.read().scale);
}

/** Close the panels a still opened, so the next one starts from the default dock. */
const hidePanels = (page: Page, match: RegExp) =>
  canvas(page, async (c, src) => {
    const re = new RegExp(src);
    for (const cmd of c.registries.commands.list()) if (cmd.id.startsWith("paged.panel.hide.") && re.test(cmd.id)) await c.registries.commands.invoke(cmd.id);
  }, match.source);

const showPanel = (page: Page, id: string) => canvas(page, (c, i) => c.registries.commands.invoke(`paged.panel.show.${i}`), id);

async function openShowcase(page: Page): Promise<void> {
  await dressStage(page);
  await new Designer(page).open();
  // Fonts BEFORE the document: registration seeds shaping at load.
  await new ShowcaseDoc(page).registerFonts(FONTS);
  await page.setInputFiles('input[type="file"]', SHOWCASE);
  await page.waitForFunction(() => (globalThis as unknown as CanvasGlobal).__canvas?.ready === true && (globalThis as unknown as CanvasGlobal).__canvas.handle?.pageCount === 134, null, { timeout: 120_000 });
  await page.waitForTimeout(2000);
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  if (!existsSync(SHOWCASE)) throw new Error(`no showcase at ${SHOWCASE}: build it with --project=showcase`);
});

test.afterAll(() => {
  const prev = existsSync(join(OUT, "stills.json")) ? JSON.parse(readFileSync(join(OUT, "stills.json"), "utf8")) : {};
  writeFileSync(join(OUT, "stills.json"), `${JSON.stringify({ ...prev, editor: editorCommit(), captured: new Date().toISOString(), stills: { ...(prev.stills ?? {}), ...record } }, null, 2)}\n`);
});

test("stills · from the showcase annual", async ({ page }) => {
  test.setTimeout(600_000);
  await openShowcase(page);

  // ── type: page 29, a caret in a styled paragraph, the paragraph styles. ──
  await goTo(page, 29);
  const hit = await canvas(page, async (c) => (await c.client.send({ kind: "hitTest", payload: { pageId: c.handle.pageIds[28], docPoint: [300, 150], filter: "text" } })).payload);
  expect(hit.storyId, "a story under the paragraph").toBeTruthy();
  await canvas(page, (c, s) => c.setContentSelection({ storyId: s, start: 120, end: 120 }), hit.storyId);
  await showPanel(page, "paged.paragraph-styles");
  const scale29 = await zoomAt(page, 29, 270, 70, 1.2);
  await park(page);
  await expect(page.getByRole("combobox").first()).toHaveValue(/./);
  const caret = await canvas(page, (c) => c.contentSelection);
  expect(caret?.storyId).toBe(hit.storyId);
  // The control bar's style select and the panel both name the caret's style.
  await expect(page.getByText("Field Note", { exact: true }).filter({ visible: true })).toHaveCount(1);
  const barStyle = await page.locator("select:visible").first().evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent);
  expect(barStyle).toBe("Field Note");
  await page.waitForTimeout(800);
  await shot(page, "type", { page: 29, story: hit.storyId, scale: scale29, style: "Field Note" });
  await hidePanels(page, /paragraph-styles$/);

  // ── image: page 71, the photograph open for editing where it sits. ──
  await goTo(page, 71);
  const photo = await canvas(page, async (c) => {
    const ids = (await c.client.marqueeHits(c.handle.pageIds[70], [30, 350, 500, 670])).filter((i: any) => i.kind === "rectangle");
    c.setElementSelection(ids, "replace");
    return ids;
  });
  expect(photo, "one placed photograph").toHaveLength(1);
  await page.locator("header").getByText("Plugins", { exact: true }).first().click();
  await page.getByRole("menuitem", { name: /^Image/ }).first().hover();
  await page.getByRole("menuitem", { name: /^Adjust/ }).first().click();
  await expect(page.getByText("Image adjustments")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/2200×1469 px/).first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => canvas(page, (c) => c.debugContext().editContext?.type ?? null)).toBe("rasterImage");
  // Zoomed once the editing bar has taken its height: the chapter title to the photo's foot.
  const scale71 = await zoomAt(page, 71, 264, 505, 0.93);
  // The menu trigger keeps focus (and its ring) after the click.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await park(page);
  await page.waitForTimeout(1500);
  await shot(page, "image", { page: 71, element: photo[0], pixels: "2200×1469", context: "rasterImage", scale: scale71 });
  await page.keyboard.press("Escape");
  await hidePanels(page, /image/i);
  await page.waitForTimeout(800);

  // ── tables: page 66, a table in its document style, and the table styles. ──
  await goTo(page, 66);
  const story66 = await canvas(page, async (c) => (await c.client.send({ kind: "hitTest", payload: { pageId: c.handle.pageIds[65], docPoint: [264, 400], filter: "any" } })).payload.storyId);
  const tables = await canvas(page, async (c, sid) => {
    const out: Record<string, unknown> = {};
    for (const t of await c.objects.query(`story:${sid} > table`)) out[t] = (await c.objects.get(t, "appliedTableStyle")).value;
    return out;
  }, story66);
  expect(Object.values(tables), "the page plan wears the annual's table style").toEqual(["TableStyle/Annual Table"]);
  await showPanel(page, "paged.table-styles");
  await expect(page.getByText("Annual Table", { exact: true }).filter({ visible: true })).toHaveCount(1);
  const scale66 = await zoomAt(page, 66, 264, 70, 1.05);
  await park(page);
  await page.waitForTimeout(900);
  await shot(page, "tables", { page: 66, story: story66, tables, scale: scale66 });
  await hidePanels(page, /table-styles$/);

  // ── prepress: page 123, Prepress mode, the real output check run. ──
  await goTo(page, 123);
  await page.getByRole("button", { name: "Prepress", exact: true }).last().click();
  await page.getByRole("button", { name: "Validate output" }).first().click();
  const findings = page.getByText(/\d+ finding\(s\)/).first();
  await expect(findings).toBeVisible({ timeout: 60_000 });
  await park(page);
  await page.waitForTimeout(800);
  await shot(page, "prepress", { page: 123, findings: await findings.textContent(), readiness: await page.getByText(/Not ready|Ready/).first().textContent() });
  await page.getByRole("button", { name: "Design", exact: true }).last().click();

  // ── command: the command bar, asked for something no command does. ──
  await goTo(page, 29);
  await showPanel(page, "paged.paragraph-styles");
  await page.keyboard.press("Meta+k");
  const input = page.getByPlaceholder("Ask or search anything…");
  await input.waitFor();
  const ask = "Make every chapter title one size larger";
  await input.pressSequentially(ask, { delay: 15 });
  await expect(page.locator("[data-palette-ai]")).toBeVisible();
  await park(page);
  await page.waitForTimeout(700);
  await shot(page, "command", { page: 29, query: ask });
  await page.keyboard.press("Escape");
});

// ── catalogue: the data film's product list merged into catalogue pages. ──

type Bounds = [number, number, number, number];

async function mutate(page: Page, op: string, args: unknown): Promise<unknown> {
  const reply = (await page.evaluate(
    ([op, args]) => (globalThis as unknown as CanvasGlobal).__canvas.client.mutate({ op, args }),
    [op, args] as const,
  )) as { kind: string };
  if (reply.kind !== "mutationApplied") throw new Error(`${op} was not applied: ${JSON.stringify(reply).slice(0, 300)}`);
  return reply;
}

async function storyAt(page: Page, pageId: string, b: Bounds): Promise<string> {
  const id = await canvas(page, async (c, a) => (await c.client.send({ kind: "hitTest", payload: { pageId: a.pageId, docPoint: [a.x, a.y], filter: "text" } })).payload.storyId ?? null, { pageId, x: (b[1] + b[3]) / 2, y: (b[0] + b[2]) / 2 });
  if (!id) throw new Error(`no story at ${b}`);
  return id;
}

const len = (v: number) => ({ type: "length", value: v });
const txt = (v: string) => ({ type: "text", value: v });
const color = (v: string) => ({ type: "colorRef", value: v });

/** The data film's catalogue template: a running header and one product card
 *  of four <<field>> frames, each in its own paragraph style. */
async function buildTemplate(page: Page, designer: Designer): Promise<void> {
  const ink = await designer.createSwatch("Ink", [28, 26, 38]);
  const teal = await designer.createSwatch("Teal", [14, 116, 144]);
  const grey = await designer.createSwatch("Grey", [104, 100, 118]);
  const styles: Array<[string, string, Array<[string, unknown]>]> = [
    ["ParagraphStyle/Header", "Catalogue header", [["characterFontFamily", txt("Inter")], ["characterFontSize", len(8)], ["characterLeading", len(10)], ["characterTracking", len(140)], ["characterFillColor", color(grey)]]],
    ["ParagraphStyle/Name", "Product name", [["characterFontFamily", txt("Fraunces")], ["characterFontSize", len(17)], ["characterLeading", len(20)], ["characterFillColor", color(ink)]]],
    ["ParagraphStyle/Detail", "Product detail", [["characterFontFamily", txt("Inter")], ["characterFontSize", len(9)], ["characterLeading", len(12)], ["characterFillColor", color(grey)]]],
    ["ParagraphStyle/Price", "Product price", [["characterFontFamily", txt("Inter")], ["characterFontSize", len(13)], ["characterLeading", len(16)], ["characterFillColor", color(teal)]]],
    ["ParagraphStyle/Sku", "Product SKU", [["characterFontFamily", txt("JetBrains Mono")], ["characterFontSize", len(7.5)], ["characterLeading", len(10)], ["characterTracking", len(40)], ["characterFillColor", color(grey)], ["paragraphJustification", txt("RightAlign")]]],
  ];
  for (const [selfId, name, props] of styles) {
    await mutate(page, "createParagraphStyle", { selfId, name, basedOn: null });
    for (const [path, value] of props) await mutate(page, "setStyleProperty", { collection: "paragraph", styleId: selfId, path, value });
  }
  const pageId = await canvas(page, (c) => c.handle.pageIds[0] as string);
  for (const [path, v] of [["pageMarginTop", 84], ["pageMarginLeft", 54], ["pageMarginBottom", 36], ["pageMarginRight", 54]] as const) {
    await mutate(page, "set", { address: `page:${pageId}`, path, value: len(v) });
  }
  const frames: Array<[Bounds, string, string]> = [
    [[40, 54, 56, 558], "DESK & PAPER  ·  SPRING CATALOGUE", "ParagraphStyle/Header"],
    [[84, 54, 110, 294], "<<name>>", "ParagraphStyle/Name"],
    [[110, 54, 138, 294], "<<detail>>", "ParagraphStyle/Detail"],
    [[142, 54, 164, 180], "<<price>>", "ParagraphStyle/Price"],
    [[146, 180, 162, 294], "SKU <<sku>>", "ParagraphStyle/Sku"],
  ];
  for (const [b, text, style] of frames) {
    await mutate(page, "insertTextFrame", { pageId, bounds: b });
    const storyId = await storyAt(page, pageId, b);
    await mutate(page, "insertText", { storyId, offset: 0, text });
    await mutate(page, "applyStyle", { storyId, start: 0, end: text.length, style, scope: "paragraph" });
  }
}

/** Every text frame's text, page by page (the data film's reader). */
async function pageTexts(page: Page): Promise<string[][]> {
  return page.evaluate(async () => {
    type Reply = { kind: string; payload: Record<string, unknown> };
    const c = (globalThis as unknown as { __canvas: { client: { send(m: unknown): Promise<Reply> } } }).__canvas;
    const tree = await c.client.send({ kind: "requestSceneTree" });
    type Node = { kind: string; id?: { kind: string; id: string } | null; children?: Node[] };
    const pages: { kind: string; id: string }[][] = [];
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        if (n.kind === "Page") pages.push((n.children ?? []).map((x) => x.id).filter((id): id is { kind: string; id: string } => !!id && id.kind === "textFrame"));
        else if (n.children) walk(n.children);
      }
    };
    walk(((tree.payload as { roots?: Node[] }).roots ?? []) as Node[]);
    const out: string[][] = [];
    for (const frames of pages) {
      const g = await c.client.send({ kind: "requestElementGeometry", payload: { ids: frames } });
      const texts: string[] = [];
      for (const it of (g.payload as { items?: { storyId?: string }[] }).items ?? []) {
        if (!it.storyId) continue;
        const r = await c.client.send({ kind: "requestStoryContent", payload: { storyId: it.storyId } });
        const content = (r.payload as { content?: { paragraphs: { runs: { text: string }[] }[] } }).content;
        texts.push(content ? content.paragraphs.map((p) => p.runs.map((x) => x.text).join("")).join("\n") : "");
      }
      out.push(texts);
    }
    return out;
  });
}

test("stills · a catalogue merged from product data", async ({ page }) => {
  test.setTimeout(300_000);
  await dressStage(page);
  const designer = new Designer(page);
  await designer.open();
  await designer.newDocument();
  await new ShowcaseDoc(page).registerFonts(FONTS);
  await buildTemplate(page, designer);
  await page.waitForTimeout(800);

  // The product list, into DuckDB, through the Data layout's own import.
  await page.getByRole("button", { name: "Data layout", exact: true }).last().click();
  const chooser = page.waitForEvent("filechooser");
  await page.locator("[data-data-import-csv]:visible").first().click();
  await (await chooser).setFiles(CSV);
  const status = page.locator("[data-status]").last();
  await expect.poll(async () => (await status.getAttribute("data-status").catch(() => null)) ?? "?", { timeout: 60_000 }).toBe("ready");

  // The merge: several records to a page, the template making way.
  await page.getByText("Bindings", { exact: true }).last().click();
  const row = page.locator("[data-data-merge]");
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.locator("[data-data-merge-mode]").selectOption("multiple");
  const keep = row.getByLabel(/keep template/);
  if (await keep.isChecked()) await keep.click();
  await row.locator("[data-data-merge-run]").click();
  const merged = page.locator("[data-data-merge-msg]");
  await expect(merged).toHaveText("merged 24 record(s) onto 2 page(s)", { timeout: 60_000 });
  const texts = (await pageTexts(page)).flat();
  expect(texts.filter((t) => t.includes("<<")), "no field left unmerged").toEqual([]);
  expect(texts.filter((t) => t.startsWith("SKU ")), "one card per record").toHaveLength(24);

  await deselect(page).catch(() => {});
  const scale = await zoomAt(page, 1, 200, 40, 1.0);
  await park(page);
  await page.waitForTimeout(1200);
  await shot(page, "catalogue", { records: 24, pages: 2, message: await merged.textContent(), scale });
});
