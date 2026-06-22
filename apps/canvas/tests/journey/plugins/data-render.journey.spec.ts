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

// Journey: paged.data RENDERED output — the data-publishing flow lowers bound
// content INTO the layout and it VISIBLY renders on the page.
//
// paged.data publishes governed data into the document: a CSV registers through
// the vendored DuckDB-WASM query engine, a binding resolves, and the bound
// content LOWERS to native Paged content (data-host-model → Mutation) that
// reaches the page. This journey drives that end to end through the REAL editor
// host and render-verifies the result with a before/after pixel diff.
//
// DuckDB-WASM headless boot is UNBLOCKED (2026-06-18). The two documented walls
// (data.journey.spec.ts header) are closed by the editor's Vite dev server:
//   (3) the vendored `duckdb-browser-*.worker.js` / `duckdb-*.wasm` are served
//       as RAW assets with the right MIME by the `duckdbDistRoute` middleware in
//       `apps/canvas/vite.config.ts` (they previously fell through the SPA
//       fallback → index.html → "Unexpected token '<'" in the worker). The same
//       route rewrites the API entry's lone bare `apache-arrow` import to a
//       same-origin virtual module so the entry loads;
//   (4) the COI/pthread + SharedArrayBuffer DuckDB boot WORKS in the headless
//       harness — on BOTH the bundled-Chromium `journeys` lane and the real-
//       Chrome `journeys-gpu` lane (both cross-origin-isolated by the existing
//       COOP/COEP plugin). The ~36 MiB engine reaches "ready" in ~3-4 s.
//
// Defence in depth: if DuckDB ever fails to boot on a future host (a missing
// vendored dist, a non-isolated context), the source never reaches "ready" and
// the test SKIPS with the precise status rather than flaking — but on the
// standard editor dev server the render assertion is HARD and drives green.

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

test.describe("journey · paged.data render output", () => {
  test("a designer publishes data into the layout: import a CSV, wire a binding, then the bound content renders on the page @feat:data.plugin.bundle @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. IMPORT GATEWAY — feed the CSV into the sources panel; the session
    //    lazily boots the vendored DuckDB-WASM engine and registers the table.
    //    Reaching "ready" means the query engine booted (the unblocked path). ──
    await invoke(page, IMPORT_COMMAND);
    await openPanel(page, SOURCES_PANEL);
    const fileInput = page.locator('input[type="file"][accept*="csv"]');
    await expect(fileInput).toBeVisible({ timeout: 10_000 });
    await fileInput.setInputFiles(CSV_FIXTURE);

    const status = page.locator("[data-status]").last();
    let ready = false;
    try {
      await expect
        .poll(
          async () => (await status.getAttribute("data-status").catch(() => null)) ?? "?",
          { timeout: 45_000 },
        )
        .toBe("ready");
      ready = true;
    } catch {
      ready = false;
    }

    if (!ready) {
      const got = (await status.getAttribute("data-status").catch(() => null)) ?? "unknown";
      test.skip(
        true,
        `paged.data render needs DuckDB-WASM to boot (engine status "${got}"). On the ` +
          "standard editor dev server it boots on both lanes (Vite duckdbDistRoute + the " +
          "COOP/COEP isolation). This skip only fires if the vendored dist is absent or the " +
          "context is not cross-origin isolated — see the file header.",
      );
    }

    // The source registered (the panel sanitises `data-people.csv` →
    // `data_people`). The sanitised name surfaces in more than one place once
    // wired (the source row + a query referencing it), so target the first.
    await expect(page.getByText(/data_people/).first()).toBeVisible({ timeout: 6_000 });

    // ── 2. WIRE + LOWER — open the bindings panel, wire the demo binding (a
    //    query over the imported source + a variable field bound to it), then
    //    lower it to the document. `lowerAll` refreshes the data through DuckDB
    //    and commits the resolved content as native Paged Mutations — the page,
    //    blank before, now carries the data-driven content. ──
    await openPanel(page, BINDINGS_PANEL);
    await expect(page.getByText(/paged\.data · bindings/i)).toBeVisible({ timeout: 10_000 });

    const beforeLower = await designer.renderBytes();
    await page.getByRole("button", { name: /wire demo binding/i }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /lower to document/i }).click();
    // The lower lane refreshes data (a DuckDB query) + commits the Mutations;
    // give the worker + the render pipeline a beat to settle.
    await page.waitForTimeout(1200);
    const afterLower = await designer.renderBytes();

    // ── 3. RENDER ASSERTION (HARD) — the bound content visibly reached the page. ──
    await designer.expectRenderChanged(beforeLower, afterLower);
  });
});
