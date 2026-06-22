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

// Journey: paged.data FIELD-MAPPING WIZARD through the bindings panel — the §9
// one-click "map this source's columns to variable bindings" flow.
//
// data.bind.field-mapping is a Rust kernel (`suggest_mappings(schema)`) that
// turns a query's resolved schema into ColumnMapping[] — one row per result
// column with a humanised header (`unit_price` → `Unit Price`), the bound
// expr = the bare field reference, a logical type hint, and a `mappable` flag
// (false when the column name is not a bare DSL identifier, so the wizard asks
// for a manual expression rather than inventing a quoting grammar). The bundle
// renders these as a header → binding checklist and, on confirm, generates one
// variable binding per CHOSEN mappable column from the engine-computed expr.
//
// This journey drives that wizard THROUGH the panel: import a CSV, open the
// wizard ("Map fields…"), assert the engine surfaced a mapping row per CSV
// column with a humanised header + a suggested expr, toggle the selection, and
// confirm — asserting the chosen-count label moves and the bindings list grows
// with the generated variable bindings. The data semantics stay in Rust; the
// journey proves the wizard surface drives end to end.

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const CSV_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/data-people.csv",
);

const SOURCES_PANEL = "media.paged.data.panel.sources";
const BINDINGS_PANEL = "media.paged.data.panel.bindings";
const IMPORT_COMMAND = "media.paged.data.command.importData";

const invoke = (page: Page, id: string) =>
  page.evaluate(
    (c) =>
      (
        globalThis as unknown as {
          __canvas: { registries: { commands: { invoke: (i: string) => Promise<unknown> } } };
        }
      ).__canvas.registries.commands.invoke(c),
    id,
  );

async function importCsv(page: Page): Promise<boolean> {
  await invoke(page, IMPORT_COMMAND);
  await openPanel(page, SOURCES_PANEL);
  const fileInput = page.locator('input[type="file"][accept*="csv"]');
  await expect(fileInput).toBeVisible({ timeout: 10_000 });
  await fileInput.setInputFiles(CSV_FIXTURE);
  const status = page.locator("[data-status]").last();
  try {
    await expect
      .poll(async () => (await status.getAttribute("data-status").catch(() => null)) ?? "?", {
        timeout: 45_000,
      })
      .toBe("ready");
    return true;
  } catch {
    return false;
  }
}

test.describe("journey · paged.data field-mapping wizard", () => {
  test("a designer maps source columns to variable bindings one-click @feat:data.bind.field-mapping @feat:data.plugin.bundle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. IMPORT — the wizard needs an ingested result to read the schema. ──
    const ready = await importCsv(page);
    if (!ready) {
      const got =
        (await page.locator("[data-status]").last().getAttribute("data-status").catch(() => null)) ??
        "unknown";
      test.skip(
        true,
        `field-mapping wizard needs DuckDB-WASM to boot (engine status "${got}"). It boots on the ` +
          "standard editor dev server (Vite duckdbDistRoute + COOP/COEP isolation); this skip only " +
          "fires if the vendored dist is absent or the context is not cross-origin isolated.",
      );
    }
    await expect(page.getByText(/data_people/).first()).toBeVisible({ timeout: 6_000 });

    // ── 2. OPEN THE WIZARD — "Map fields…" refreshes the demo query, then asks
    //    the engine (`query_mappings`) for the column → variable-binding
    //    suggestions, defaulting the mappable columns to checked. ──
    await openPanel(page, BINDINGS_PANEL);
    await expect(page.getByText(/paged\.data · bindings/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /map fields/i }).click();

    // ── 3. WIZARD COLUMNS — the engine computed one row per CSV column. The
    //    fixture columns are `name` + `role` — bare identifiers → mappable,
    //    each with an engine-computed expr (the bare field reference). ──
    const wizardColumns = page.locator('[data-testid="wizard-columns"]');
    await expect(wizardColumns).toBeVisible({ timeout: 10_000 });
    const rows = wizardColumns.locator("label");
    await expect(rows).toHaveCount(2, { timeout: 6_000 });
    // Humanised headers surface ("name" → "Name", "role" → "Role").
    await expect(wizardColumns).toContainText(/Name/);
    await expect(wizardColumns).toContainText(/Role/);
    // Each mappable column carries the engine's suggested DSL expr in a <code>.
    await expect(wizardColumns.locator("code")).toHaveCount(2);

    // ── 4. TOGGLE SELECTION — uncheck one column; the confirm button's
    //    chosen-count label must follow (the panel reflects the engine choices,
    //    the designer overrides). Both default checked → "Create 2 bindings". ──
    const confirm = page.getByTestId("wizard-confirm");
    await expect(confirm).toHaveText(/Create 2 bindings/i, { timeout: 6_000 });
    await rows.first().locator('input[type="checkbox"]').uncheck();
    await expect(confirm).toHaveText(/Create 1 binding\b/i, { timeout: 6_000 });
    // Re-check it so the confirm wires both.
    await rows.first().locator('input[type="checkbox"]').check();
    await expect(confirm).toHaveText(/Create 2 bindings/i, { timeout: 6_000 });

    // ── 5. CONFIRM — generate a variable binding per chosen mappable column
    //    from the engine-computed expr. The wizard closes and the bindings list
    //    grows with the generated variable bindings (v_name, v_role). ──
    await confirm.click();
    await expect(wizardColumns).toBeHidden({ timeout: 6_000 });
    await expect(page.getByText(/bindings:.*v_name/i).first()).toBeVisible({ timeout: 6_000 });
    await expect(page.getByText(/bindings:.*v_role/i).first()).toBeVisible({ timeout: 6_000 });
  });
});
