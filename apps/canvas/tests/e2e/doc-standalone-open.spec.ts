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
// ADR 029 — a Word document opens as the WHOLE document and
// paginates like WORD.
//
// The fixture is plugin-doc's docx_conformance::pagination_docx(), whose
// pages Word itself reported (plugin-doc docx-conformance/fixtures/
// pagination.word.json, via scripts/word-pagination-probe.sh):
//   Letter 53 / 54 / 13 lines (keepNext pushes S1 P054 onto page 2),
//   then A5 landscape 28 / 12.
// The per-line content is pinned against Word in core
// (paged-renderer tests/docx_pagination_pipeline.rs); this spec proves the
// editor path: File▸Open → docx skeleton (a page, margin-box frame and
// growing story per section) → host.nativeDocument.open → the pour → the
// engine grows the pages. Then save-back stitches the section stories into
// one body again.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { inflateRawSync } from "node:zlib";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas } from "../fidelity/canvas-driver";
import { script } from "./harness/ui";

type Page = import("@playwright/test").Page;

const FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "harness/doc-pagination.docx",
);
const OPEN_COMMAND = "paged.file.openIdml";
const IMPORTER_ID = "media.paged.doc.importer.docx";
const EXPORTER_ID = "media.paged.doc.exporter.docx";

/** Page growth (ADR 026) reached the engine after canvas-wasm 0.62.0; an
 *  older engine opens the skeleton but never grows it. A `-local` build
 *  (sync-wasm.sh) is core main. */
function engineGrows(): boolean {
  const require = createRequire(import.meta.url);
  const pkg = JSON.parse(
    readFileSync(require.resolve("@paged-media/canvas-wasm/package.json"), "utf8"),
  ) as { version: string };
  const [, minor, patch] = pkg.version.split(/[.-]/).map(Number);
  return pkg.version.includes("-local") || minor > 63 || (minor === 63 && patch >= 1);
}

/** Word's pages: [width, height] in points. */
const WORD_PAGES: Array<[number, number]> = [
  [612, 792],
  [612, 792],
  [612, 792],
  [595.3, 419.55],
  [595.3, 419.55],
];
/** Each page's top margin: section 1 has 1 in, section 2 has 0.5 in. */
const WORD_MARGIN_TOP = [72, 72, 72, 36, 36];
/** What Word put on each page (plugin-doc docx-conformance/fixtures/
 *  pagination.word.json): every paragraph is one line, and S1 P054's
 *  keepNext moves it off page 1 — so page 1 holds 53 lines, not 54. */
const WORD_PAGE_CONTENT: PageContent[] = [
  { lines: 53, first: "S1 P001", last: "S1 P053" },
  { lines: 54, first: "S1 P054", last: "S1 P107" },
  { lines: 13, first: "S1 P108", last: "S1 P120" },
  { lines: 28, first: "S2 P001", last: "S2 P028" },
  { lines: 12, first: "S2 P029", last: "S2 P040" },
];

type Registries = {
  commands: { invoke: (id: string) => Promise<unknown> };
  importers: { resolve: (name: string) => { id: string } | null };
  exporters?: {
    list: () => Array<{
      id: string;
      export: () => Promise<{ fileName: string; bytes: Uint8Array } | null>;
    }>;
  };
};
type CanvasGlobal = { __canvas: { ready: boolean; registries: Registries } };

const invoke = (page: Page, id: string) =>
  page.evaluate(
    (cmd) => (globalThis as unknown as CanvasGlobal).__canvas.registries.commands.invoke(cmd),
    id,
  );

type PageContent = { lines: number; first: string; last: string };

/** Where every line and paragraph of the two section stories landed: the
 *  engine's rect-per-line selection geometry (`client.selectionGeometry`)
 *  names each line's page; paragraph text + offsets come from the story's
 *  content (`requestStoryContent`). */
async function pageContent(page: Page): Promise<PageContent[]> {
  return page.evaluate(async () => {
    type Rect = { pageId: string };
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            send: (m: unknown) => Promise<{
              kind: string;
              payload?: { content?: { paragraphs?: Array<{ runs: Array<{ text: string }> }> } };
            }>;
            selectionGeometry: (s: unknown) => Promise<Rect[]>;
            executeScript: (s: string) => Promise<{ output: string[] }>;
          };
        };
      }
    ).__canvas.client;
    const pageIds = (
      JSON.parse((await c.executeScript("paged.pages()")).output[0] ?? "[]") as Array<{
        selfId: string;
      }>
    ).map((p) => p.selfId);
    const stories = JSON.parse(
      (await c.executeScript("paged.stories()")).output[0] ?? "[]",
    ) as Array<{ selfId: string }>;
    const out = pageIds.map(() => ({ lines: 0, first: "", last: "" }));
    const sections: Array<{ label: string; storyId: string; paras: string[] }> = [];
    for (const { selfId } of stories) {
      const r = await c.send({ kind: "requestStoryContent", payload: { storyId: selfId } });
      const paras = (r.payload?.content?.paragraphs ?? []).map((p) =>
        p.runs.map((run) => run.text).join(""),
      );
      if (/^S\d P\d{3}/.test(paras[0] ?? "")) {
        sections.push({ label: paras[0].slice(0, 2), storyId: selfId, paras });
      }
    }
    sections.sort((a, b) => a.label.localeCompare(b.label));
    for (const { storyId, paras } of sections) {
      const end = paras.reduce((n, p) => n + p.length + 1, 0) - 1;
      const lines = await c.selectionGeometry({ storyId, start: 0, end, affinity: false });
      for (const l of lines) {
        const i = pageIds.indexOf(l.pageId);
        if (i >= 0) out[i].lines += 1;
      }
      let at = 0;
      for (const text of paras) {
        const rects = await c.selectionGeometry({
          storyId,
          start: at,
          end: at + text.length,
          affinity: false,
        });
        at += text.length + 1;
        const i = rects.length ? pageIds.indexOf(rects[0].pageId) : -1;
        if (i < 0) continue;
        const label = text.slice(0, 7);
        if (!out[i].first) out[i].first = label;
        out[i].last = label;
      }
    }
    return out;
  });
}

type PageRow = { sizePt?: [number, number]; widthPt?: number; heightPt?: number; marginTopPt?: number };

async function pages(page: Page): Promise<PageRow[]> {
  const raw = await script(page, "paged.pages()");
  return JSON.parse(raw[0] ?? "[]");
}

function sizeOf(p: PageRow): [number, number] {
  return p.sizePt ?? [p.widthPt ?? 0, p.heightPt ?? 0];
}

/** `word/document.xml` out of a .docx (a minimal central-directory read). */
function documentXml(docx: Buffer): string {
  const eocd = docx.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const entries = docx.readUInt16LE(eocd + 10);
  let p = docx.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i++) {
    const method = docx.readUInt16LE(p + 10);
    const size = docx.readUInt32LE(p + 20);
    const nameLen = docx.readUInt16LE(p + 28);
    const extraLen = docx.readUInt16LE(p + 30);
    const commentLen = docx.readUInt16LE(p + 32);
    const local = docx.readUInt32LE(p + 42);
    const name = docx.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (name === "word/document.xml") {
      const dataAt =
        local + 30 + docx.readUInt16LE(local + 26) + docx.readUInt16LE(local + 28);
      const data = docx.subarray(dataAt, dataAt + size);
      return (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("no word/document.xml in the export");
}

test.describe("plugin-doc — standalone open (ADR 029)", () => {
  test.setTimeout(120_000);

  test("AC-DOCSO-1 — a two-section Word document opens as its own pages, paginated like Word, and saves back whole @feat:plugin-doc.file-entry @level:gesture", async ({
    page,
  }) => {
    test.skip(!engineGrows(), "this engine predates page growth (canvas-wasm < 0.63.1)");
    await openCanvas(page);
    await invoke(page, "paged.file.new");
    await page.waitForFunction(
      () => (globalThis as unknown as CanvasGlobal).__canvas.ready === true,
      null,
      { timeout: 15_000 },
    );
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (globalThis as unknown as CanvasGlobal).__canvas.registries.importers.resolve(
                "x.docx",
              )?.id ?? null,
          ),
        { timeout: 15_000 },
      )
      .toBe(IMPORTER_ID);

    const chooser = page.waitForEvent("filechooser");
    const opened = invoke(page, OPEN_COMMAND);
    await (await chooser).setFiles(FIXTURE);
    await opened;

    // The engine grows the section stories: Word's five pages.
    await expect.poll(async () => (await pages(page)).length, { timeout: 60_000 }).toBe(5);
    const listed = await pages(page);
    expect(listed.map((p) => p.marginTopPt), "generated pages keep their section's margins").toEqual(
      WORD_MARGIN_TOP,
    );
    const sizes = listed.map(sizeOf);
    sizes.forEach(([w, h], i) => {
      expect(Math.abs(w - WORD_PAGES[i][0]), `page ${i + 1} width`).toBeLessThan(0.5);
      expect(Math.abs(h - WORD_PAGES[i][1]), `page ${i + 1} height`).toBeLessThan(0.5);
    });

    // What lands on each page is Word's map, keepNext included: S1 P054
    // leaves page 1 for page 2 (page 1 holds 53 of its 54 lines).
    const content = await pageContent(page);
    console.log(`[AC-DOCSO-1] per-page content: ${JSON.stringify(content)}`);
    expect(content, "each page carries Word's lines, first to last").toEqual(
      WORD_PAGE_CONTENT,
    );

    // Save-back reads every section story and stitches one body again: the
    // exported document carries all 160 paragraphs in order.
    const out = await page.evaluate(async (exporterId) => {
      const exp = (globalThis as unknown as CanvasGlobal).__canvas.registries.exporters
        ?.list()
        .find((e) => e.id === exporterId);
      const r = exp ? await exp.export() : null;
      return r ? { fileName: r.fileName, bytes: Array.from(r.bytes) } : null;
    }, EXPORTER_ID);
    expect(out, "the Word exporter answers after a standalone open").not.toBeNull();
    const xml = documentXml(Buffer.from(out!.bytes));
    const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    expect(texts.length).toBe(160);
    expect(texts[0]).toBe("S1 P001 of the first section.");
    expect(texts[119]).toBe("S1 P120 of the first section.");
    expect(texts[120]).toBe("S2 P001 of the second section.");
    expect(texts[159]).toBe("S2 P040 of the second section.");
  });
});
