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
// thoughts ADR 028 / 029 — every way a Word document says "start over"
// paginates like WORD after a standalone open.
//
// The fixture is plugin-doc's docx_conformance::breaks_docx(), whose page
// map Word itself reported (plugin-doc docx-conformance/fixtures/
// breaks.word.json, via scripts/word-breaks-probe.sh): 14 pages of a
// ten-line body, with w:pageBreakBefore (mid-page, and on a paragraph that
// already opens a page), a paragraph holding only a page break, a paragraph
// ENDING in one, a page break and a column break INSIDE a paragraph, a
// two-column section, and oddPage / evenPage sections with and without the
// blank page Word adds when the next page has the wrong parity.
//
// plugin-doc lowers each to the engine's break-before rule
// (paragraphStartParagraph, wire protocol 64) on the paragraph that starts
// over; a break inside a paragraph splits it into native paragraphs, and
// save-back folds them into the one Word paragraph again. Engines before
// protocol 64 refuse the rule (the document still opens, without breaks),
// so the spec skips there.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { inflateRawSync } from "node:zlib";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas } from "../fidelity/canvas-driver";
import { script } from "./harness/ui";

type Page = import("@playwright/test").Page;

const FIXTURE = pathResolve(dirname(fileURLToPath(import.meta.url)), "harness/doc-breaks.docx");
const OPEN_COMMAND = "paged.file.openIdml";
const IMPORTER_ID = "media.paged.doc.importer.docx";
const EXPORTER_ID = "media.paged.doc.exporter.docx";

/** The engine's wire protocol, read like `engineGrows()` in
 *  doc-standalone-open.spec.ts: canvas-wasm is versioned `0.<protocol>.<patch>`
 *  (a sync-wasm.sh build is `0.<protocol>.0-local`). */
function engineProtocol(): number {
  const require = createRequire(import.meta.url);
  const pkg = JSON.parse(
    readFileSync(require.resolve("@paged-media/canvas-wasm/package.json"), "utf8"),
  ) as { version: string };
  return Number(pkg.version.split(/[.-]/)[1]);
}

/** Word's page map (breaks.word.json): per page, per column, the label
 *  (first word) of each line; `[]` is a blank page. Every page is 360 × 192 pt. */
const WORD_MAP: string[][][] = [
  [["A01", "A02", "A03", "A04"]],
  [["A05", "A06", "A07", "A08", "A09", "A10", "A11", "A12", "A13", "A14"]],
  [["A15", "A16", "A17"]],
  [["A18", "A19"]],
  [["A20", "A21a"]],
  [["A21b", "A22", "A23"]],
  [
    ["B01", "B02", "B03"],
    ["B04", "B05", "B06", "B07", "B08a"],
  ],
  [["B08b", "B09"]],
  [["C01", "C02", "C03"]],
  [[]],
  [["D01", "D02", "D03"]],
  [["E01", "E02", "E03"]],
  [[]],
  [["F01", "F02", "F03"]],
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

/** Where every paragraph of the section stories (`docx_s<k>`) landed: the
 *  page and the column of its first line. The engine's rect-per-line
 *  selection geometry (`client.selectionGeometry`) names each line's page
 *  and left edge; paragraph text and offsets come from `requestStoryContent`.
 *  A line more than 60 pt right of the page's leftmost line is in column 2. */
async function pageMap(page: Page): Promise<string[][][]> {
  return page.evaluate(async () => {
    type Rect = { pageId: string; leftPt: number };
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
    const stories = (
      JSON.parse((await c.executeScript("paged.stories()")).output[0] ?? "[]") as Array<{
        selfId: string;
      }>
    )
      .map((s) => s.selfId)
      .filter((id) => /^docx_s\d+$/.test(id))
      .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
    const placed: Array<{ page: number; left: number; label: string }> = [];
    for (const storyId of stories) {
      const r = await c.send({ kind: "requestStoryContent", payload: { storyId } });
      const paras = (r.payload?.content?.paragraphs ?? []).map((p) =>
        p.runs.map((run) => run.text).join(""),
      );
      let at = 0;
      for (const text of paras) {
        const start = at;
        at += text.length + 1;
        if (!text) continue;
        const rects = await c.selectionGeometry({
          storyId,
          start,
          end: start + text.length,
          affinity: false,
        });
        const i = rects.length ? pageIds.indexOf(rects[0].pageId) : -1;
        placed.push({ page: i, left: rects[0]?.leftPt ?? 0, label: text.split(/\s+/)[0] });
      }
    }
    const out: string[][][] = pageIds.map(() => [[]]);
    const unplaced = placed.filter((p) => p.page < 0).map((p) => p.label);
    if (unplaced.length) out.push([["UNPLACED", ...unplaced]]);
    pageIds.forEach((_, i) => {
      const here = placed.filter((p) => p.page === i);
      if (!here.length) return;
      const minLeft = Math.min(...here.map((p) => p.left));
      const cols: string[][] = [[], []];
      for (const p of here) cols[p.left > minLeft + 60 ? 1 : 0].push(p.label);
      out[i] = cols[1].length ? cols : [cols[0]];
    });
    return out;
  });
}

type PageRow = { sizePt?: [number, number]; widthPt?: number; heightPt?: number };

async function pages(page: Page): Promise<PageRow[]> {
  const raw = await script(page, "paged.pages()");
  return JSON.parse(raw[0] ?? "[]");
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
      const dataAt = local + 30 + docx.readUInt16LE(local + 26) + docx.readUInt16LE(local + 28);
      const data = docx.subarray(dataAt, dataAt + size);
      return (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("no word/document.xml in the export");
}

test.describe("plugin-doc — Word's breaks (ADR 028 / 029)", () => {
  test.setTimeout(120_000);

  test("AC-DOCBR-1 — page, column and section breaks put Word's lines on Word's pages, and save back as Word wrote them @feat:plugin-doc.file-entry @level:gesture", async ({
    page,
  }) => {
    test.skip(
      engineProtocol() < 64,
      "the break-before rule (paragraphStartParagraph) needs wire protocol 64",
    );
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

    // Word's 14 pages, the two blank ones included.
    await expect
      .poll(async () => (await pages(page)).length, { timeout: 60_000 })
      .toBe(WORD_MAP.length);
    for (const [i, p] of (await pages(page)).entries()) {
      const [w, h] = p.sizePt ?? [p.widthPt ?? 0, p.heightPt ?? 0];
      expect(Math.abs(w - 360), `page ${i + 1} width`).toBeLessThan(0.5);
      expect(Math.abs(h - 192), `page ${i + 1} height`).toBeLessThan(0.5);
    }

    const map = await pageMap(page);
    console.log(`[AC-DOCBR-1] page map: ${JSON.stringify(map)}`);
    expect(map, "every line on Word's page and column").toEqual(WORD_MAP);

    // Save-back reads the stories and folds each split paragraph into the
    // one Word paragraph it was: nothing was edited, so the document comes
    // back with all 46 paragraphs and every break where Word had it.
    const out = await page.evaluate(async (exporterId) => {
      const exp = (globalThis as unknown as CanvasGlobal).__canvas.registries.exporters
        ?.list()
        .find((e) => e.id === exporterId);
      const r = exp ? await exp.export() : null;
      return r ? { fileName: r.fileName, bytes: Array.from(r.bytes) } : null;
    }, EXPORTER_ID);
    expect(out, "the Word exporter answers after a standalone open").not.toBeNull();
    const xml = documentXml(Buffer.from(out!.bytes));
    expect(xml.match(/<w:p>/g)?.length, "Word's 46 paragraphs").toBe(46);
    expect(xml.match(/<w:br w:type="page"\/>/g)?.length).toBe(3);
    expect(xml.match(/<w:br w:type="column"\/>/g)?.length).toBe(2);
    expect(xml).toContain(
      '<w:t xml:space="preserve">A21a before</w:t><w:br w:type="page"/><w:t xml:space="preserve">A21b after mid break</w:t>',
    );
  });
});
