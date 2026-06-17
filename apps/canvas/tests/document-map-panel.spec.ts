// W2.12 — Document Map acceptance. The spread tree + page-snapshot
// thumbnails are covered by the cockpit smoke; this spec exercises the
// W2.12 additions: the live page-meta readout and the real
// "Add section" insertSection op-sandwich (insert → chip appears →
// undo → chip gone).
//
// Loads through the REACT file-input path (not loadIdml's direct
// client call) so `useDocument().handle` is populated — the panel and
// the Add-section button both read it.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;
// W2.7 per-page chip fixtures: links-broken ships rectangles whose
// placed images resolve to the grey missing-image placeholder (status
// "missing"); text-overset ships body stories that overflow their frames.
const LINKS_BROKEN_FIXTURE = `${REPO_ROOT}/corpus/generated/links-broken.idml`;
const OVERSET_FIXTURE = `${REPO_ROOT}/corpus/generated/text-overset.idml`;

async function loadFixtureReact(page: Page, fixture: string = FIXTURE) {
  await page.setInputFiles('input[type="file"]', fixture);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
            .ready,
      ),
    )
    .toBe(true);
  // Design mode mounts the Document Map in the left dock.
  await page.evaluate(() => {
    (
      globalThis as unknown as { __canvas: { setMode: (m: string) => void } }
    ).__canvas.setMode("design");
  });
}

async function undo(page: Page) {
  await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas;
    await c.client.undo();
  });
}

test.describe("W2.12 — Document Map", () => {
  test("AC-DOCMAP-1 — the spread tree + page-meta render @feat:editor-shell.panels.document-map @level:happy", async ({ page }) => {
    await openCanvas(page);
    await loadFixtureReact(page);
    const panel = page.locator("[data-document-map-panel]");
    await expect(panel).toBeVisible();
    // At least one spread row, each carrying its range/meta line.
    await expect(
      panel.locator("[data-document-map-spread]").first(),
    ).toBeVisible();
    await expect(panel.locator("[data-spread-meta]").first()).toBeVisible();
  });

  test("AC-DOCMAP-2 — Add section inserts a section chip; undo removes it @feat:editor-shell.panels.document-map @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixtureReact(page);
    const panel = page.locator("[data-document-map-panel]");
    await expect(panel).toBeVisible();

    // The fixture ships no <Section> → no chips initially.
    await expect(panel.locator("[data-section-chip]")).toHaveCount(0);

    // Real insertSection mutation (v28) via the Add-section button.
    await panel.locator("[data-add-section]").click();

    // The sections collection refetches on mutationApplied → a chip
    // appears.
    await expect(panel.locator("[data-section-chip]")).not.toHaveCount(0);

    // Undo → the section is removed and the chip disappears.
    await undo(page);
    await expect(panel.locator("[data-section-chip]")).toHaveCount(0);
  });
});

// W2.7 — per-page STATUS CHIPS (matrix gaps 2–4). The missing-links
// chip is REAL per-page (host frame → elementGeometry → page); overset /
// missing-fonts are honest doc-level seam chips where the wire can't
// attribute per page.

/** Read the live `links` collection straight off the wire. */
async function wireMissingLinks(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (
              n: string,
            ) => Promise<Array<{ status?: string }>>;
          };
        };
      }
    ).__canvas;
    const links = await c.client.collection("links");
    return links.filter((l) => l.status === "missing").length;
  });
}

test.describe("W2.7 — Document Map per-page chips", () => {
  test("AC-DOCMAP-CHIP-1 — broken-links fixture shows a real missing-links chip; click navigates @feat:editor-shell.panels.document-map @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixtureReact(page, LINKS_BROKEN_FIXTURE);
    const panel = page.locator("[data-document-map-panel]");
    await expect(panel).toBeVisible();

    // The fixture genuinely carries missing links on the wire.
    const missing = await wireMissingLinks(page);
    expect(missing).toBeGreaterThan(0);

    // links-broken is a single page → page 1's row carries the chip.
    const chip = panel.locator('[data-page-chip="missing-links"]').first();
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("missing link");

    // Click the chip → the spread row it belongs to becomes selected
    // (camera jumped to the page). The chip stops propagation, so the
    // selection comes from the chip's own jump.
    const spreadKey = await chip.getAttribute("data-page-chip-spread");
    await chip.click();
    await expect(
      panel.locator(`[data-document-map-spread="${spreadKey}"]`),
    ).toHaveAttribute("data-selected", "true");
  });

  test("AC-DOCMAP-CHIP-2 — overset fixture shows an honest doc-level seam chip, not a per-page claim @feat:editor-shell.panels.document-map @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixtureReact(page, OVERSET_FIXTURE);
    const panel = page.locator("[data-document-map-panel]");
    await expect(panel).toBeVisible();

    // The seam chip is dashed + doc-level (it carries the missing-read
    // note in its title), and it must NOT masquerade as a real link
    // chip — overset can't be attributed per page over the wire.
    const seam = panel.locator('[data-page-chip="overset-seam"]');
    await expect(seam).toHaveCount(1);
    await expect(seam).toContainText("doc-level");
    await expect(seam).toHaveAttribute(
      "title",
      /can't be attributed to a page/,
    );
  });

  test("AC-DOCMAP-CHIP-3 — no missing LINKS ⇒ no real missing-links chip (only honest seams remain) @feat:editor-shell.panels.document-map @level:edge", async ({
    page,
  }) => {
    // geometry-groups carries NO missing links on the wire, so the REAL
    // per-page missing-links chip must be absent. (Its fonts resolve via
    // a fallback in the headless test env, so the honest doc-level
    // fonts-seam may still appear — that's correct reporting, not a
    // per-page claim; the assertion below is scoped to the real chip.)
    await openCanvas(page);
    await loadFixtureReact(page, FIXTURE);
    const panel = page.locator("[data-document-map-panel]");
    await expect(panel).toBeVisible();
    await expect(
      panel.locator("[data-document-map-spread]").first(),
    ).toBeVisible();

    const missing = await wireMissingLinks(page);
    expect(missing).toBe(0);
    await expect(
      panel.locator('[data-page-chip="missing-links"]'),
    ).toHaveCount(0);
  });
});
