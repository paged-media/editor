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

// Journey: JSON, NDJSON, Parquet and XLSX imports run in the editor, under its
// CSP, without leaving the origin.
//
// DuckDB-WASM's eh build has no json or parquet extension built in; DuckDB
// loads them on first use. It used to fetch them from extensions.duckdb.org,
// which the editor's CSP (connect-src 'self') refuses, and the worker trapped
// ("unreachable") on the first such import. @paged-media/data now ships both
// in bin/duckdb-ext/ and points DuckDB's extension repository there; this
// editor serves that directory (vite.config.ts: the dev route and the
// dist/bin copy). The journey imports one file of each format through the
// Sources panel and checks each became a source, no import failed, and no
// request left the editor's origin.
import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";
import { skipWithoutDuckDB } from "./data-duckdb-gate";

const HARNESS = pathResolve(dirname(fileURLToPath(import.meta.url)), "../../e2e/harness");
const SOURCES_PANEL = "media.paged.data.panel.sources";
const IMPORT = "media.paged.data.command.importData";

const FILES: { name: string; source: string; format: string; buffer: Buffer }[] = [
  {
    name: "catalog.json",
    source: "catalog",
    format: "json",
    buffer: Buffer.from('[{"sku":"A-1","price":9.99},{"sku":"B-2","price":19.5}]'),
  },
  {
    name: "events.ndjson",
    source: "events",
    format: "json",
    buffer: Buffer.from('{"id":1,"at":"2026-01-15"}\n{"id":2,"at":"2026-02-01"}\n'),
  },
  {
    name: "products.parquet",
    source: "products",
    format: "parquet",
    buffer: readFileSync(pathResolve(HARNESS, "data-products.parquet")),
  },
  {
    name: "workbook.xlsx",
    source: "workbook",
    format: "xlsx",
    buffer: readFileSync(pathResolve(HARNESS, "data-products.xlsx")),
  },
];

async function importFile(page: Page, f: (typeof FILES)[number]): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.locator("[data-data-import-file]").click();
  await (await chooser).setFiles({ name: f.name, mimeType: "application/octet-stream", buffer: f.buffer });
  await expect(page.locator(`[data-data-source="${f.source}"]`)).toContainText(f.format, {
    timeout: 45_000,
  });
}

test.describe("journey · paged.data import formats", () => {
  test("JSON, NDJSON, Parquet and XLSX import same-origin under the editor's CSP @feat:data.source.adapters @level:happy", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const offOrigin: string[] = [];
    const extensionLoads: string[] = [];
    const traps: string[] = [];
    page.on("request", (r) => {
      const u = r.url();
      if (/^(data|blob):/.test(u)) return;
      if (u.includes("duckdb_extension")) extensionLoads.push(new URL(u).pathname);
      if (!u.startsWith("http://127.0.0.1") && !u.startsWith("http://localhost")) offOrigin.push(u);
    });
    page.on("console", (m) => {
      if (m.type() === "error" && /unreachable|RuntimeError|Content Security Policy|extensions\.duckdb\.org/.test(m.text()))
        traps.push(m.text());
    });
    page.on("pageerror", (e) => {
      if (/unreachable|RuntimeError/.test(e.message)) traps.push(e.message);
    });

    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await designer.runCommand(IMPORT);
    await openPanel(page, SOURCES_PANEL);
    await expect(page.locator("[data-data-import-file]")).toBeVisible({ timeout: 10_000 });

    // The first import boots DuckDB; skip (or fail under REQUIRE_REAL_DUCKDB=1)
    // when it cannot, as every data journey does.
    const status = page.locator("[data-status]").last();
    for (const f of FILES) {
      try {
        await importFile(page, f);
      } catch (err) {
        const got = (await status.getAttribute("data-status").catch(() => null)) ?? "unknown";
        if (got !== "ready") skipWithoutDuckDB(got, `the import-formats journey needs DuckDB-WASM (engine status "${got}")`);
        throw err;
      }
    }

    await expect(status).toHaveAttribute("data-status", "ready");
    await expect(page.locator('[data-data-diagnostics] li[data-level="error"]')).toHaveCount(0);
    expect(traps).toEqual([]);
    expect(offOrigin).toEqual([]);
    // Both extensions came from the bundle's bin/duckdb-ext, nowhere else.
    expect(extensionLoads.map((p) => p.replace(/^.*\/duckdb-ext\//, "duckdb-ext/")).sort()).toEqual([
      "duckdb-ext/v1.1.1/wasm_eh/json.duckdb_extension.wasm",
      "duckdb-ext/v1.1.1/wasm_eh/parquet.duckdb_extension.wasm",
    ]);
  });
});
