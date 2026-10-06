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

// Journey: InDesign Data Merge through the real editor (paged.data, campaign
// Wave 5), checked against what InDesign 2025 itself produced.
//
// The fixture is paged.data's `long-record-set` oracle
// (conformance/indesign-merge in plugin-data, copied to
// tests/e2e/harness/data-merge/): a US Letter template that InDesign wrote,
// whose one text frame holds `<<name>>`, `SKU: <<sku>>`, `Stock: <<stock>>`,
// a 57-record CSV in no column's sort order, and InDesign's own merge of it
// (Multiple Records, columns first, 6 pt row and 12 pt column spacing):
// 3 pages, 26 + 26 + 5 records.
//
//   · OPEN the template (File ▸ Open, the .idml InDesign saved);
//   · IMPORT the CSV in the Sources panel (DuckDB boots and sniffs it);
//   · MERGE from the Bindings panel's Data Merge row (Multiple records,
//     columns first, the template page consumed): 3 pages, and on every page
//     exactly InDesign's record texts;
//   · MERGE AGAIN: the first run is replaced, not added to (InDesign's texts
//     again, on the same 3 pages);
//   · UNDO: two steps take the re-merge back (the first merge is there), one
//     more takes the first merge's content back, and the last one its pages:
//     the template, as InDesign left it.
//
// Gate: under REQUIRE_REAL_DUCKDB=1 a DuckDB that does not boot FAILS the
// journey (data-duckdb-gate.ts); otherwise it skips and says why.

import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";
import { skipWithoutDuckDB } from "./data-duckdb-gate";

const HARNESS = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/data-merge",
);
const TEMPLATE = pathResolve(HARNESS, "long-record-set.idml");
const CSV = pathResolve(HARNESS, "long-record-set.csv");
const RECORDED = JSON.parse(
  readFileSync(pathResolve(HARNESS, "long-record-set.json"), "utf8"),
) as {
  merged: { page_count: number; pages: { text_frames: { text: string }[] }[] };
};

const SOURCES_PANEL = "media.paged.data.panel.sources";
const BINDINGS_PANEL = "media.paged.data.panel.bindings";
const CMD = {
  importData: "media.paged.data.command.importData",
  undo: "paged.editor.undo",
  open: "paged.file.openIdml",
} as const;

const normalise = (s: string) => s.replace(/\r/g, "\n").replace(/\uFEFF/g, "");

/** Per page, the text of every text frame, read from the engine. */
async function pageTexts(page: Page): Promise<string[][]> {
  return page.evaluate(async () => {
    type Reply = { kind: string; payload: Record<string, unknown> };
    const c = (
      globalThis as unknown as {
        __canvas: { client: { send(m: unknown): Promise<Reply> } };
      }
    ).__canvas;
    const tree = await c.client.send({ kind: "requestSceneTree" });
    type Node = { kind: string; id?: { kind: string; id: string } | null; children?: Node[] };
    const pages: { kind: string; id: string }[][] = [];
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        if (n.kind === "Page") {
          pages.push(
            (n.children ?? [])
              .map((x) => x.id)
              .filter((id): id is { kind: string; id: string } => !!id && id.kind === "textFrame"),
          );
        } else if (n.children) walk(n.children);
      }
    };
    walk(((tree.payload as { roots?: Node[] }).roots ?? []) as Node[]);
    const out: string[][] = [];
    for (const frames of pages) {
      const g = await c.client.send({ kind: "requestElementGeometry", payload: { ids: frames } });
      const items = ((g.payload as { items?: { storyId?: string }[] }).items ?? []);
      const texts: string[] = [];
      for (const it of items) {
        if (!it.storyId) continue;
        const r = await c.client.send({ kind: "requestStoryContent", payload: { storyId: it.storyId } });
        const content = (r.payload as { content?: { paragraphs: { runs: { text: string }[] }[] } }).content;
        texts.push(
          content ? content.paragraphs.map((p) => p.runs.map((x) => x.text).join("")).join("\n") : "",
        );
      }
      out.push(texts.sort());
    }
    return out;
  });
}

async function openTemplate(page: Page, designer: Designer): Promise<void> {
  const chooser = page.waitForEvent("filechooser", { timeout: 30_000 });
  const opening = designer.runCommand(CMD.open);
  await (await chooser).setFiles(TEMPLATE);
  await opening;
  await expect
    .poll(async () => (await pageTexts(page)).flat(), { timeout: 30_000 })
    .toEqual(["<<name>>\nSKU: <<sku>>\nStock: <<stock>>"]);
}

async function importCsv(page: Page, designer: Designer): Promise<void> {
  await designer.runCommand(CMD.importData);
  await openPanel(page, SOURCES_PANEL);
  const importButton = page.locator("[data-data-import-csv]");
  await expect(importButton).toBeVisible({ timeout: 10_000 });
  const chooser = page.waitForEvent("filechooser");
  await importButton.click();
  await (await chooser).setFiles(CSV);
  const status = page.locator("[data-status]").last();
  try {
    await expect
      .poll(async () => (await status.getAttribute("data-status").catch(() => null)) ?? "?", {
        timeout: 45_000,
      })
      .toBe("ready");
  } catch {
    const got = (await status.getAttribute("data-status").catch(() => null)) ?? "unknown";
    skipWithoutDuckDB(got, `the data-merge journey needs DuckDB-WASM to boot (engine status "${got}")`);
  }
}

async function merge(page: Page): Promise<void> {
  await openPanel(page, BINDINGS_PANEL);
  const row = page.locator("[data-data-merge]");
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.locator("[data-data-merge-mode]").selectOption("multiple");
  await row.locator("select").nth(2).selectOption("columns");
  await row.getByLabel(/row spacing/).fill("6");
  await row.getByLabel(/column spacing/).fill("12");
  await row.getByLabel(/keep template/).uncheck();
  await row.locator("[data-data-merge-run]").click();
  await expect(page.locator("[data-data-merge-msg]")).toContainText(
    "merged 57 record(s) onto 3 page(s)",
    { timeout: 60_000 },
  );
}

test.describe("journey · paged.data Data Merge", () => {
  test("merge InDesign's long-record-set template: pages and texts match the InDesign recording @feat:data.lower.content @feat:data.plugin.bundle @level:happy", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const designer = new Designer(page);
    await designer.open();
    await openTemplate(page, designer);
    await importCsv(page, designer);

    // ── MERGE — InDesign's pages and texts ────────────────────────────────
    await merge(page);
    const expected = RECORDED.merged.pages.map((p) =>
      p.text_frames.map((t) => normalise(t.text)).sort(),
    );
    await expect.poll(async () => pageTexts(page), { timeout: 30_000 }).toEqual(expected);

    // ── MERGE AGAIN — replaces the first run ──────────────────────────────
    await merge(page);
    await expect.poll(async () => pageTexts(page), { timeout: 30_000 }).toEqual(expected);

    // ── UNDO — two steps per merge (pages, then content) ──────────────────
    // Two undos take the re-merge back: the first merge's output is there.
    for (let i = 0; i < 2; i++) {
      await designer.runCommand(CMD.undo);
      await page.waitForTimeout(250);
    }
    await expect.poll(async () => pageTexts(page), { timeout: 30_000 }).toEqual(expected);
    // One more takes the first merge's content back: its pages stay, empty.
    await designer.runCommand(CMD.undo);
    await expect
      .poll(async () => (await pageTexts(page)).map((p) => p.length), { timeout: 30_000 })
      .toEqual([0, 0, 0]);
    // And the last one, the first merge's pages: the template is back — one
    // page, its one frame, its placeholders (D-29: the editor used to bring
    // the first merge's 57 frames back here).
    await designer.runCommand(CMD.undo);
    await expect
      .poll(async () => (await pageTexts(page)).flat(), { timeout: 30_000 })
      .toEqual(["<<name>>\nSKU: <<sku>>\nStock: <<stock>>"]);
  });
});
