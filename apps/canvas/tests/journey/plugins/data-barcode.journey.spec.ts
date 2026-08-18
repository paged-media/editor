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

// Journey: paged.data BARCODE / QR SYMBOLOGY (§9.7) through the bindings panel
// — a designer selects a frame, picks a symbology, binds a barcode to it, and
// lowers; the engine clean-room-encodes the symbology and emits native VECTOR
// modules (insertPath filled rects) scaled to the bound frame's content box.
//
// data.barcode.symbology is editor-surface: the bindings panel exposes a
// "Bind barcode →" button + a symbology <select> (EAN-13 / UPC-A / Code-128 /
// QR). Binding requires a SELECTED rectangle (the symbol's frame). This journey
// drives that surface end to end: draw + select a rectangle, choose Code-128
// (a general 1D symbology that encodes arbitrary text), bind the barcode, and
// lower. The engine encodes the modules in Rust and the lower lane reaches the
// per-module insertPath ops.
//
// RESOLVED (was a render-verify finding): the lower's atomic batch (insertPath
// ×N + a setPluginMetadata stamping the binding envelope) was rejected
// ("insertPath batch rejected"). The real cause was NOT the `$created` target —
// it was the ENVELOPE SHAPE: makeEnvelope emitted `{ v, payload }`, but the
// host's setPluginMetadata door VALIDATES `{ v, data, engine? }`, so the
// metadata op failed and sank the whole atomic batch. The fix (data-host-model
// binding.ts) emits `{ v, data }`, so the batch now applies and the VECTOR
// modules paint. Pure bundle-side — works on the published engine. Asserted HARD.

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

test.describe("journey · paged.data barcode symbology", () => {
  test("a designer binds a Code-128 barcode to a frame and the engine encodes the VECTOR modules @feat:data.barcode.symbology @feat:data.plugin.bundle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. IMPORT — the barcode binding queries the imported source. ──
    const ready = await importCsv(page);
    if (!ready) {
      const got =
        (await page.locator("[data-status]").last().getAttribute("data-status").catch(() => null)) ??
        "unknown";
      test.skip(
        true,
        `barcode symbology needs DuckDB-WASM to boot (engine status "${got}"). It boots on the ` +
          "standard editor dev server (Vite duckdbDistRoute + COOP/COEP isolation); this skip only " +
          "fires if the vendored dist is absent or the context is not cross-origin isolated.",
      );
    }
    await expect(page.getByText(/data_people/).first()).toBeVisible({ timeout: 6_000 });

    // ── 2. SELECT A FRAME — the barcode's symbol frame. Draw a rectangle and
    //    select it (the bindings panel's "Bind barcode →" needs a selected
    //    rectangle as the target the symbol fills). ──
    const rect = await designer.drawRectangle({ x0: 150, y0: 150, x1: 360, y1: 290 });
    expect(rect, "drew the barcode frame").not.toBe("");
    await designer.selectElement("rectangle", rect);
    await page.keyboard.press("Home"); // re-fit the camera
    await page.waitForTimeout(300);

    // ── 3. PICK A SYMBOLOGY + BIND — open the bindings panel, choose Code-128
    //    (encodes arbitrary text → modules), then "Bind barcode →" defines the
    //    barcode binding bound to the selected rectangle (the engine will encode
    //    the symbology + scale the module grid to the frame's content box). ──
    await openPanel(page, BINDINGS_PANEL);
    await expect(page.getByText(/paged\.data · bindings/i)).toBeVisible({ timeout: 10_000 });

    // The symbology select is the one whose options name the symbologies.
    const symbology = page
      .locator("select")
      .filter({ has: page.locator('option[value="code128"]') })
      .first();
    await expect(symbology).toBeVisible({ timeout: 6_000 });
    await symbology.selectOption("code128");

    await page.getByRole("button", { name: /bind barcode/i }).click();
    await page.waitForTimeout(300);
    // The binding registered (the panel's bindings list now carries bc_demo).
    await expect(page.getByText(/bindings:.*bc_demo/i).first()).toBeVisible({ timeout: 6_000 });

    // ── 4. LOWER — "Lower to document" resolves the value, the engine encodes
    //    the Code-128 modules, and the lower lane drives the per-module
    //    insertPath ops. The session status reports the barcode resolved +
    //    lowered (the engine encoding ran). ──
    const before = await designer.renderBytes();
    await page.getByRole("button", { name: /lower to document/i }).click();
    await page.waitForTimeout(1200);

    const status = page.locator("[data-status]").last();
    await expect(status).toHaveText(/Resolved \+ lowered barcode|nothing drawn/i, {
      timeout: 8_000,
    });

    // ── 5. RENDER (HARD) — the lower's atomic batch (insertPath ×N +
    //    setPluginMetadata with the `{ v, data }` envelope) now applies, so the
    //    encoded VECTOR modules paint into the page. The render must change. ──
    const after = await designer.renderBytes();
    await designer.expectRenderChanged(before, after);
  });
});
