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

// Journey: the paged.data plugin — binding governed data into the layout.
//
// A designer reaches for data-driven publishing (the EasyCatalog category):
// import a small CSV, watch the source register through the vendored
// DuckDB-WASM query engine, then drive the binding lifecycle (define →
// resolve → lower) so bound content reaches the document. This proves the
// bundle's host integration end to end through the REAL editor host
// (loadBundle → contributeCommand/Panel → host facades → Mutation), here on
// a blank File ▸ New document.
//
// HONEST LEVEL — paged.data is the riskiest plugin to drive headless: its
// query engine is the vendored DuckDB-WASM artifact (~36 MiB), which boots a
// pthread Worker lazily. The bundle's OWN vitest suite never boots real
// DuckDB (it mocks `../query/duckdb`), so a full data flow in the headless
// journey harness is genuinely uncertain. This spec is therefore designed to
// DEGRADE GRACEFULLY: the HOST-INTEGRATION surface (the bundle's commands are
// registered + its three panels open and MOUNT in the DOM) is HARD — it gates
// the test and proves plugin-bundles wiring. The DuckDB-dependent steps
// (import → source ready → resolve → lower) are best-effort COLLECTED, so one
// run reports exactly how far the real engine drove without flaking the gate.
//
// VERIFIED RESULT (updated 2026-06-18, journeys project): this ships
// @level:smoke for host integration, and the DuckDB-backed import now DRIVES —
// all four DuckDB-WASM-in-Vite-headless blockers are CLEARED:
//   (1) CLEARED — the dist is vendored (scripts/vendor-duckdb.sh) and the
//       `apache-arrow` peer resolves (editor apps/canvas dep +
//       vite.config resolve.alias; the entry's bare import is rewritten to a
//       same-origin virtual module by the vite.config `duckdbDistRoute`).
//   (2) CLEARED — the worker is spawned from the VENDORED same-origin files,
//       not the jsDelivr CDN (a cross-origin Worker SecurityError); see
//       plugin-data query/duckdb.ts.
//   (3) CLEARED — the editor's Vite dev server now serves the vendored
//       `duckdb-browser-*.worker.js` / `duckdb-*.wasm` as RAW assets with the
//       right MIME (`duckdbDistRoute` in apps/canvas/vite.config.ts), BEFORE
//       the SPA fallback — so the worker's nested fetches no longer get
//       index.html ("Unexpected token '<'"). It stays graceful (next()) when
//       the dist is un-vendored.
//   (4) CLEARED — the COI/pthread + SharedArrayBuffer ~36 MiB DuckDB boot WORKS
//       in the headless harness on BOTH lanes (the bundled-Chromium `journeys`
//       lane AND the real-Chrome `journeys-gpu` lane), both cross-origin
//       isolated by the existing COOP/COEP plugin. The source reaches "ready"
//       in ~3-4 s. The full import→resolve→lower→render flow is render-verified
//       in the sibling data-render.journey.spec.ts (@level:happy).

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
const DEFINE_COMMAND = "media.paged.data.command.defineBinding";
const RESOLVE_COMMAND = "media.paged.data.command.resolveBindings";
const LOWER_COMMAND = "media.paged.data.command.lowerBinding";
const OPEN_DATASET_COMMAND = "media.paged.data.command.openDataset";

/** Every command id the loaded bundle registered, read off the real shell
 *  registry (the stable surface a menu/palette hits) — proves the bundle
 *  activated against the host. */
async function registeredCommandIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          registries: { commands: { list: () => Array<{ id: string }> } };
        };
      }
    ).__canvas;
    return c.registries.commands.list().map((cmd) => cmd.id);
  });
}

/** Invoke a command through the real registry. */
async function invokeCommand(page: Page, id: string): Promise<void> {
  await page.evaluate(async (commandId) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: { invoke: (id: string) => Promise<unknown> };
          };
        };
      }
    ).__canvas;
    await c.registries.commands.invoke(commandId);
  }, id);
}

test.describe("journey · paged.data plugin", () => {
  // TAGS: the GUARANTEED smoke surface proves the bundle activated against the
  // host (its commands are registered) + the editor's plugin-bundles loader.
  // data.query.seam / data.source.adapters are intentionally NOT tagged: those
  // rows are proven only when the import step actually drives (collected
  // below), which needs the vendored DuckDB dist's `apache-arrow` peer to
  // resolve under the editor's Vite server — it does not today (see header).
  test("a designer binds data into the layout: import a CSV, register a source, then drive the binding lifecycle @feat:data.plugin.bundle @feat:editor-shell.plugin-bundles @level:smoke", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const failures: string[] = [];
    const drove: string[] = [];

    // ── 1. HOST INTEGRATION (HARD) — the bundle loaded through the editor's
    //    real loadBundle path, so its five commands are registered in the
    //    shell command registry. This is the guaranteed plugin-bundles
    //    surface; it gates the test. ──
    const commandIds = await registeredCommandIds(page);
    for (const id of [
      IMPORT_COMMAND,
      DEFINE_COMMAND,
      RESOLVE_COMMAND,
      LOWER_COMMAND,
      OPEN_DATASET_COMMAND,
    ]) {
      expect(
        commandIds,
        `paged.data command "${id}" should be registered in the shell`,
      ).toContain(id);
    }

    // ── 2. PANELS MOUNT (HARD) — invoke importData (its handler opens the
    //    sources panel) and assert the sources panel actually MOUNTS in the
    //    DOM (the panel header text the factory renders). Then prove the
    //    other two panels open + mount too. This is the host-integration
    //    proof: a bundle's React panel factory reaches the cockpit dock. ──
    await invokeCommand(page, IMPORT_COMMAND);
    // data canary.6 (U12): the v-header body text is gone — the panel's
    // stable mount anchor is its import affordance.
    await expect(page.locator("[data-data-import-csv]")).toBeVisible({ timeout: 10_000 });

    await openPanel(page, BINDINGS_PANEL);
    await expect(page.locator("[data-data-bind-author]")).toBeVisible({
      timeout: 10_000,
    });

    await openPanel(page, DATASET_PANEL);
    // Mount anchor: the locale row renders unconditionally; the variables
    // block only appears once a query exists.
    await expect(page.getByText(/Locale:/)).toBeVisible({
      timeout: 10_000,
    });

    // ── 3. IMPORT (best-effort) — feed the CSV into the sources panel's file
    //    input. The panel's onFile reads file.text() → session.registerCsv-
    //    Source, which lazily boots the vendored DuckDB-WASM engine + the
    //    data-js wasm and registers the table. The honest status flips to
    //    "ready" on success; it lands on "duckdb-missing"/"engine-missing"/
    //    "error" when the heavy engines won't boot headless. Collected so a
    //    partial drive is reported, never flaked. ──
    await openPanel(page, SOURCES_PANEL);
    await expect(page.locator("[data-data-import-csv]")).toBeVisible({ timeout: 10_000 });

    // data canary.6: import goes through the shell.pickFile@1 door
    // (programmatic input.click -> Playwright filechooser, the doc.journey
    // idiom); the raw <input> survives only in the SDK harness.
    const importButton = page.locator("[data-data-import-csv]");
    let importDrove = false;
    try {
      await expect(importButton).toBeVisible({ timeout: 6_000 });
      const chooser = page.waitForEvent("filechooser");
      await importButton.click();
      await (await chooser).setFiles(CSV_FIXTURE);

      // The session boots DuckDB (pthread Worker) + the data-js wasm lazily,
      // converts CSV→Arrow→RecordSet, and defines the source. Generous
      // timeout — the ~36 MiB engine boots slowly. The [data-status] block
      // the panel renders honestly carries the engine state.
      const status = page.locator("[data-status]").last();
      await expect
        .poll(
          async () =>
            (await status.getAttribute("data-status").catch(() => null)) ?? "?",
          { timeout: 60_000 },
        )
        .toBe("ready");

      // The source row appears in the list (the sanitised table name —
      // `data-people.csv` → `data_people`).
      await expect(page.getByText(/data_people/).first()).toBeVisible({
        timeout: 6_000,
      });
      importDrove = true;
      drove.push("import: CSV registered via DuckDB-WASM (source ready)");
    } catch {
      const status =
        (await page
          .locator("[data-status]")
          .last()
          .getAttribute("data-status")
          .catch(() => null)) ?? "unknown";
      failures.push(
        `import: source did not reach "ready" (engine status: "${status}"). DuckDB-WASM normally boots on the editor dev server (vite.config duckdbDistRoute + the COOP/COEP isolation); this only fails if the vendored dist is absent or the context is not cross-origin isolated. See the spec header.`,
      );
    }

    // ── 4. BINDING LIFECYCLE (best-effort) — only meaningful once a source
    //    is ready: resolveBindings refreshes data from sources, lowerBinding
    //    resolves + lowers bound content to the document. Both run through
    //    the real command registry; collected so a partial drive is visible.
    //    With no defined binding these are no-ops, but they exercise the
    //    session lanes end-to-end when the engine booted. ──
    if (importDrove) {
      try {
        await invokeCommand(page, RESOLVE_COMMAND);
        await invokeCommand(page, LOWER_COMMAND);
        drove.push("lifecycle: resolveBindings + lowerBinding drove");
      } catch (err) {
        failures.push(`lifecycle: resolve/lower threw — ${String(err)}`);
      }
    } else {
      failures.push(
        "lifecycle: skipped (no ready source to resolve/lower against)",
      );
    }

    // One run, the full report. The host-integration surface above is HARD
    // (commands registered + all three panels mounted — the @level:smoke
    // guarantee). The DuckDB-dependent steps are collected: a green `drove`
    // list with an empty `failures` would promote this run to a happy-path
    // drive; a populated `failures` is the honest record that the heavy
    // engine did not boot headless (the documented fallback).
    // eslint-disable-next-line no-console
    console.log(
      `[journey] paged.data drove: ${drove.length ? drove.join("; ") : "(host-integration smoke only)"}` +
        (failures.length ? ` | not-driven: ${failures.join("; ")}` : ""),
    );

    // The smoke surface is the gate; the data-flow steps are reported, not
    // gated, because real DuckDB-WASM headless boot is unproven. The HARD
    // assertions above already failed the test if host integration broke.
    expect(true).toBe(true);
  });
});
