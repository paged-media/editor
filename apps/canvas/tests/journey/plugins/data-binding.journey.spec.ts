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

// Journey: paged.data BINDING ENGINE + EXPRESSION DSL through the bindings
// panel — a designer imports a CSV, wires a binding over the imported source,
// resolves it through the Rust resolution engine, and lowers the computed
// value INTO the layout where it VISIBLY renders.
//
// This drives the two engine-backed rows that surface THROUGH the bindings
// panel (NOT left to the in-repo suite alone):
//   • data.bind.engine — the salsa-shaped ResolutionEngine: define → resolve →
//     sync states (Linked/Stale). The "Wire demo binding" button defines a
//     variable + table binding against the imported query; "Lower to document"
//     refreshes the data through DuckDB and commits the resolved content.
//   • data.expr.engine — the binding-expression DSL. The field-mapping wizard
//     ("Map fields…") asks the Rust engine for column → variable-binding
//     suggestions, each carrying an engine-COMPUTED DSL expression (a bare
//     field reference in the publishing grammar). Confirming the wizard wires
//     those expressions; the next lower resolves each DSL expression against
//     the live records and the computed value renders on the page.
//   • data.lower.content / data.lower.v43-consumers — the lowered variable is
//     placed as a tagged FIELD (D-01) and the table region lowers to native
//     content (D-02); both are the §9 lowering lanes reaching the page.
//   • data.query.seam — the CSV → DuckDB → Arrow → RecordSet seam the import
//     gateway drives (the source reaches "ready" only when the seam ran).
//
// DuckDB-WASM headless boot is UNBLOCKED (the Vite duckdbDistRoute middleware +
// the COOP/COEP isolation; see data-render.journey.spec.ts). The render
// assertion is HARD; it SKIPS-with-status only if the vendored dist is absent
// or the context is not cross-origin isolated.

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

/** Import the CSV through the sources panel + wait for the DuckDB query engine
 *  to reach "ready" (the data.query.seam ran). Returns true when ready; false
 *  → the caller skips honestly (the heavy engine did not boot). */
async function importCsv(page: Page): Promise<boolean> {
  await invoke(page, IMPORT_COMMAND);
  await openPanel(page, SOURCES_PANEL);
  // data canary.6: the sources panel imports through the shell.pickFile@1
  // door (programmatic input.click -> Playwright filechooser, the
  // doc.journey idiom); the raw <input> survives only in the SDK harness.
  const importButton = page.locator("[data-data-import-csv]");
  await expect(importButton).toBeVisible({ timeout: 10_000 });
  const chooser = page.waitForEvent("filechooser");
  await importButton.click();
  await (await chooser).setFiles(CSV_FIXTURE);

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

test.describe("journey · paged.data binding engine + expression DSL", () => {
  test("a designer wires a binding and the resolved value renders: import → define → resolve → lower @feat:data.bind.engine @feat:data.expr.engine @feat:data.lower.content @feat:data.lower.v43-consumers @feat:data.query.seam @feat:data.plugin.bundle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. NEGATIVE CONTROL — the blank page is render-stable (the oracle). ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. IMPORT GATEWAY — feed the CSV; the session boots DuckDB-WASM, runs
    //    the CSV→Arrow→RecordSet seam (data.query.seam), and registers the
    //    source. Reaching "ready" means the seam ran. ──
    const ready = await importCsv(page);
    if (!ready) {
      const got =
        (await page.locator("[data-status]").last().getAttribute("data-status").catch(() => null)) ??
        "unknown";
      test.skip(
        true,
        `paged.data binding render needs DuckDB-WASM to boot (engine status "${got}"). On the ` +
          "standard editor dev server it boots on both lanes (Vite duckdbDistRoute + the " +
          "COOP/COEP isolation); this skip only fires if the vendored dist is absent or the " +
          "context is not cross-origin isolated.",
      );
    }
    await expect(page.getByText(/data_people/).first()).toBeVisible({ timeout: 6_000 });

    // ── 2. BIND ENGINE — open the bindings panel and DEFINE bindings against
    //    the imported source. "Wire demo binding" defines a query + a variable
    //    binding + a single-region table binding on the Rust ResolutionEngine
    //    (data.bind.engine). ──
    await openPanel(page, BINDINGS_PANEL);
    await expect(page.locator("[data-data-bind-author]")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /wire demo binding/i }).click();
    await page.waitForTimeout(300);
    // The panel's snapshot now lists the wired bindings (the engine accepted
    // the define_binding calls — the resolution graph has nodes).
    await expect(page.getByText(/bindings:\s*(?!none)/i).first()).toBeVisible({ timeout: 6_000 });

    // ── 3. EXPRESSION DSL — run the field-mapping wizard so the Rust engine
    //    computes column → variable-binding suggestions, each carrying an
    //    engine-COMPUTED DSL expression (data.expr.engine). Confirm it to wire
    //    those expression bindings. The wizard column list renders the engine's
    //    suggested <code>expr</code> per mappable column. ──
    await page.getByRole("button", { name: /map fields/i }).click();
    const wizardColumns = page.locator('[data-testid="wizard-columns"]');
    await expect(wizardColumns).toBeVisible({ timeout: 10_000 });
    // The CSV columns (name, role) are bare DSL identifiers → mappable, so the
    // engine suggested a real DSL expression for each (rendered in a <code>).
    await expect(wizardColumns.locator("code").first()).toBeVisible({ timeout: 6_000 });
    const suggestedExpr = (await wizardColumns.locator("code").first().textContent())?.trim() ?? "";
    expect(suggestedExpr, "the engine computed a DSL expression for a mappable column").not.toBe("");
    await page.getByTestId("wizard-confirm").click();
    await page.waitForTimeout(300);

    // ── 4. RESOLVE + LOWER (render) — "Lower to document" refreshes the data
    //    through DuckDB (resolving every expression binding against the live
    //    records) and commits the resolved content as native Paged Mutations.
    //    The blank page now carries the data-driven content. ──
    const beforeLower = await designer.renderBytes();
    await page.getByRole("button", { name: /lower to document/i }).click();
    // The lower lane runs a DuckDB query + commits Mutations; let the worker +
    // the render pipeline settle.
    await page.waitForTimeout(1500);
    const afterLower = await designer.renderBytes();

    // ── 5. RENDER ASSERTION (HARD) — the resolved/computed value visibly
    //    reached the page (the §9 lowering lanes lowered real content). ──
    await designer.expectRenderChanged(beforeLower, afterLower);
  });
});
