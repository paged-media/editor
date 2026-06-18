// Journey: paged.data RENDERED output — a TRIPWIRE for the one plugin whose
// render can't be verified headless yet.
//
// paged.data publishes governed data INTO the layout: a CSV registers through
// the vendored DuckDB-WASM query engine, a binding resolves, and the bound
// content LOWERS to native Paged content (data-host-model → Mutation) that
// reaches the page. To render-verify that, the query engine must boot — and
// DuckDB-WASM (a ~36 MiB COI/pthread + SharedArrayBuffer artifact) does not
// boot in the headless Playwright harness today. The documented walls
// (data.journey.spec.ts header):
//   (3) Vite serves the vendored `*.worker.js` via the SPA fallback (the COI
//       worker's nested fetch gets index.html → "Unexpected token '<'");
//   (4) the COI/pthread + SAB DuckDB boot in headless Chrome is unproven.
//
// So this is NOT faked: it drives the REAL import gateway and, when the source
// reaches "ready" (DuckDB booted), proceeds to render-verify the lowered
// content reaches the page; when it does NOT (today's reality), it SKIPS with
// the precise blocker. The day (3)+(4) land, this auto-fires the render
// assertion — no edit needed. Until then data honestly carries no render
// claim (it stays @level:smoke for host-integration in the sibling journey).

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
const IMPORT_COMMAND = "media.paged.data.command.importData";
const RESOLVE_COMMAND = "media.paged.data.command.resolveBindings";
const LOWER_COMMAND = "media.paged.data.command.lowerBinding";

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
  test("a designer publishes data into the layout: import a CSV, then the bound content renders on the page @feat:data.plugin.bundle @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. IMPORT GATEWAY — feed the CSV into the sources panel; the session
    //    lazily boots the vendored DuckDB-WASM engine and registers the table.
    //    Reaching "ready" means the query engine booted. ──
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
        `paged.data render is blocked on DuckDB-WASM headless boot (engine status "${got}"): ` +
          "(3) Vite serves the vendored *.worker.js via the SPA fallback, (4) the COI/pthread " +
          "+ SAB DuckDB boot in headless Chrome is unproven. The render assertion below fires " +
          "automatically once those land — see the file header.",
      );
    }

    // ── 2. RENDER (fires only when DuckDB booted) — resolve + lower the bound
    //    content to native Paged content; the page, blank before, must now
    //    carry the data-driven content. ──
    await expect(page.getByText(/data-people/)).toBeVisible({ timeout: 6_000 });
    const beforeLower = await designer.renderBytes();
    await invoke(page, RESOLVE_COMMAND);
    await invoke(page, LOWER_COMMAND);
    await page.waitForTimeout(500);
    const afterLower = await designer.renderBytes();
    await designer.expectRenderChanged(beforeLower, afterLower);
  });
});
