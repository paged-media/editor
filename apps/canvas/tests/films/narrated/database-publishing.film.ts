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

// Database publishing, the audience film (ADR 224): the website's
// `films/database-publishing.yaml`. A product sheet designed once with
// <<fields>>, the product feed imported into DuckDB in the Data layout, a
// Data Merge that sets every product on its own page, a paged.* script that
// stamps a numbered footer on every page, and the catalogue exported as an
// IDML package. Everything goes through the editor's own controls, every
// step is asserted against the engine, and DuckDB is the real engine
// (REQUIRE_REAL_DUCKDB=1).
//
// The merge copies story-level formatting only (plugin-data docs/status.md,
// Data Merge limits), so the sheet keeps one paragraph style per frame; the
// sand card and the rule are separate rectangles, because a merged text
// frame loses its own fill.

import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { film, type Kit } from "../kit/film";
import { menu, press, screenPoint } from "../kit/ui";

const MEDIA = process.env.PAGED_MEDIA_ROOT ?? "";
const CSV = join(MEDIA, "assets", "catalogue.csv");
const FONTS = join(import.meta.dirname, "..", "..", "..", "..", "..", "..", "core", "corpus", "fonts");
const RECORDS = 24;
/** Pages stack 24 pt apart (ui/layout.ts): page n's top in document space. */
const pageTop = (n: number) => (n - 1) * (792 + 24);

type Bounds = [number, number, number, number]; // top, left, bottom, right

/** The footer script, as typed on camera. */
const SCRIPT = `const pages = JSON.parse(paged.pages());
pages.forEach((p, i) => {
  paged.insertTextFrame(p.selfId, [744, 72, 758, 540]);
  const s = JSON.parse(paged.stories()).at(-1).selfId;
  const t = \`Spring 2027  ·  page \${i + 1} of \${pages.length}\`;
  paged.insertText(s, 0, t);
  paged.applyStyle(s, 0, t.length, "ParagraphStyle/Footer");
});`;

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
    { family: "Fraunces", file: "Fraunces-VF.ttf" },
    { family: "Inter", file: "Inter.ttf" },
    { family: "JetBrains Mono", file: "JetBrainsMono-VF.ttf" },
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
        await c.client.registerFont(f.family, new Uint8Array(await res.arrayBuffer()), null);
      }
    }, faces);
  } finally {
    await page.unroute("**/__film-fonts/*");
  }
}

/** The text story a frame owns, by a hit test at its centre (the showcase's
 *  way; the frame must already hold text or sit alone under the point). */
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

/** The product sheet: a running header over a teal rule, a sand card, and
 *  four <<field>> frames, each in one paragraph style. */
async function buildTemplate(k: Kit): Promise<void> {
  const { page, designer } = k;
  await registerFonts(page);
  const sand = await designer.createSwatch("Sand", [238, 226, 205]);
  const ink = await designer.createSwatch("Ink", [28, 26, 38]);
  const teal = await designer.createSwatch("Teal", [14, 116, 144]);
  const grey = await designer.createSwatch("Grey", [104, 100, 118]);
  const styles: Array<[string, string, Array<[string, unknown]>]> = [
    ["ParagraphStyle/Header", "Catalogue header", [["characterFontFamily", txt("Inter")], ["characterFontSize", len(8)], ["characterLeading", len(10)], ["characterTracking", len(140)], ["characterFillColor", color(grey)]]],
    ["ParagraphStyle/Name", "Product name", [["characterFontFamily", txt("Fraunces")], ["characterFontSize", len(40)], ["characterLeading", len(44)], ["characterFillColor", color(ink)]]],
    ["ParagraphStyle/Detail", "Product detail", [["characterFontFamily", txt("Inter")], ["characterFontSize", len(14)], ["characterLeading", len(19)], ["characterFillColor", color(grey)]]],
    ["ParagraphStyle/Price", "Product price", [["characterFontFamily", txt("Inter")], ["characterFontSize", len(32)], ["characterLeading", len(36)], ["characterFillColor", color(teal)]]],
    ["ParagraphStyle/Sku", "Product SKU", [["characterFontFamily", txt("JetBrains Mono")], ["characterFontSize", len(9)], ["characterLeading", len(12)], ["characterTracking", len(40)], ["characterFillColor", color(grey)]]],
    ["ParagraphStyle/Footer", "Footer", [["characterFontFamily", txt("Inter")], ["characterFontSize", len(9)], ["characterLeading", len(11)], ["characterTracking", len(60)], ["characterFillColor", color(grey)], ["paragraphJustification", txt("RightAlign")]]],
  ];
  for (const [selfId, name, props] of styles) {
    await mutate(page, "createParagraphStyle", { selfId, name, basedOn: null });
    for (const [path, value] of props) await mutate(page, "setStyleProperty", { collection: "paragraph", styleId: selfId, path, value });
  }
  const pageId = await page.evaluate(() => (globalThis as unknown as { __canvas: { handle: { pageIds: string[] } } }).__canvas.handle.pageIds[0]);
  for (const [path, v] of [["pageMarginTop", 72], ["pageMarginLeft", 72], ["pageMarginBottom", 72], ["pageMarginRight", 72]] as const) {
    await mutate(page, "set", { address: `page:${pageId}`, path, value: len(v) });
  }
  for (const [b, c] of [[[94, 72, 96, 540], teal], [[120, 72, 560, 540], sand]] as const) {
    const r = await mutate(page, "insertFrame", { pageId, bounds: b });
    await mutate(page, "setElementProperty", { elementId: r.payload.createdId, path: "frameFillColor", value: color(c) });
  }
  const frames: Array<[Bounds, string, string]> = [
    [[72, 72, 86, 540], "DESK & PAPER  ·  SPRING CATALOGUE 2027", "ParagraphStyle/Header"],
    [[168, 104, 240, 508], "<<name>>", "ParagraphStyle/Name"],
    [[244, 104, 300, 508], "<<detail>>", "ParagraphStyle/Detail"],
    [[480, 104, 524, 400], "<<price>>", "ParagraphStyle/Price"],
    [[690, 72, 704, 300], "SKU <<sku>>", "ParagraphStyle/Sku"],
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

/** The camera last logged (k.recamera): compose aims every zoom through the
 *  newest camera mark at or before it, so a zoom aimed here must use it too. */
let cam = { ox: 0, oy: 0, s: 1 };
async function recamera(k: Kit): Promise<void> {
  await k.recamera();
  const o = await pt(k, 0, 0);
  const x = await pt(k, 100, 0);
  cam = { ox: o.x, oy: o.y, s: (x.x - o.x) / 100 };
}

/** Punch in on page n (1-based), in that page's own points. The merge and
 *  every page jump move the camera, so a fresh camera is logged first. */
async function focusPage(k: Kit, n: number, [x0, y0, x1, y1]: [number, number, number, number], max?: number): Promise<void> {
  await recamera(k);
  k.focus([x0, pageTop(n) + y0, x1, pageTop(n) + y1], max);
}

/** Punch in on something on screen (a panel). A view without the canvas
 *  (the export centre) cannot log a camera: `fresh: false` aims through the
 *  last one, which is also the one compose will use. */
async function focusOn(k: Kit, l: Locator, pad = 12, max?: number, fresh = true): Promise<void> {
  const b = await l.boundingBox();
  if (!b) throw new Error(`no box for ${l}`);
  if (fresh) await recamera(k);
  const { ox, oy, s } = cam;
  k.focus([(b.x - pad - ox) / s, (b.y - pad - oy) / s, (b.x + b.width + pad - ox) / s, (b.y + b.height + pad - oy) / s], max);
}

/** Punch in on the box around several things on screen. */
async function focusAround(k: Kit, ls: Locator[], pad = 14, max?: number): Promise<void> {
  const boxes = await Promise.all(ls.map((l) => l.boundingBox()));
  if (boxes.some((b) => !b)) throw new Error("focusAround: a locator has no box");
  const bs = boxes as Array<{ x: number; y: number; width: number; height: number }>;
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.width));
  const y1 = Math.max(...bs.map((b) => b.y + b.height));
  await recamera(k);
  const { ox, oy, s } = cam;
  k.focus([(x0 - pad - ox) / s, (y0 - pad - oy) / s, (x1 + pad - ox) / s, (y1 + pad - oy) / s], max);
}

/** Jump to a page with its filmstrip thumbnail. */
async function goToPage(k: Kit, n: number): Promise<void> {
  await press(k, k.page.locator("button[data-thumbnail-spread]").filter({ hasText: new RegExp(`^${n}$`) }).first());
  await k.hold(900);
}

/** Type code the way it appears when someone fluent types it: short bursts
 *  of two to five characters at about 30 ms a character, a beat at each line
 *  end. Bursts go in as text input, and the schedule is absolute, so a slow
 *  round trip to the browser (other work on the machine) cannot stretch the
 *  scene the way per-key events do. Seeded, so every take types alike. */
async function typeCode(page: Page, text: string, seed = 11): Promise<void> {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const t0 = Date.now();
  let due = 0;
  for (const [n, line] of text.split("\n").entries()) {
    if (n > 0) {
      await page.keyboard.press("Enter");
      due += 180;
    }
    for (let i = 0; i < line.length; ) {
      const size = 2 + Math.floor(rand() * 4);
      const burst = line.slice(i, i + size);
      i += size;
      await page.keyboard.insertText(burst);
      due += burst.length * (24 + rand() * 12);
      const wait = t0 + due - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }
}

film("database-publishing", async (k) => {
  const { page, designer, pointer } = k;
  const visible = (sel: string) => page.locator(`${sel}:visible`).first();

  await k.setup(async () => {
    await designer.open();
    await designer.newDocument();
    await buildTemplate(k);
    await k.key("v");
    await k.hold(800);
    expect((await pageTexts(page)).flat()).toContain("<<name>>");
  });
  await k.roll();

  // ── The product sheet, designed once with <<fields>>. ──
  await k.scene("template", async () => {
    await k.hold(500);
    k.focus([56, 60, 556, 580]);
    await k.hold(1300);
    await pointer.moveTo(await pt(k, 230, 204), { targetWidth: 60 });
    await k.hold(1000);
    await pointer.moveTo(await pt(k, 170, 502), { targetWidth: 60 });
  });

  // ── The product feed, into DuckDB, in the Data layout. ──
  await k.scene("feed", async () => {
    k.unfocus();
    await press(k, page.getByRole("button", { name: "Data layout", exact: true }).last());
    await k.hold(700);
    const chooser = page.waitForEvent("filechooser");
    await press(k, visible("[data-data-import-csv]"));
    k.chip("catalogue.csv", "file");
    await (await chooser).setFiles(CSV);
    const status = page.locator("[data-status]").last();
    await expect.poll(async () => (await status.getAttribute("data-status").catch(() => null)) ?? "?", { timeout: 60_000 }).toBe("ready");
    const source = page.getByText("catalogue", { exact: true }).first();
    await expect(source).toBeVisible();
    await focusAround(k, [visible("[data-data-import-csv]"), source], 18, 1.8);
    await k.hold(2600);
  });

  // ── One record to a page, and the template makes way. ──
  const row = page.locator("[data-data-merge]");
  await k.scene("merge-setup", async () => {
    k.unfocus();
    await press(k, page.getByText("Bindings", { exact: true }).last());
    await expect(row).toBeVisible({ timeout: 10_000 });
    await focusOn(k, row, 16, 1.7);
    const mode = row.locator("[data-data-merge-mode]");
    await pointer.moveTo(await (async () => { const b = (await mode.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })(), { targetWidth: 80 });
    await k.hold(500);
    await expect(mode.locator("option:checked")).toHaveText("Single record per page");
    const keep = row.getByLabel(/keep template/);
    if (await keep.isChecked()) await press(k, keep);
    await expect(keep).not.toBeChecked();
    await expect(row.locator("[data-data-merge-new-doc]")).not.toBeChecked();
  });

  // ── The merge: a page for every product. ──
  await k.scene("merge", async () => {
    await press(k, row.locator("[data-data-merge-run]"));
    await expect(page.locator("[data-data-merge-msg]")).toHaveText(`merged ${RECORDS} record(s) onto ${RECORDS} page(s)`, { timeout: 60_000 });
    k.unfocus();
    const pages = await pageTexts(page);
    expect(pages).toHaveLength(RECORDS);
    const all = pages.flat();
    expect(all.filter((t) => t.includes("<<"))).toEqual([]);
    expect(all.filter((t) => t.startsWith("SKU "))).toHaveLength(RECORDS);
    // The panel's own count, close up; then the whole run, twenty-four pages.
    await focusOn(k, page.locator("[data-data-merge-msg]"), 60, 1.8);
    await k.hold(2600);
    k.unfocus();
    await k.hold(1600);
  });

  // ── Two of the pages, close up. ──
  const names = readFileSync(CSV, "utf8").trim().split("\n").slice(1).map((l) => l.split(",")[0]);
  await k.scene("pages", async () => {
    await goToPage(k, 2);
    expect((await pageTexts(page))[1]).toContain(names[1]);
    await focusPage(k, 2, [56, 60, 556, 580]);
    await k.hold(1800);
    await goToPage(k, 9);
    expect((await pageTexts(page))[8]).toContain(names[8]);
    await focusPage(k, 9, [56, 60, 556, 580]);
    await k.hold(1500);
  });

  // ── A script: a numbered footer on every page. ──
  await k.scene("script", async () => {
    k.unfocus();
    await menu(k, ["Window", "Developer", "Script"]);
    const source = page.locator("[data-script-source]");
    await expect(source).toBeVisible({ timeout: 10_000 });
    // The code area, not the whole tall panel, so the typing reads.
    const box = (await source.boundingBox())!;
    await recamera(k);
    k.focus([(box.x - 16 - cam.ox) / cam.s, (box.y - 16 - cam.oy) / cam.s, (box.x + box.width + 16 - cam.ox) / cam.s, (box.y + 230 - cam.oy) / cam.s], 1.8);
    // The panel opens on a sample script: select it all, then type over it
    // (a direct key press, since k.key takes focus off a field on purpose).
    await press(k, source);
    await page.keyboard.press("Meta+a");
    await k.hold(250);
  });

  await k.scene("code", async () => {
    await typeCode(page, SCRIPT);
    await expect(page.locator("[data-script-source]")).toHaveValue(SCRIPT);
  });

  await k.scene("run", async () => {
    await press(k, page.locator("[data-action=run]"));
    await expect(page.locator("[data-action=run]")).toHaveText(/Run/, { timeout: 30_000 });
    await expect(page.locator("[data-script-error]")).toHaveCount(0);
    const pages = await pageTexts(page);
    pages.forEach((texts, i) => expect(texts).toContain(`Spring 2027  ·  page ${i + 1} of ${RECORDS}`));
    k.unfocus();
    await goToPage(k, 14);
    await focusPage(k, 14, [280, 560, 580, 790], 2);
    await k.hold(3200);
  });

  // ── The catalogue, out as an IDML package for the printer. ──
  await k.scene("idml", async () => {
    k.unfocus();
    await press(k, page.getByRole("button", { name: "Export", exact: true }).last());
    await k.hold(700);
    const item = page.locator('[data-plugin-export="media.paged.publish.exporter.idml"]');
    await focusOn(k, item, 40, 1.6, false);
    const download = page.waitForEvent("download");
    await press(k, item);
    const file = await download;
    k.chip(`${file.suggestedFilename()} saved`, "save");
    const saved = join(k.dir, "catalogue.idml");
    await file.saveAs(saved);
    const bytes = readFileSync(saved);
    expect(bytes.subarray(0, 2).toString("latin1"), "an IDML package is a ZIP").toBe("PK");
    expect(bytes.includes(Buffer.from("designmap.xml")), "with a designmap").toBe(true);
    await k.hold(1500);
  });
});
