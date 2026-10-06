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

// Journey: a refresh from data is ONE undo step, and the saved session
// follows it back.
//
//   · BIND + LOWER — import a CSV, bind `name` and `role`, Lower: two fields
//     with the first record's values.
//   · CHANGE THE QUERY — the Data query panel saves a new SQL for the
//     bindings' query (q_all): a session change no document write carries.
//   · REFRESH — Refresh data, Refresh fields: both fields take the new first
//     record's values in ONE write.
//   · UNDO — one Edit ▸ Undo puts BOTH old values back.
//   · LABEL (engine protocol 69) — the refresh's write carried the document
//     label naming the session version with the new query; the undo takes
//     the label back to the version the Lower wrote, whose saved part still
//     holds the old query. (Before 69 the session part does not follow undo;
//     the label checks are skipped.)
//
// Gate: under REQUIRE_REAL_DUCKDB=1 a DuckDB that does not boot FAILS the
// journey (data-duckdb-gate.ts); otherwise it skips and says why.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";
import { skipWithoutDuckDB } from "./data-duckdb-gate";
import { dataFields, ENGINE_PROTOCOL, partText, sessionLabel } from "./data-engine";

const CSV_FIXTURE = pathResolve(dirname(fileURLToPath(import.meta.url)), "../../e2e/harness/data-people.csv");
const SOURCES_PANEL = "media.paged.data.panel.sources";
const BINDINGS_PANEL = "media.paged.data.panel.bindings";
const QUERY_PANEL = "media.paged.data.panel.query";
const CMD = { importData: "media.paged.data.command.importData", undo: "paged.editor.undo" } as const;
const LABELLED = ENGINE_PROTOCOL >= 69;

async function importCsv(page: Page, designer: Designer): Promise<void> {
  await designer.runCommand(CMD.importData);
  await openPanel(page, SOURCES_PANEL);
  const importButton = page.locator("[data-data-import-csv]");
  await expect(importButton).toBeVisible({ timeout: 10_000 });
  const chooser = page.waitForEvent("filechooser");
  await importButton.click();
  await (await chooser).setFiles(CSV_FIXTURE);
  const status = page.locator("[data-status]").last();
  try {
    await expect
      .poll(async () => (await status.getAttribute("data-status").catch(() => null)) ?? "?", { timeout: 45_000 })
      .toBe("ready");
  } catch {
    const got = (await status.getAttribute("data-status").catch(() => null)) ?? "unknown";
    skipWithoutDuckDB(got, `the refresh-undo journey needs DuckDB-WASM to boot (engine status "${got}")`);
  }
}

async function bind(page: Page, field: string): Promise<void> {
  await page.locator("[data-data-bind-field]").fill(field);
  await page.locator("[data-data-bind-add]").click();
  await expect(page.locator("[data-data-bind-msg]")).toContainText("variable binding");
}

const values = async (page: Page) => (await dataFields(page)).map((f) => f.value).sort();

test.describe("journey · paged.data refresh and undo", () => {
  test("a refresh is one undo step; undo restores the values and the session label @feat:data.plugin.bundle @feat:data.bind.engine @level:happy", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. BIND + LOWER ───────────────────────────────────────────────────
    await importCsv(page, designer);
    await openPanel(page, BINDINGS_PANEL);
    await expect(page.locator("[data-data-bind-author]")).toBeVisible({ timeout: 10_000 });
    await bind(page, "name");
    await bind(page, "role");
    await page.getByRole("button", { name: /lower to document/i }).click();
    await expect.poll(() => values(page), { timeout: 20_000 }).toEqual(["Ada Lovelace", "Author"]);
    const lowered = LABELLED ? await sessionLabel(page) : null;
    if (LABELLED) expect(lowered, "the Lower write carried the session label").not.toBeNull();

    // ── 2. CHANGE THE QUERY — a session change, no document write ────────
    await designer.runCommand("media.paged.data.command.editQuery");
    await openPanel(page, QUERY_PANEL);
    await page.locator("[data-data-query-sql]").fill("SELECT * FROM data_people WHERE name <> 'Ada Lovelace'");
    await page.locator("[data-data-query-id]").fill("q_all");
    await page.locator("[data-data-query-save]").click();
    await expect(page.locator("[data-data-query-saved]")).toContainText("q_all", { timeout: 20_000 });
    expect(await values(page), "saving a query writes nothing").toEqual(["Ada Lovelace", "Author"]);
    if (LABELLED) expect(await sessionLabel(page)).toBe(lowered);

    // ── 3. REFRESH — both fields in one write ─────────────────────────────
    await openPanel(page, BINDINGS_PANEL);
    await page.getByRole("button", { name: /refresh data/i }).click();
    await expect(page.getByText(/Data refreshed from sources/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /refresh fields/i }).click();
    // The stabilized record order without Ada: Alan Turing, Grace Hopper.
    await expect.poll(() => values(page), { timeout: 20_000 }).toEqual(["Alan Turing", "Theorist"]);
    let refreshed: string | null = null;
    if (LABELLED) {
      refreshed = await sessionLabel(page);
      expect(refreshed, "the refresh carried a new session label").not.toBe(lowered);
      expect(await partText(page, `paged/media.paged.data/sessions/${refreshed}.json`)).toContain("WHERE");
    }

    // ── 4. UNDO — one step takes both values back ─────────────────────────
    await designer.runCommand(CMD.undo);
    await expect.poll(() => values(page), { timeout: 20_000 }).toEqual(["Ada Lovelace", "Author"]);
    if (LABELLED) {
      // The label went back with the write: it names the version the Lower
      // wrote, whose part holds the query as it was.
      expect(await sessionLabel(page)).toBe(lowered);
      const before = await partText(page, `paged/media.paged.data/sessions/${lowered}.json`);
      expect(before).not.toBeNull();
      expect(before).not.toContain("WHERE");
    }
  });
});
