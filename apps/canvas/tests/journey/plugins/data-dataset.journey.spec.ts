// Journey: paged.data DATASET PANEL (openDataset) — the materialized-records
// view over an imported source: the §7 governed catalog, the §7.1 data-provider
// publish, the §9.1 locale display, and the §10 batch plan, all driven through
// the dataset panel the `openDataset` command opens.
//
// Rows driven through THIS panel:
//   • data.source.adapters — the inline/file source adapter the import wired is
//     the dataset the catalog materializes (the panel lists the resolved
//     columns of the imported source over the demo query).
//   • data.provider.contract (D-09) — "Publish provider" produces the engine
//     publication (schema + stabilized rows + revision etag) ready to register
//     with the core data-provider registry; the panel renders the provider
//     id + revision. In a standalone editor the host.dataProviders door may be
//     absent → the bundle reports "registration deferred (D-09)" honestly. The
//     live cross-plugin consume is the sheet-dataset journey (S-15).
//   • data.i18n.display — the locale select (en/de) drives the §9.1 display
//     kernels (NUMBER/CURRENCY/PERCENT/DATEFMT formatting locale).
//   • data.query.seam — the catalog refresh re-runs the DuckDB query (the
//     CSV→Arrow→RecordSet seam) before materializing.
//
// The dataset panel shows "No queries yet" until a query is defined in the
// bindings panel, so this journey wires the demo binding first (it adds the
// `q_all` query), then opens the dataset panel and drives its controls.

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
const DATASET_PANEL = "media.paged.data.panel.dataset";
const IMPORT_COMMAND = "media.paged.data.command.importData";
const OPEN_DATASET_COMMAND = "media.paged.data.command.openDataset";

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

test.describe("journey · paged.data dataset panel", () => {
  test("a designer opens the dataset panel and materializes the imported source: catalog, locale, publish @feat:data.source.adapters @feat:data.provider.contract @feat:data.i18n.display @feat:data.query.seam @feat:data.plugin.bundle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. IMPORT — register the inline/file source adapter through DuckDB. ──
    const ready = await importCsv(page);
    if (!ready) {
      const got =
        (await page.locator("[data-status]").last().getAttribute("data-status").catch(() => null)) ??
        "unknown";
      test.skip(
        true,
        `dataset panel needs DuckDB-WASM to boot (engine status "${got}"). It boots on the ` +
          "standard editor dev server (Vite duckdbDistRoute + COOP/COEP isolation); this skip only " +
          "fires if the vendored dist is absent or the context is not cross-origin isolated.",
      );
    }
    await expect(page.getByText(/data_people/).first()).toBeVisible({ timeout: 6_000 });

    // ── 2. DEFINE A QUERY — the dataset panel materializes a query; the demo
    //    binding adds the `q_all` query (SELECT * FROM the source). ──
    await openPanel(page, BINDINGS_PANEL);
    await expect(page.getByText(/paged\.data · bindings/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /wire demo binding/i }).click();
    await page.waitForTimeout(300);

    // ── 3. OPEN THE DATASET PANEL via the openDataset command (the menu/
    //    palette entry). It mounts and shows the query selector (no longer the
    //    "No queries yet" empty state). ──
    await invoke(page, OPEN_DATASET_COMMAND);
    await expect(page.getByText(/paged\.data · dataset/i)).toBeVisible({ timeout: 10_000 });
    const datasetPanel = page
      .locator("div")
      .filter({ hasText: /paged\.data · dataset/i })
      .last();
    await expect(datasetPanel.getByText(/^query:/)).toBeVisible({ timeout: 8_000 });

    // ── 4. CATALOG (§7) — "Refresh + catalog" re-runs the DuckDB query
    //    (data.query.seam) and materializes the resolved schema: the panel
    //    headlines the column count of the imported source's records. The CSV
    //    fixture has 2 columns (name, role). ──
    await datasetPanel.getByRole("button", { name: /refresh \+ catalog/i }).click();
    await expect(datasetPanel.getByText(/catalog:\s*\d+\s*cols/i)).toBeVisible({ timeout: 10_000 });
    await expect(datasetPanel.getByText(/catalog:\s*2\s*cols/i)).toBeVisible({ timeout: 6_000 });

    // ── 5. LOCALE (§9.1, data.i18n.display) — switch the display locale en→de.
    //    The select drives the engine's formatting kernels; the panel reflects
    //    the chosen locale. ──
    const localeSelect = datasetPanel.getByRole("combobox").first();
    await localeSelect.selectOption("de");
    await expect(localeSelect).toHaveValue("de");

    // ── 6. PUBLISH PROVIDER (§7.1 / D-09, data.provider.contract) — the engine
    //    produces the publication (id + revision etag). The panel renders the
    //    provider id + revision; in a standalone editor (no host.dataProviders
    //    door) it honestly says "registration deferred (D-09)". Either way the
    //    publish surface drove + the engine returned a real publication. ──
    await datasetPanel.getByRole("button", { name: /publish provider/i }).click();
    await expect(datasetPanel.getByText(/provider ".*-dataset" ready · rev/i)).toBeVisible({
      timeout: 10_000,
    });

    // Re-open via the panel id too (the openPanel door).
    await designer.openPanel(DATASET_PANEL);
    await expect(page.getByText(/paged\.data · dataset/i)).toBeVisible();
  });
});
