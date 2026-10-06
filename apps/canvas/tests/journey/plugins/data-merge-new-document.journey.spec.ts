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

// Journey: Data Merge into a NEW document (InDesign's "Create Merged
// Document"), through the documents door (D-26, editor ADR 219).
//
//   · TEMPLATE + DATA — open InDesign's long-record-set template, import its
//     CSV.
//   · MERGE INTO A NEW DOCUMENT — the merge row's "into a new document": the
//     plugin copies the open document, the editor opens the copy (asking
//     keep/discard first if the open document has unsaved edits; here it is
//     discarded), the data session follows the switch and restores the
//     copy's session, and the merge consumes the template page there.
//   · RESULT — InDesign's pages and texts; the new document is named
//     "<template> (merged)"; one undo (engine protocol 69: pages and content
//     in one batch) takes the merge back to the template.
//
// Needs plugin-api/plugin-sdk 0.2.41 (host.documents); on an older contract
// the checkbox is disabled and the journey skips, saying why.
// Gate: under REQUIRE_REAL_DUCKDB=1 a DuckDB that does not boot FAILS the
// journey (data-duckdb-gate.ts); otherwise it skips and says why.

import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";
import { skipWithoutDuckDB } from "./data-duckdb-gate";
import { ENGINE_PROTOCOL } from "./data-engine";

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

async function mergeToNewDocument(page: Page): Promise<void> {
  await openPanel(page, BINDINGS_PANEL);
  const row = page.locator("[data-data-merge]");
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.locator("[data-data-merge-mode]").selectOption("multiple");
  await row.locator("select").nth(2).selectOption("columns");
  await row.getByLabel(/row spacing/).fill("6");
  await row.getByLabel(/column spacing/).fill("12");
  await row.getByLabel(/keep template/).uncheck();
  await row.locator("[data-data-merge-new-doc]").check();
  await row.locator("[data-data-merge-run]").click();
  await expect(page.locator("[data-data-merge-msg]")).toContainText(
    "merged 57 record(s) onto 3 page(s)",
    { timeout: 60_000 },
  );
}

test.describe("journey · paged.data merge into a new document", () => {
  test("merge InDesign's long-record-set template into a new document @feat:data.lower.content @feat:data.plugin.bundle @level:happy", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const designer = new Designer(page);
    await designer.open();
    await openTemplate(page, designer);
    await importCsv(page, designer);

    await openPanel(page, BINDINGS_PANEL);
    const newDoc = page.locator("[data-data-merge-new-doc]");
    await expect(newDoc).toBeVisible({ timeout: 10_000 });
    test.skip(await newDoc.isDisabled(), "this editor's plugin contract has no documents door (D-26, plugin-api 0.2.41)");

    // ── MERGE INTO A NEW DOCUMENT ─────────────────────────────────────────
    const run = mergeToNewDocument(page);
    // The open document may carry unsaved edits (the imported session):
    // the editor asks; discard it, the merged document replaces it.
    const ask = page.getByTestId("replace-document-dialog");
    await Promise.race([
      ask.waitFor({ state: "visible", timeout: 15_000 }).then(
        () => page.getByTestId("replace-document-discard").click(),
        () => undefined,
      ),
      run,
    ]);
    await run;
    const expected = RECORDED.merged.pages.map((p) =>
      p.text_frames.map((t) => normalise(t.text)).sort(),
    );
    await expect.poll(async () => pageTexts(page), { timeout: 30_000 }).toEqual(expected);
    // The editor shows the name the plugin asked for: "<template> (merged)".
    await expect(page.getByText(/\(merged\)/).first()).toBeVisible({ timeout: 10_000 });

    // ── UNDO — the copy starts with an empty history; the merge undoes back
    // to the template (one step on protocol 69, two before).
    for (let i = 0; i < (ENGINE_PROTOCOL >= 69 ? 1 : 2); i++) {
      await designer.runCommand(CMD.undo);
      await page.waitForTimeout(250);
    }
    await expect
      .poll(async () => (await pageTexts(page)).flat(), { timeout: 30_000 })
      .toEqual(["<<name>>\nSKU: <<sku>>\nStock: <<stock>>"]);
  });
});
