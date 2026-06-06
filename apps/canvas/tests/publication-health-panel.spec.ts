// W2.12 — Publication health acceptance. The risk rows are now real
// counts off the W0.6 wire summaries (overset stories, missing links,
// low-res images, missing fonts) + the last export's preflight
// findings. The generated fixtures are clean, so the risks read 0
// (with the OK check) rather than the old em-dash seam — that's the
// load-bearing assertion: the counts are LIVE, not placeholders.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/text.idml`;

async function loadFixtureReact(page: Page) {
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
            .ready,
      ),
    )
    .toBe(true);
  // Publication health is a Design-mode panelSet panel (the kit's left
  // footer; here a standalone DOCKABLE panel — Design's fixed left slot
  // is the Document Map). panelSet membership makes it openable, not
  // auto-mounted, so open it explicitly into the dock the way the panel
  // rail / Window menu would.
  await page.evaluate(() => {
    (
      globalThis as unknown as { __canvas: { setMode: (m: string) => void } }
    ).__canvas.setMode("design");
  });
  await openPanel(page, "paged.publication-health");
}

test.describe("W2.12 — Publication health", () => {
  test("AC-HEALTH-1 — risk rows show live counts, not em-dash seams", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixtureReact(page);
    const panel = page.locator("[data-publication-health]");
    await expect(panel).toBeVisible();

    // Risks backed by an ALWAYS-AVAILABLE collection (links →
    // missing-links + low-res) carry a real numeric count, no
    // `data-seam`. That's the load-bearing claim: these are LIVE, not
    // placeholders. `missing-links` is 0 on a clean fixture; `low-res`
    // reads whatever the link summaries' effective ppi yields.
    const missingLinks = panel.locator('[data-risk-row="missing-links"]');
    const lowRes = panel.locator('[data-risk-row="low-res"]');
    const fonts = panel.locator('[data-risk-row="fonts"]');

    await expect(missingLinks).toHaveAttribute("data-risk-count", "0");
    await expect(missingLinks).not.toHaveAttribute("data-seam", /.*/);
    // Live (numeric), value runner-dependent.
    await expect(lowRes).toHaveAttribute("data-risk-count", /^\d+$/);
    await expect(lowRes).not.toHaveAttribute("data-seam", /.*/);
    // Missing fonts is live off the `fonts` collection. The count is
    // runner-dependent (loadDocument registers only a fallback face, so
    // a referenced family like Open Sans reads substituted/missing in
    // the headless harness) — assert LIVE, not a fixed 0.
    await expect(fonts).toHaveAttribute("data-risk-count", /^\d+$/);
    await expect(fonts).not.toHaveAttribute("data-seam", /.*/);

    // KNOWN GAP — `overset` stays a seam: `DocumentStats.overset_stories`
    // is the unwired overset read-surface (the same gap behind
    // gesture-threading TH-04 and the overset badge fixme). When that
    // lands the row flips to a live count; until then it's honestly
    // em-dashed, NOT asserted as 0.
    await expect(panel.locator('[data-risk-row="overset"]')).toHaveAttribute(
      "data-seam",
      /.*/,
    );
  });

  test("AC-HEALTH-2 — preflight risk row is a seam until an export runs", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixtureReact(page);
    const panel = page.locator("[data-publication-health]");
    await expect(panel).toBeVisible();
    // No export has run yet → preflight findings have no count.
    await expect(panel.locator('[data-risk-row="preflight"]')).toHaveAttribute(
      "data-seam",
      /.*/,
    );
  });
});
