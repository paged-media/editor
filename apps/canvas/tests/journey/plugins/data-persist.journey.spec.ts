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

// Journey: a paged.data session SURVIVES save and reopen.
//
// The data plugin keeps its sources, queries and bindings in a session. Since
// @paged-media/data 0.1.0-canary.10 (wave 4) the session is saved with the
// document as the plugin's `session` container part
// (paged/media.paged.data/session.json) and restored when a document opens.
// This journey drives that through the real editor:
//
//   · IMPORT + BIND — import a CSV in the Sources panel (DuckDB boots), define
//     a variable binding on the `name` column in the Bindings panel, Lower:
//     a tagged field with the first record's value lands in the document.
//   · SAVE — Save (.paged) through the real command; the will-save hook
//     writes the session part first, and the downloaded file carries it.
//   · REOPEN — File ▸ New (nothing of the document stays), then File ▸ Open
//     the saved file: the Bindings panel lists the binding again and the
//     Sources panel lists the source, with no re-import.
//   · REFRESH — stepping the preview to record 2 re-runs the query in DuckDB
//     (the restored CSV is registered on DuckDB's first boot) and writes the
//     SAME field in place; Lower again re-resolves it without placing a
//     second field.
//   · UNDO — Edit ▸ Undo puts the previous field value back; the session part
//     is container state and does not change with undo.
//
// Gate: under REQUIRE_REAL_DUCKDB=1 a DuckDB that does not boot FAILS the
// journey (data-duckdb-gate.ts); otherwise it skips and says why.

import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { readZipText, zipEntryNames } from "../../e2e/harness/read-zip";
import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";
import { skipWithoutDuckDB } from "./data-duckdb-gate";

const CSV_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/data-people.csv",
);

const SOURCES_PANEL = "media.paged.data.panel.sources";
const BINDINGS_PANEL = "media.paged.data.panel.bindings";
const SESSION_PART = "paged/media.paged.data/session.json";
const CMD = {
  importData: "media.paged.data.command.importData",
  undo: "paged.editor.undo",
  savePaged: "paged.file.savePaged",
  open: "paged.file.openIdml",
} as const;

interface Field {
  plugin: string;
  key: string;
  value: string | null;
}

/** This plugin's placeholder fields, freshly read from the engine. */
async function dataFields(page: Page): Promise<Field[]> {
  const items = await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            send(m: {
              kind: string;
            }): Promise<{ kind: string; payload: { items?: unknown[] } }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.send({ kind: "requestDocumentPlaceholders" });
    return reply.kind === "documentPlaceholders"
      ? (reply.payload.items ?? [])
      : [];
  });
  return (items as Field[]).filter((f) => f.plugin === "media.paged.data");
}

async function partText(page: Page, path: string): Promise<string | null> {
  return page.evaluate(async (p) => {
    const paged = (
      globalThis as unknown as {
        __paged: { parts: { read(path: string): Promise<Uint8Array | null> } };
      }
    ).__paged;
    const b = await paged.parts.read(p);
    return b ? new TextDecoder().decode(b) : null;
  }, path);
}

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
      .poll(
        async () =>
          (await status.getAttribute("data-status").catch(() => null)) ?? "?",
        {
          timeout: 45_000,
        },
      )
      .toBe("ready");
  } catch {
    const got =
      (await status.getAttribute("data-status").catch(() => null)) ?? "unknown";
    skipWithoutDuckDB(
      got,
      `the data-persist journey needs DuckDB-WASM to boot (engine status "${got}")`,
    );
  }
}

async function savePaged(designer: Designer, page: Page): Promise<Buffer> {
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await designer.runCommand(CMD.savePaged);
  return readFileSync(await (await download).path());
}

test.describe("journey · paged.data persistence", () => {
  test("import, bind, save, reopen, refresh, undo: the data session comes back with the file @feat:data.plugin.persistence @feat:data.bind.authoring @level:happy", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. IMPORT + BIND + LOWER ──────────────────────────────────────────
    await importCsv(page, designer);
    await openPanel(page, BINDINGS_PANEL);
    await expect(page.locator("[data-data-bind-author]")).toBeVisible({
      timeout: 10_000,
    });
    await page.locator("[data-data-bind-field]").fill("name");
    await page.locator("[data-data-bind-add]").click();
    await expect(page.locator("[data-data-bind-msg]")).toContainText(
      "variable binding",
    );
    await page.getByRole("button", { name: /lower to document/i }).click();
    await expect
      .poll(async () => (await dataFields(page)).map((f) => f.value), {
        timeout: 20_000,
      })
      .toEqual(["Ada Lovelace"]);
    const key = (await dataFields(page))[0].key;

    // ── 2. SAVE — the session part is in the file ─────────────────────────
    const saved = await savePaged(designer, page);
    expect(zipEntryNames(saved)).toContain(SESSION_PART);
    const part = JSON.parse(readZipText(saved, SESSION_PART) ?? "{}") as {
      v?: number;
      engine?: { bindings?: { id: string }[] };
      data?: { source: string }[];
    };
    expect(part.v).toBe(1);
    expect(part.engine?.bindings?.map((b) => b.id)).toEqual([key]);
    expect(part.data?.map((d) => d.source)).toEqual(["data_people"]);

    // ── 3. REOPEN — File ▸ New, then File ▸ Open the saved file ───────────
    await designer.newDocument();
    expect(
      await dataFields(page),
      "the new document has no data field",
    ).toEqual([]);
    await openPanel(page, BINDINGS_PANEL);
    await expect(page.locator("[data-data-bindings]")).toContainText(
      /bindings:\s*none/,
    );
    const chooser = page.waitForEvent("filechooser", { timeout: 30_000 });
    const opening = designer.runCommand(CMD.open);
    await (
      await chooser
    ).setFiles({
      name: "data-persist.paged",
      mimeType: "application/x-paged+zip",
      buffer: saved,
    });
    await opening;
    await expect
      .poll(async () => (await dataFields(page)).map((f) => f.value), {
        timeout: 30_000,
      })
      .toEqual(["Ada Lovelace"]);
    await expect(page.locator("[data-data-bindings]")).toContainText(key, {
      timeout: 20_000,
    });
    await openPanel(page, SOURCES_PANEL);
    await expect(page.getByText(/data_people/).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("[data-data-persistence]")).toHaveAttribute(
      "data-data-persistence",
      "saved",
    );

    // ── 4. REFRESH — step to record 2: DuckDB re-runs the restored query ──
    await openPanel(page, BINDINGS_PANEL);
    await page.getByRole("button", { name: /refresh data/i }).click();
    await expect(page.getByText(/Data refreshed from sources/)).toBeVisible({
      timeout: 30_000,
    });
    await page
      .getByTestId("preview-stepper")
      .locator('input[type="number"]')
      .fill("2");
    await expect(page.getByTestId("preview-position")).toHaveText("2 / 3", {
      timeout: 20_000,
    });
    await expect
      .poll(async () => (await dataFields(page)).map((f) => f.value), {
        timeout: 30_000,
      })
      .toEqual(["Grace Hopper"]);
    // Lower re-resolves the same field (record 1); it does not place a second.
    await page.getByRole("button", { name: /lower to document/i }).click();
    await expect
      .poll(async () => (await dataFields(page)).map((f) => f.value), {
        timeout: 20_000,
      })
      .toEqual(["Ada Lovelace"]);

    // ── 5. UNDO — the field write undoes; the session part does not ───────
    const partBefore = await partText(page, SESSION_PART);
    expect(
      partBefore,
      "the reopened document carries the session part",
    ).not.toBeNull();
    await designer.runCommand(CMD.undo);
    await expect
      .poll(async () => (await dataFields(page)).map((f) => f.value), {
        timeout: 20_000,
      })
      .toEqual(["Grace Hopper"]);
    expect(await partText(page, SESSION_PART)).toBe(partBefore);
  });
});
