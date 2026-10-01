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
// thoughts ADR 029 — a Word section that CHANGES THE COLUMNS mid-page stays
// on Word's page after a standalone open.
//
// The fixtures are plugin-doc's docx_conformance::continuous_docx() and
// columns_docx(), whose page maps Word itself reported (plugin-doc
// docx-conformance/fixtures/continuous.word.json and columns.word.json, via
// scripts/word-continuous-probe.sh / word-columns-probe.sh). Word balances
// a section's columns by line count before a continuous break, fills them in
// turn before a page-starting section or the document's end, and fills a
// page's columns to the bottom when the section runs on.
//
// plugin-doc lowers such a change to the engine's span/split columns
// (IDML SpanColumnType, wire protocol 64): a story whose last section Word
// leaves unbalanced keeps the frame's columns and its one-column sections
// SPAN them; every other story keeps one column and its multi-column
// sections SPLIT it. The expected maps below are plugin-doc's
// docx-conformance/tests/support/layout.rs rule (the engine's span/split
// rule, measured against InDesign) applied to that lowering; plugin-doc's
// columns.rs / continuous.rs hold them against Word's maps line by line:
// continuous_docx() is Word's map exactly (but Word page 7, where Word
// applies a new top margin the native story's grown page does not have);
// columns_docx() is Word's but for three column changes into another
// column count (a page each) and unequal columns (laid out equal).
//
// Each line is "label x row": the left edge of its first glyph in pt from
// the page's left, and its row on the 12 pt grid below the top margin.
// Engines before protocol 64 refuse the properties; the document then
// reopens with a page per column change, so the spec skips there.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas } from "../fidelity/canvas-driver";

type Page = import("@playwright/test").Page;

const HARNESS = (name: string) =>
  pathResolve(dirname(fileURLToPath(import.meta.url)), "harness", name);
const OPEN_COMMAND = "paged.file.openIdml";
const IMPORTER_ID = "media.paged.doc.importer.docx";

/** The engine's wire protocol (canvas-wasm is versioned `0.<protocol>.<patch>`;
 *  a sync-wasm.sh build is `0.<protocol>.0-local`). */
function engineProtocol(): number {
  const require = createRequire(import.meta.url);
  const pkg = JSON.parse(
    readFileSync(require.resolve("@paged-media/canvas-wasm/package.json"), "utf8"),
  ) as { version: string };
  return Number(pkg.version.split(/[.-]/)[1]);
}

/** continuous_docx(): Word's 10 pages. Page 3 is section B: B1, B2 in two
 *  columns balanced 5 / 4, B3 below the deeper one, B4 in two columns
 *  unbalanced (all six lines in column 1, a nextPage section follows). */
const CONTINUOUS: string[] = [
  "A1-01 36 0|A1-02 36 1|A1-03 36 2|A1-04 36 3|A2-01 36 4|A2-02 36 5|A2-03 36 6|A2-04 36 7|A3-01 36 8|A3-02 36 9|A3-03 36 10|A3-04 36 11|A3-05 36 12|A3-06 36 13|A3-07 36 14|A3-08 36 15|A3-09 36 16|A3-10 36 17|A3-11 36 18|A3-12 36 19",
  "A3-13 36 0|A3-14 36 1|A3-15 36 2|A3-16 36 3",
  "B1-01 36 0|B1-02 36 1|B1-03 36 2|B2-01 36 3|B2-02 36 4|B2-03 36 5|B2-04 36 6|B2-05 36 7|B2-06 198 3|B2-07 198 4|B2-08 198 5|B2-09 198 6|B3-01 36 8|B3-02 36 9|B3-03 36 10|B4-01 36 11|B4-02 36 12|B4-03 36 13|B4-04 36 14|B4-05 36 15|B4-06 36 16",
  "D1-01 36 0|D1-02 36 1|D1-03 36 2|D2-01 198 0|D2-02 198 1|D2-03 198 2",
  "C1-01 36 0|C1-02 36 1|C1-03 36 2|C2-01 108 3|C2-02 108 4|C2-03 108 5|C3-01 36 6|C3-02 36 7|C3-03 36 8",
  "E1-01 36 0|E1-02 36 1|E1-03 36 2|E2-01 36 3|E2-02 36 4|E2-03 36 5|E2-04 36 6|E2-05 36 7|E2-06 36 8|E2-07 36 9|E2-08 36 10|E2-09 36 11|E2-10 36 12|E2-11 36 13|E2-12 36 14|E2-13 36 15|E2-14 36 16|E2-15 36 17|E2-16 36 18|E2-17 36 19",
  "E2-18 36 0|E2-19 36 1|E2-20 36 2|E2-21 36 3|E2-22 36 4|E2-23 36 5|E2-24 36 6|E2-25 36 7",
  "F1-01 36 0|F1-02 36 1|F1-03 36 2",
  "F2-01 36 0|F2-02 36 1|F2-03 36 2",
  "G1-01 36 0|G1-02 36 1|G1-03 36 2",
];

/** columns_docx(): Word's 11 pages and three more (H3, N3, P3 each open a
 *  page: two multi-column sections in a row would be one split block). */
const COLUMNS: string[] = [
  "H1-01 36 0|H1-02 36 1|H2-01 36 2|H2-02 36 3|H2-03 36 4|H2-04 198 2|H2-05 198 3|H2-06 198 4",
  "H3-01 36 0|H3-02 36 1|H3-03 36 2|H3-04 144 0|H3-05 144 1|H3-06 144 2|H3-07 252 0|H4-01 36 3|H4-02 36 4",
  "I1-01 36 0|I1-02 36 1|I1-03 36 2|I1-04 36 3|I1-05 198 0|I1-06 198 1|I1-07 198 2|I2-01 36 4|I2-02 36 5|I3-01 36 6|I3-02 36 7|I3-03 36 8|I3-04 36 9|I3-05 36 10",
  "J1-01 36 0|J1-02 36 1|J2-01 36 2|J2-02 36 3|J2-03 36 4|J2-04 189 2|J2-05 189 3|J2-06 189 4|J3-01 36 5|J3-02 36 6",
  "K1-01 36 0|K1-02 36 1|K2-01 36 2|K2-02 36 3|K2-03 36 4|K2-04 189 2|K2-05 189 3|K2-06 189 4|K3-01 36 5|K3-02 36 6",
  "L1-01 36 0|L1-02 36 1|L1-03 36 2|L2-01 36 3|L2-02 36 4|L2-03 36 5|L2-04 36 6|L2-05 36 7|L2-06 36 8|L2-07 36 9|L2-08 36 10|L2-09 36 11|L2-10 36 12|L2-11 36 13|L2-12 36 14|L2-13 36 15|L2-14 36 16|L2-15 36 17|L2-16 36 18|L2-17 36 19|L2-18 198 3|L2-19 198 4|L2-20 198 5|L2-21 198 6|L2-22 198 7|L2-23 198 8|L2-24 198 9|L2-25 198 10|L2-26 198 11|L2-27 198 12|L2-28 198 13|L2-29 198 14|L2-30 198 15|L2-31 198 16|L2-32 198 17|L2-33 198 18|L2-34 198 19",
  "L2-35 36 0|L2-36 36 1|L2-37 36 2|L2-38 36 3|L2-39 36 4|L2-40 36 5|L2-41 36 6|L2-42 36 7|L2-43 198 0|L2-44 198 1|L2-45 198 2|L2-46 198 3|L2-47 198 4|L2-48 198 5|L2-49 198 6|L2-50 198 7|L3-01 36 8|L3-02 36 9",
  "M1-01 36 0|M1-02 36 1|M1-03 36 2|M2-01 36 3|M2-02 36 4|M2-03 36 5|M2-04 36 6|M2-05 36 7|M2-06 36 8|M2-07 36 9|M2-08 36 10|M2-09 36 11|M2-10 36 12|M2-11 36 13|M2-12 36 14|M2-13 36 15|M2-14 36 16|M2-15 36 17|M2-16 36 18|M2-17 36 19|M2-18 198 3|M2-19 198 4|M2-20 198 5|M2-21 198 6|M2-22 198 7|M2-23 198 8|M2-24 198 9|M2-25 198 10|M2-26 198 11|M2-27 198 12|M2-28 198 13|M2-29 198 14|M2-30 198 15|M2-31 198 16|M2-32 198 17|M2-33 198 18|M2-34 198 19",
  "M2-35 36 0|M2-36 36 1|M2-37 36 2|M2-38 36 3|M2-39 36 4|M2-40 36 5",
  "N1-01 36 0|N1-02 36 1|N2-01 36 2|N2-02 36 3|N2-03 36 4|N2-04 144 2|N2-05 144 3|N2-06 144 4|N2-07 252 2",
  "N3-01 36 0|N3-02 36 1|N3-03 36 2|N3-04 198 0|N3-05 198 1|N4-01 36 3",
  "P1-01 36 0|P1-02 36 1|P2-01 36 2|P2-02 36 3|P2-03 198 2|P2-04 198 3",
  "P3-01 36 0|P3-02 36 1|P3-03 189 0|P3-04 189 1|P4-01 36 2",
  "O1-01 36 0|O1-02 36 1|O2-01 36 2|O2-02 36 3|O2-03 36 4|O2-04 36 5|O2-05 36 6",
];

type Line = { label: string; x: number; row: number };
const parse = (map: string[]): Line[][] =>
  map.map((p) =>
    p.split("|").map((l) => {
      const [label, x, row] = l.split(" ");
      return { label, x: Number(x), row: Number(row) };
    }),
  );

type Registries = {
  commands: { invoke: (id: string) => Promise<unknown> };
  importers: { resolve: (name: string) => { id: string } | null };
};
type CanvasGlobal = { __canvas: { ready: boolean; registries: Registries } };

const invoke = (page: Page, id: string) =>
  page.evaluate(
    (cmd) => (globalThis as unknown as CanvasGlobal).__canvas.registries.commands.invoke(cmd),
    id,
  );

/** Every paragraph of the section stories (`docx_s<k>`): its label, page
 *  index and first line's rect (page-relative pt), from the engine's
 *  rect-per-line selection geometry and `requestStoryContent`. */
async function placedLines(page: Page) {
  return page.evaluate(async () => {
    type Rect = { pageId: string; leftPt: number; topPt: number };
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
    const pages = JSON.parse((await c.executeScript("paged.pages()")).output[0] ?? "[]") as Array<{
      selfId: string;
      marginTopPt: number;
    }>;
    const stories = (
      JSON.parse((await c.executeScript("paged.stories()")).output[0] ?? "[]") as Array<{
        selfId: string;
      }>
    )
      .map((s) => s.selfId)
      .filter((id) => /^docx_s\d+$/.test(id))
      .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
    const out: Array<{ label: string; page: number; left: number; top: number; marginTop: number }> =
      [];
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
        const i = rects.length ? pages.findIndex((p) => p.selfId === rects[0].pageId) : -1;
        out.push({
          label: text.split(/\s+/)[0],
          page: i,
          left: rects[0]?.leftPt ?? NaN,
          top: rects[0]?.topPt ?? NaN,
          marginTop: pages[i]?.marginTopPt ?? NaN,
        });
      }
    }
    return { pageCount: pages.length, lines: out };
  });
}

/** Open `fixture` through File▸Open and hold every line against `want`. */
async function openAndCompare(page: Page, fixture: string, want: Line[][], tag: string) {
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
  await (await chooser).setFiles(HARNESS(fixture));
  await opened;

  await expect
    .poll(async () => (await placedLines(page)).pageCount, { timeout: 60_000 })
    .toBe(want.length);
  const { lines } = await placedLines(page);
  // The engine's line rect starts 2.4 pt above the glyph box Word's PDF
  // reports (12 pt exact leading, LeadingOffset): row n's rect top is
  // margin + 12 n + 2.4.
  const got: Line[][] = want.map(() => []);
  for (const l of lines) {
    expect(l.page, `${l.label} is on a page`).toBeGreaterThanOrEqual(0);
    got[l.page].push({
      label: l.label,
      x: Math.round(l.left * 100) / 100,
      row: Math.round((l.top - 2.4 - l.marginTop) / 12),
    });
  }
  console.log(`[${tag}] ${JSON.stringify(got.map((p) => p.map((l) => `${l.label} ${l.x} ${l.row}`).join("|")))}`);
  for (const [i, page] of want.entries()) {
    const key = (l: Line) => l.label;
    const ours = [...got[i]].sort((a, b) => key(a).localeCompare(key(b)));
    const theirs = [...page].sort((a, b) => key(a).localeCompare(key(b)));
    expect(ours.map(key), `page ${i + 1}: its lines`).toEqual(theirs.map(key));
    for (const [k, w] of theirs.entries()) {
      expect(Math.abs(ours[k].x - w.x), `page ${i + 1}: ${w.label} x`).toBeLessThan(0.25);
      expect(ours[k].row, `page ${i + 1}: ${w.label} row`).toBe(w.row);
    }
  }
}

test.describe("plugin-doc — Word's mid-page column changes (ADR 029)", () => {
  test.setTimeout(180_000);

  test("AC-DOCCOL-1 — a continuous section that changes the columns stays on Word's page, balanced like Word's @feat:plugin-doc.file-entry @level:gesture", async ({
    page,
  }) => {
    test.skip(engineProtocol() < 64, "span/split columns need wire protocol 64");
    const want = parse(CONTINUOUS);
    // Word page 3: B1, B2 and B3 share the page; B2 is two columns of five
    // and four lines; B4's six lines all in column 1.
    const b = want[2];
    expect(b.filter((l) => l.label.startsWith("B2") && l.x > 150)).toHaveLength(4);
    expect(b.filter((l) => l.label.startsWith("B4") && l.x > 150)).toHaveLength(0);
    await openAndCompare(page, "doc-continuous.docx", want, "AC-DOCCOL-1");
  });

  test("AC-DOCCOL-2 — column counts into each other, other gaps, and sections running past the page @feat:plugin-doc.file-entry @level:gesture", async ({
    page,
  }) => {
    test.skip(engineProtocol() < 64, "span/split columns need wire protocol 64");
    await openAndCompare(page, "doc-columns.docx", parse(COLUMNS), "AC-DOCCOL-2");
  });
});
