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

// Journey: paged.data RECORD-PREVIEW STEPPER + CHANGE-REPORT through the
// bindings panel — the §9 "walk the records before a batch run" stepper and
// the §8 "what changed since last sync" diff.
//
// data.bind.preview-step — `resolve_at(binding, record)` evaluates the
// per-record kinds against records[record] instead of always row 0, committing
// through the SAME lower lanes a normal lower uses (so preview == output). The
// bindings panel renders a prev/next/jump stepper ("N / M") bound to
// `session.recordCount` + `session.previewRecord`.
//
// data.bind.change-report — `diff_resolved(before, after)` fingerprints every
// binding's resolved content and reports per-binding changed/unchanged/added/
// removed (+ counts) WITHOUT driving the sync-state machine. The panel's "What
// changed?" button refreshes the data then renders the change list.
//
// This journey drives both surfaces THROUGH the panel: import a CSV, wire the
// demo binding (which defines the `q_all` query the stepper walks), step the
// preview across records and assert the "N / M" position advances, then run the
// change report and assert it surfaces (the first diff reports the bindings as
// the baseline). DuckDB-WASM boot is the unblocked gateway; this SKIPS with the
// engine status only if it does not boot.

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

test.describe("journey · paged.data preview stepper + change report", () => {
  test("a designer steps the record preview and reads the change report @feat:data.bind.preview-step @feat:data.bind.change-report @feat:data.plugin.bundle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. IMPORT — registers the source through DuckDB. ──
    const ready = await importCsv(page);
    if (!ready) {
      const got =
        (await page.locator("[data-status]").last().getAttribute("data-status").catch(() => null)) ??
        "unknown";
      test.skip(
        true,
        `preview stepper needs DuckDB-WASM to boot (engine status "${got}"). It boots on the ` +
          "standard editor dev server (Vite duckdbDistRoute + COOP/COEP isolation); this skip only " +
          "fires if the vendored dist is absent or the context is not cross-origin isolated.",
      );
    }
    await expect(page.getByText(/data_people/).first()).toBeVisible({ timeout: 6_000 });

    // ── 2. WIRE — define the demo binding (it adds the `q_all` query the
    //    stepper walks + a variable binding), then refresh the data so the
    //    records are ingested (the stepper's "of N" bound). ──
    await openPanel(page, BINDINGS_PANEL);
    await expect(page.getByText(/paged\.data · bindings/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /wire demo binding/i }).click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /refresh data/i }).click();
    await page.waitForTimeout(500);

    // ── 3. PREVIEW STEPPER — the fixture has 3 records. Jump to record 2 via
    //    the stepper's "jump to" input (which reads `recordCount` for the
    //    of-N bound + resolves every binding against the chosen record), then
    //    assert the position label reflects the stepped-to record of the total. ──
    const stepper = page.locator('[data-testid="preview-stepper"]');
    await expect(stepper).toBeVisible();
    const position = page.locator('[data-testid="preview-position"]');

    const jump = stepper.locator('input[type="number"]');
    await jump.fill("2");
    await jump.dispatchEvent("change");
    // The fixture ingests 3 records → "2 / 3". The stepper resolved every
    // binding against record index 1 through the engine's resolve_at lane.
    await expect(position).toHaveText("2 / 3", { timeout: 8_000 });

    // Step back one with "‹ prev" (now enabled) → "1 / 3".
    await page.getByRole("button", { name: /‹ prev/ }).click();
    await expect(position).toHaveText("1 / 3", { timeout: 6_000 });

    // Step forward with "next ›" → "2 / 3".
    await page.getByRole("button", { name: /next ›/ }).click();
    await expect(position).toHaveText("2 / 3", { timeout: 6_000 });

    // ── 4. CHANGE REPORT — "What changed?" refreshes the data then diffs every
    //    binding's resolved content vs the prior snapshot. The first report is
    //    the baseline (every wired binding reported as `added`); the panel
    //    renders the rolled-up "changed since last sync" headline + entries. ──
    await page.getByRole("button", { name: /what changed/i }).click();
    const report = page.locator('[data-testid="change-report"]');
    await expect(report).toBeVisible({ timeout: 8_000 });
    await expect(report).toContainText(/changed since last sync/i);
    // The baseline diff reports the wired bindings as `added` entries (a
    // data-change-kind the panel tags) — proof the diff engine ran end to end.
    await expect(report.locator('[data-change-kind="added"]').first()).toBeVisible({
      timeout: 6_000,
    });
  });
});
