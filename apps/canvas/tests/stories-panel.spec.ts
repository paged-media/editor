// W2.12 — Stories panel acceptance. The panel reads the live story
// list off the `stories` collection (StorySummary) and renders one row
// per story with its character + paragraph counts. Clicking a row sets a
// content selection at the story head. Aftercare-D: the overset badge is
// now covered by the `text-overset` fixture, whose body stories overflow
// their frames (StorySummary.overset = true).

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;
const OVERSET_FIXTURE = `${REPO_ROOT}/corpus/generated/text-overset.idml`;

// The Stories panel mounts in Content mode (cockpit panelSet) — drive
// the mode through the dev hook, the same path cockpit-panels.spec
// uses for the other mode-scoped panels.
async function openStories(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    (
      globalThis as unknown as { __canvas: { setMode: (m: string) => void } }
    ).__canvas.setMode("content");
  });
}

test.describe("W2.12 — Stories panel", () => {
  test("AC-STORIES-1 — real story list renders from paged.stories()", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openStories(page);
    await expect(page.locator('[data-stories-panel="ready"]')).toBeVisible();
    const rows = page.locator("[data-story-list] [data-list-row]");
    await expect(rows).not.toHaveCount(0);
  });

  test("AC-STORIES-2 — clicking a story selects it (caret at head)", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openStories(page);
    const first = page.locator("[data-story-list] [data-list-row]").first();
    await first.click();
    await expect(first).toHaveAttribute("data-selected", "true");
    // The content selection landed in the React mirror the dev hook
    // re-publishes each render.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              globalThis as unknown as {
                __canvas: { contentSelection: { storyId: string } | null };
              }
            ).__canvas.contentSelection?.storyId ?? null,
        ),
      )
      .not.toBeNull();
  });

  test("AC-STORIES-3 — an overset story shows the overset badge", async ({
    page,
  }) => {
    // Aftercare-D: `text-overset` ships body stories that overflow their
    // frames (page 1 short-frame, page 2 threaded chain), so
    // StorySummary.overset is true for them — exercises the per-row
    // [data-row-badge="overset"] + the [data-stories-overset-summary]
    // header count.
    await openCanvas(page);
    await loadIdml(page, OVERSET_FIXTURE);
    await openStories(page);
    await expect(page.locator('[data-stories-panel="ready"]')).toBeVisible();
    await expect(
      page.locator('[data-row-badge="overset"]').first(),
    ).toBeVisible();
    await expect(
      page.locator("[data-stories-overset-summary]"),
    ).toBeVisible();
  });
});
