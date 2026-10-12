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

// paged.data, the plugin film (ADR 224): the website's `films/data.yaml`.
// A catalogue card template, the product list imported into DuckDB in the
// Data layout, a Data Merge that replaces the template page with the records,
// and a barcode bound to the data. Everything goes through the editor's own controls, every step is
// asserted against the engine, and DuckDB is the real engine
// (REQUIRE_REAL_DUCKDB=1), never a mock.
//
// The template keeps one paragraph style per frame on purpose: a merge copies
// story-level formatting, not formatting that varies inside a story (plugin-data
// docs/status.md, Data Merge limits), so a card is four frames, not one.

import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { film, type Kit } from "../kit/film";
import { hover, press, screenPoint } from "../kit/ui";

const MEDIA = process.env.PAGED_MEDIA_ROOT ?? "";
const CSV = join(MEDIA, "assets", "catalogue.csv");
const FONTS = join(import.meta.dirname, "..", "..", "..", "..", "..", "..", "core", "corpus", "fonts");
const RECORDS = 24;

/** Page 2's top in document space: pages stack 24 pt apart (ui/layout.ts). */
const PAGE2_Y = 792 + 24;

type Bounds = [number, number, number, number]; // top, left, bottom, right

const pt = (k: Kit, x: number, y: number) => screenPoint(k.page, x, y);

async function mutate(page: Page, op: string, args: unknown): Promise<{ kind: string; payload: { createdId?: unknown } }> {
  const r = await page.evaluate(
    ([op, args]) => (globalThis as unknown as { __canvas: { client: { mutate(m: unknown): Promise<unknown> } } }).__canvas.client.mutate({ op, args }),
    [op, args] as const,
  );
  const reply = r as { kind: string; payload: { createdId?: unknown } };
  if (reply.kind !== "mutationApplied") throw new Error(`${op} was not applied: ${JSON.stringify(reply).slice(0, 300)}`);
  return reply;
}

/** Register corpus faces with the engine (the showcase's recipe, three faces). */
async function registerFonts(page: Page): Promise<void> {
  const faces = [
    { family: "Fraunces", style: null, file: "Fraunces-VF.ttf" },
    { family: "Inter", style: null, file: "Inter.ttf" },
    { family: "JetBrains Mono", style: null, file: "JetBrainsMono-VF.ttf" },
  ];
  await page.route("**/__film-fonts/*", (route) => {
    const name = decodeURIComponent(route.request().url().split("/__film-fonts/")[1]);
    return route.fulfill({ status: 200, contentType: "font/ttf", body: readFileSync(join(FONTS, name)) });
  });
  try {
    await page.evaluate(async (list) => {
      const c = (globalThis as unknown as { __canvas: { client: { registerFont(f: string, b: Uint8Array, s: string | null): Promise<void> } } }).__canvas;
      for (const f of list) {
        const res = await fetch(`/__film-fonts/${encodeURIComponent(f.file)}`);
        if (!res.ok) throw new Error(`font ${f.file}: ${res.status}`);
        await c.client.registerFont(f.family, new Uint8Array(await res.arrayBuffer()), f.style);
      }
    }, faces);
  } finally {
    await page.unroute("**/__film-fonts/*");
  }
}

/** The text story a frame owns, by a hit test at its centre (the showcase's way). */
async function storyAt(page: Page, pageId: string, b: Bounds): Promise<string> {
  const storyId = await page.evaluate(
    async ([pid, x, y]) => {
      const c = (globalThis as unknown as { __canvas: { client: { send(m: unknown): Promise<{ payload: { storyId?: string | null } }> } } }).__canvas;
      return (await c.client.send({ kind: "hitTest", payload: { pageId: pid, docPoint: [x, y], filter: "text" } })).payload.storyId ?? null;
    },
    [pageId, (b[1] + b[3]) / 2, (b[0] + b[2]) / 2] as const,
  );
  if (!storyId) throw new Error(`no story at ${b}`);
  return storyId;
}

const len = (v: number) => ({ type: "length", value: v });
const txt = (v: string) => ({ type: "text", value: v });
const color = (v: string) => ({ type: "colorRef", value: v });

/** The catalogue template: a running header and one product card of four
 *  frames at the page's top-left margin, each frame in one paragraph style. */
async function buildTemplate(k: Kit): Promise<void> {
  const { page, designer } = k;
  await registerFonts(page);
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
  const pageId = (await page.evaluate(() => (globalThis as unknown as { __canvas: { handle: { pageIds: string[] } } }).__canvas.handle.pageIds[0]));
  // The merge lays records out from the margin box: 84 pt at the top leaves
  // room for the running header, which (no <<field>> in it) repeats on
  // every merged page.
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

/** Every text frame's text, page by page. */
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

/** The roll-time camera, so a zoom can be aimed at anything on screen (a
 *  panel, or a page after the camera moved): the kit aims zooms in page
 *  points through the camera it logged at the roll. */
let cam0 = { ox: 0, oy: 0, s: 1 };
function focusBox(k: Kit, box: { x: number; y: number; width: number; height: number }, pad = 12, max?: number): void {
  const x0 = (box.x - pad - cam0.ox) / cam0.s;
  const y0 = (box.y - pad - cam0.oy) / cam0.s;
  const x1 = (box.x + box.width + pad - cam0.ox) / cam0.s;
  const y1 = (box.y + box.height + pad - cam0.oy) / cam0.s;
  k.focus([x0, y0, x1, y1], max);
}
async function focusOn(k: Kit, l: Locator, pad = 12, max?: number): Promise<void> {
  const b = await l.boundingBox();
  if (!b) throw new Error(`no box for ${l}`);
  focusBox(k, b, pad, max);
}
async function focusPagePt(k: Kit, x0: number, y0: number, x1: number, y1: number, max?: number): Promise<void> {
  const a = await pt(k, x0, y0);
  const b = await pt(k, x1, y1);
  focusBox(k, { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }, 0, max);
}

/** Every element of a kind, with its bounds (page-local: top, left, bottom, right). */
async function elements(page: Page, kind: string): Promise<Array<{ id: string; bounds: Bounds }>> {
  return page.evaluate(async (want) => {
    type Reply = { kind: string; payload: Record<string, unknown> };
    const c = (globalThis as unknown as { __canvas: { client: { send(m: unknown): Promise<Reply> } } }).__canvas;
    const tree = await c.client.send({ kind: "requestSceneTree" });
    type Node = { id?: { kind: string; id: string } | null; children?: Node[] };
    const ids: { kind: string; id: string }[] = [];
    const walk = (ns: Node[]) => {
      for (const n of ns) {
        if (n.id?.kind === want) ids.push(n.id);
        if (n.children) walk(n.children);
      }
    };
    walk(((tree.payload as { roots?: Node[] }).roots ?? []) as Node[]);
    if (!ids.length) return [];
    const g = await c.client.send({ kind: "requestElementGeometry", payload: { ids } });
    return ((g.payload as { items?: { id: { id: string }; bounds: [number, number, number, number] }[] }).items ?? []).map((it) => ({ id: it.id.id, bounds: it.bounds }));
  }, kind);
}

/** Read an EAN-13 back from its bars: 95 modules between the outer guards,
 *  each dark when a bar covers its centre, decoded with the L/G/R tables. */
function decodeEan13(bars: Bounds[]): string {
  const left = Math.min(...bars.map((b) => b[1]));
  const right = Math.max(...bars.map((b) => b[3]));
  const unit = (right - left) / 95;
  let bits = "";
  for (let m = 0; m < 95; m++) {
    const x = left + (m + 0.5) * unit;
    bits += bars.some((b) => x > b[1] && x < b[3]) ? "1" : "0";
  }
  const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const G = L.map((c) => [...c].map((x) => (x === "1" ? "0" : "1")).reverse().join(""));
  const R = L.map((c) => [...c].map((x) => (x === "1" ? "0" : "1")).join(""));
  const FIRST = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
  if (bits.slice(0, 3) !== "101" || bits.slice(45, 50) !== "01010" || bits.slice(92) !== "101") throw new Error(`not an EAN-13 bar pattern: ${bits}`);
  let parity = "";
  let digits = "";
  for (let i = 0; i < 6; i++) {
    const c = bits.slice(3 + i * 7, 10 + i * 7);
    const l = L.indexOf(c);
    const g = G.indexOf(c);
    if (l >= 0) (digits += l), (parity += "L");
    else if (g >= 0) (digits += g), (parity += "G");
    else throw new Error(`left digit ${i}: ${c}`);
  }
  for (let i = 0; i < 6; i++) {
    const r = R.indexOf(bits.slice(50 + i * 7, 57 + i * 7));
    if (r < 0) throw new Error(`right digit ${i}`);
    digits += r;
  }
  const first = FIRST.indexOf(parity);
  if (first < 0) throw new Error(`parity ${parity}`);
  return `${first}${digits}`;
}

/** Choose an option in a native select: the pointer goes to the field and
 *  the value changes in it (headless Chrome paints no popup). */
async function choose(k: Kit, field: Locator, value: string): Promise<void> {
  await hover(k, field);
  await k.hold(250);
  await field.selectOption(value);
  await expect(field).toHaveValue(value);
  await k.hold(250);
}

film("data", async (k) => {
  const { page, designer, pointer } = k;
  const visible = (sel: string) => page.locator(`${sel}:visible`).first();

  await k.setup(async () => {
    await designer.open();
    await designer.newDocument();
    await buildTemplate(k);
    await k.key("v");
    await k.hold(800);
    // The template is what the page shows; nothing is merged yet.
    expect((await pageTexts(page)).flat()).toContain("<<name>>");
  });
  await k.roll();
  {
    const o = await pt(k, 0, 0);
    const x = await pt(k, 100, 0);
    cam0 = { ox: o.x, oy: o.y, s: (x.x - o.x) / 100 };
  }

  // ── The template: one card of <<fields>>. ──
  await k.scene("template", async () => {
    await k.hold(600);
    k.focus([34, 26, 330, 176]);
    await k.hold(1200);
    await pointer.moveTo(await pt(k, 120, 96), { targetWidth: 40 });
    await k.hold(900);
    await pointer.moveTo(await pt(k, 120, 153), { targetWidth: 40 });
  });

  // ── The product list, into DuckDB, in the Data layout. ──
  await k.scene("import", async () => {
    k.unfocus();
    await press(k, page.getByRole("button", { name: "Data layout", exact: true }).last());
    await k.hold(700);
    const chooser = page.waitForEvent("filechooser");
    await press(k, visible("[data-data-import-csv]"));
    k.chip("catalogue.csv", "file");
    await (await chooser).setFiles(CSV);
    const status = page.locator("[data-status]").last();
    await expect.poll(async () => (await status.getAttribute("data-status").catch(() => null)) ?? "?", { timeout: 60_000 }).toBe("ready");
    await expect(page.getByText("catalogue", { exact: true }).first()).toBeVisible();
    await focusOn(k, visible("[data-data-import-csv]").locator("xpath=.."), 16, 1.6);
    await k.hold(1500);
  });

  // ── Its columns, read through the query panel. ──
  await k.scene("columns", async () => {
    k.unfocus();
    await press(k, page.getByRole("tab", { name: /Dataset preview/ }).first().or(page.getByText("Dataset preview", { exact: true }).first()));
    await k.hold(500);
    await press(k, page.getByRole("button", { name: "Open Data query" }));
    await k.hold(600);
    await press(k, page.getByRole("button", { name: "Read columns" }));
    const cols = page.getByText(/5 column\(s\): name VARCHAR/);
    await expect(cols).toBeVisible({ timeout: 10_000 });
    await focusOn(k, cols, 18, 1.8);
    await k.hold(1800);
  });

  // ── The merge: several records to a page, into a new document. ──
  const row = page.locator("[data-data-merge]");
  await k.scene("merge-setup", async () => {
    k.unfocus();
    await press(k, page.getByText("Bindings", { exact: true }).last());
    await expect(row).toBeVisible({ timeout: 10_000 });
    await focusOn(k, row, 16, 1.7);
    await k.hold(500);
    await choose(k, row.locator("[data-data-merge-mode]"), "multiple");
    await expect(row.locator("[data-data-merge-arrange]")).toHaveValue("rows");
    // The template page makes way for the records (merging into a new
    // document would first ask to discard the unsaved template).
    const keep = row.getByLabel(/keep template/);
    if (await keep.isChecked()) await press(k, keep);
    await expect(keep).not.toBeChecked();
    await expect(row.locator("[data-data-merge-new-doc]")).not.toBeChecked();
  });

  await k.scene("merge", async () => {
    await press(k, row.locator("[data-data-merge-run]"));
    // Nothing overset: every record's text fits its frame.
    await expect(page.locator("[data-data-merge-msg]")).toHaveText(`merged ${RECORDS} record(s) onto 2 page(s)`, { timeout: 60_000 });
    k.unfocus();
    // Every record is on a page, and nothing of the template is left as a field.
    const texts = (await pageTexts(page)).flat();
    expect(texts.filter((t) => t.includes("<<"))).toEqual([]);
    for (const name of ["Linen notebook", "Card holder", "Fountain pen"]) expect(texts).toContain(name);
    expect(texts.filter((t) => t.startsWith("SKU "))).toHaveLength(RECORDS);
    await k.hold(1200);
  });

  // ── The cards, close up: real text in the template's styles. ──
  await k.scene("cards", async () => {
    await k.key("z", "Zoom tool");
    const at = await pt(k, 170, 140);
    for (let i = 0; i < 4; i++) {
      await pointer.click(at, { targetWidth: 60 });
      await k.hold(350);
    }
    await k.hold(1500);
  });

  // ── A frame bound to the EAN column, then lowered: a vector barcode. ──
  await k.scene("barcode", async () => {
    // Back to the whole document, then a frame below page 2's cards.
    await k.key("v");
    await press(k, page.locator("header").getByText("View", { exact: true }).first());
    await k.hold(250);
    await press(k, page.getByRole("menuitem", { name: "Fit document" }));
    await k.hold(800);
    const rects = async () =>
      page.evaluate(async () => {
        type Node = { id?: { kind: string; id: string } | null; children?: Node[] };
        const c = (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<{ output: string[] }> } } }).__canvas;
        const r = await c.client.executeScript("JSON.stringify(paged.tree())");
        let n = 0;
        const walk = (x: Node) => {
          if (x.id?.kind === "rectangle") n += 1;
          for (const ch of x.children ?? []) walk(ch);
        };
        for (const root of JSON.parse(JSON.parse(r.output[0])) as Node[]) walk(root);
        return n;
      });
    const before = await rects();
    await k.key("m", "Rectangle tool");
    await pointer.drag(await pt(k, 330, PAGE2_Y + 600), await pt(k, 540, PAGE2_Y + 690), { speed: 1.4 });
    await expect.poll(rects).toBe(before + 1);
    await press(k, page.getByText("Bindings", { exact: true }).last());
    const author = page.locator("[data-data-bind-author]");
    await focusOn(k, author, 14, 1.6);
    await choose(k, author.locator("[data-data-bind-kind]"), "barcode");
    await choose(k, author.locator("select").filter({ has: page.locator('option[value="ean13"]') }).first(), "ean13");
    const field = author.locator("[data-data-bind-field]");
    await press(k, field);
    await page.keyboard.type("ean", { delay: 90 });
    await press(k, author.locator("[data-data-bind-add]"));
    await expect(page.locator("[data-data-bind-msg]").first()).toContainText("(ean13)");
  });

  await k.scene("lower", async () => {
    k.unfocus();
    const polygonsBefore = new Set((await elements(page, "polygon")).map((e) => e.id));
    await press(k, page.getByRole("button", { name: /lower to document/i }));
    await expect(page.locator("[data-status]").last()).toHaveText(/Resolved \+ lowered barcode/, { timeout: 10_000 });
    // The bars are an EAN from the data, read back from their geometry. (Not
    // the first record's, as the capability record says an unindexed binding
    // resolves: it is record 20's, every time. Reported; the film says only
    // that the code comes from the EAN column.)
    await expect
      .poll(async () => (await elements(page, "polygon")).filter((e) => !polygonsBefore.has(e.id)).length, { timeout: 8_000 })
      .toBeGreaterThan(20);
    const bars = (await elements(page, "polygon")).filter((e) => !polygonsBefore.has(e.id)).map((e) => e.bounds);
    const eans = readFileSync(CSV, "utf8").trim().split("\n").slice(1).map((l) => l.split(",").at(-1)!.trim());
    expect(eans, "the barcode encodes an EAN from the data").toContain(decodeEan13(bars));
    // Off the selection, so the bars read without handles.
    await k.key("v");
    await pointer.click(await pt(k, -90, PAGE2_Y + 400), { targetWidth: 100 });
    await focusPagePt(k, 300, PAGE2_Y + 560, 570, PAGE2_Y + 730, 2);
    await k.hold(2200);
  });
});
