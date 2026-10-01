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
// Word's plain line breaks and blank lines lay out like WORD after a
// standalone open.
//
// The fixture is plugin-doc's docx_conformance::line_breaks_docx(), whose
// line map Word itself reported (plugin-doc docx-conformance/fixtures/
// line-breaks.word.json, via scripts/word-line-breaks-probe.sh): a plain
// <w:br/> mid-paragraph, two in a row, one at the paragraph's end, a
// textWrapping break in a run of its own, a <w:cr/>, a blank line on a
// 12 pt pitch and two on a 24 pt pitch; then, on page 2, two consecutive
// blank lines with DIFFERENT pitches.
//
// plugin-doc imports a plain break as U+2028, the engine's forced line break
// (core ab383b1: one paragraph, a new line), and styles a blank line with a
// caret applyStyle (core 65cf615: a zero-length paragraph range names the
// empty paragraph). Consecutive blank lines share one offset, so the engine
// styles them together: the mixed pair takes the last one's pitch, which
// plugin-doc reports as a warning — that one line is the documented
// deviation. Engines before protocol 64 have neither contract, so the spec
// skips there.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { inflateRawSync } from "node:zlib";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas } from "../fidelity/canvas-driver";
import { script } from "./harness/ui";

type Page = import("@playwright/test").Page;

const FIXTURE = pathResolve(dirname(fileURLToPath(import.meta.url)), "harness/doc-line-breaks.docx");
const OPEN_COMMAND = "paged.file.openIdml";
const IMPORTER_ID = "media.paged.doc.importer.docx";
const EXPORTER_ID = "media.paged.doc.exporter.docx";

/** The engine's wire protocol (canvas-wasm `0.<protocol>.<patch>`; a
 *  sync-wasm.sh build is `0.<protocol>.0-local`). */
function engineProtocol(): number {
  const require = createRequire(import.meta.url);
  const pkg = JSON.parse(
    readFileSync(require.resolve("@paged-media/canvas-wasm/package.json"), "utf8"),
  ) as { version: string };
  return Number(pkg.version.split(/[.-]/)[1]);
}

/** Word's line map (line-breaks.word.json): per page, each visible line's
 *  label (first word) and its top in 12 pt grid lines below the page's first
 *  line. The gaps are blank lines: L03's empty middle line (4), L04's
 *  trailing break (7), B01 (12), B02 + B03 at 24 pt (14–17); page 2's
 *  B04 (24 pt) + B05 (12 pt) take lines 1–3. Every page is 360 × 312 pt. */
const WORD_MAP: Array<Array<[string, number]>> = [
  [
    ["L01", 0],
    ["L02a", 1],
    ["L02b", 2],
    ["L03a", 3],
    ["L03c", 5],
    ["L04a", 6],
    ["L05a", 8],
    ["L05b", 9],
    ["L06a", 10],
    ["L06b", 11],
    ["L07", 13],
    ["L08", 18],
  ],
  [
    ["L09", 0],
    ["L10", 4],
  ],
];
/** What the engine can do: all of Word's map, except that blank lines at one
 *  offset share one style — B04 and B05 both take B05's 12 pt, so L10 is one
 *  line higher (plugin-doc diagnoses it). */
const ENGINE_MAP = WORD_MAP.map((p, i) =>
  i === 1 ? p.map(([l, n]): [string, number] => (l === "L10" ? [l, 3] : [l, n])) : p,
);

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

/** Every visible line of the section stories: its page, its label and its
 *  top in 12 pt lines below the page's first line. Paragraph text comes from
 *  `requestStoryContent`; each U+2028-separated part is one line, and the
 *  engine's rect-per-line selection geometry names its page and top. Also
 *  returns the native paragraph texts (one per Word paragraph). */
async function lineMap(page: Page): Promise<{ map: Array<Array<[string, number]>>; paragraphs: string[] }> {
  return page.evaluate(async () => {
    type Rect = { pageId: string; topPt: number };
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
    const placed: Array<{ page: number; top: number; label: string }> = [];
    const paragraphs: string[] = [];
    for (const storyId of stories) {
      const r = await c.send({ kind: "requestStoryContent", payload: { storyId } });
      const paras = (r.payload?.content?.paragraphs ?? []).map((p) =>
        p.runs.map((run) => run.text).join(""),
      );
      paragraphs.push(...paras);
      // Selection offsets count UTF-8 BYTES (and one per paragraph break):
      // a U+2028 is three.
      const bytes = (s: string) => new TextEncoder().encode(s).length;
      let at = 0;
      for (const text of paras) {
        let start = at;
        at += bytes(text) + 1;
        for (const part of text.split("\u2028")) {
          const partStart = start;
          start += bytes(part) + bytes("\u2028");
          if (!part) continue;
          const rects = await c.selectionGeometry({
            storyId,
            start: partStart,
            end: partStart + bytes(part),
            affinity: false,
          });
          placed.push({
            page: rects.length ? pageIds.indexOf(rects[0].pageId) : -1,
            top: rects[0]?.topPt ?? NaN,
            label: part.split(/\s+/)[0],
          });
        }
      }
    }
    const map = pageIds.map((_, i) => {
      const here = placed.filter((p) => p.page === i);
      const first = here[0]?.top ?? 0;
      return here.map((p): [string, number] => [p.label, (p.top - first) / 12]);
    });
    const unplaced = placed.filter((p) => p.page < 0);
    if (unplaced.length) map.push(unplaced.map((p): [string, number] => [`UNPLACED ${p.label}`, -1]));
    return { map, paragraphs };
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

/** File▸Open the fixture through the Word importer, standalone; returns
 *  every console line the page logged. */
async function openFixture(page: Page): Promise<string[]> {
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
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
  await expect
    .poll(async () => (await pages(page)).length, { timeout: 60_000 })
    .toBe(WORD_MAP.length);
  return logs;
}

const labels = (m: Array<Array<[string, number]>>) => m.map((p) => p.map(([l]) => l));

test.describe("plugin-doc — Word's line breaks and blank lines", () => {
  test.setTimeout(120_000);
  test.skip(
    engineProtocol() < 64,
    "U+2028 line breaks and caret paragraph styles need a protocol-64 engine",
  );

  test("AC-DOCLB-1 — plain line breaks stay inside their paragraph on Word's lines, blank lines are styled without a refused op, and a zero-edit save is Word's own bytes @feat:plugin-doc.file-entry @level:gesture", async ({
    page,
  }) => {
    const logs = await openFixture(page);
    for (const [i, p] of (await pages(page)).entries()) {
      const [w, h] = p.sizePt ?? [p.widthPt ?? 0, p.heightPt ?? 0];
      expect(Math.abs(w - 360), `page ${i + 1} width`).toBeLessThan(0.5);
      expect(Math.abs(h - 312), `page ${i + 1} height`).toBeLessThan(0.5);
    }

    const { map: raw, paragraphs } = await lineMap(page);
    console.log(`[AC-DOCLB-1] line tops (12 pt lines): ${JSON.stringify(raw)}`);
    // One native paragraph per Word paragraph: a plain break never splits.
    expect(paragraphs.length, "Word's 15 paragraphs").toBe(15);
    expect(paragraphs[1]).toBe("L02a before\u2028L02b after");
    expect(paragraphs[3]).toBe("L04a ends in br\u2028");
    expect(paragraphs.filter((t) => t === "").length, "five blank lines").toBe(5);
    // Every line on Word's page ...
    expect(labels(raw), "every line on Word's page").toEqual(labels(WORD_MAP));
    // ... and every line the breaks make, up to the first blank paragraph
    // (L06b), on Word's exact 12 pt line: a mid-paragraph break, two in a
    // row (an empty line), one at the end (an empty line), a textWrapping
    // break in its own run, a w:cr.
    const head = raw[0].slice(0, 10);
    for (const [label, top] of head) {
      expect(Math.abs(top - Math.round(top)), `${label} on the 12 pt grid`).toBeLessThan(0.01);
    }
    expect(head.map(([l, t]) => [l, Math.round(t)])).toEqual(WORD_MAP[0].slice(0, 10));

    // The pour sent nothing the engine refused: no zero-length range (the
    // old "empty range"), and no caret over blank lines whose styles differ.
    const refusals = logs.filter((l) => /empty range|rejected a pour op|current values differ/.test(l));
    expect(refusals, "no refused pour op").toEqual([]);

    // A zero-edit save writes Word's document back byte for byte: the
    // U+2028s read back match the import, so nothing is patched.
    const out = await page.evaluate(async (exporterId) => {
      const exp = (globalThis as unknown as CanvasGlobal).__canvas.registries.exporters
        ?.list()
        .find((e) => e.id === exporterId);
      const r = exp ? await exp.export() : null;
      return r ? { fileName: r.fileName, bytes: Array.from(r.bytes) } : null;
    }, EXPORTER_ID);
    expect(out, "the Word exporter answers after a standalone open").not.toBeNull();
    expect(documentXml(Buffer.from(out!.bytes))).toBe(documentXml(readFileSync(FIXTURE)));
  });

  // A blank line has NO run, so its leading must come from its paragraph
  // style. The engine used auto leading (1.2 × size) for it until core
  // e951762 (B01 14.4 pt instead of 12, B02/B03 14.4 instead of 24, so L07
  // landed at 13.2 and L08 at 16.6 lines). Green on a protocol-64 engine
  // that includes e951762 (verified 2026-10-01, core-p64 7e2d556); skips
  // below protocol 64 like the rest of this file.
  test("AC-DOCLB-2 — blank lines take their paragraph style's pitch, so every line lands on Word's 12 pt line @feat:plugin-doc.file-entry @level:gesture", async ({
    page,
  }) => {
    await openFixture(page);
    const { map: raw } = await lineMap(page);
    console.log(`[AC-DOCLB-2] line tops (12 pt lines): ${JSON.stringify(raw)}`);
    // Word's lines sit on the exact 12 pt grid; so must the engine's.
    for (const [label, top] of raw.flat()) {
      expect(Math.abs(top - Math.round(top)), `${label} on the 12 pt grid`).toBeLessThan(0.01);
    }
    const map = raw.map((p) => p.map(([l, t]): [string, number] => [l, Math.round(t)]));
    expect(map, "every line on Word's page and line").toEqual(ENGINE_MAP);
  });
});
