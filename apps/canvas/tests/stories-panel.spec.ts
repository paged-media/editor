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
  test("AC-STORIES-1 — real story list renders from paged.stories() @feat:editor-shell.panels.stories @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openStories(page);
    await expect(page.locator('[data-stories-panel="ready"]')).toBeVisible();
    const rows = page.locator("[data-story-list] [data-list-row]");
    await expect(rows).not.toHaveCount(0);
  });

  test("AC-STORIES-2 — clicking a story selects it (caret at head) @feat:editor-shell.panels.stories @level:gesture", async ({
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

  test("AC-STORIES-3 — an overset story shows the overset badge @feat:editor-shell.panels.stories @level:edge", async ({
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

// W2.7 — per-story FIELD INSPECTOR (matrix gaps 9/10). Selecting a row
// opens the inspector; its REAL fields (characters / paragraphs /
// overset) must match the `stories` wire collection exactly, and the
// richer kit fields are honest seams.

/** Read the live `StorySummary` collection straight off the wire. */
async function wireStories(
  page: import("@playwright/test").Page,
): Promise<Array<{ selfId: string; characterCount: number; paragraphCount: number; overset?: boolean }>> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<
              Array<{
                selfId: string;
                characterCount: number;
                paragraphCount: number;
                overset?: boolean;
              }>
            >;
          };
        };
      }
    ).__canvas;
    return c.client.collection("stories");
  });
}

test.describe("W2.7 — Stories field inspector", () => {
  test("AC-STORIES-INSP-1 — inspector counts match the wire StorySummary @feat:editor-shell.panels.stories @level:happy", async ({
    page,
  }) => {
    // text-overset is a real MULTI-STORY fixture (4 stories).
    await openCanvas(page);
    await loadIdml(page, OVERSET_FIXTURE);
    await openStories(page);
    await expect(page.locator('[data-stories-panel="ready"]')).toBeVisible();

    const stories = await wireStories(page);
    expect(stories.length).toBeGreaterThan(1);

    // Click each story row and assert the inspector shows the wire's
    // exact char + paragraph counts for that story.
    const rows = page.locator("[data-story-list] [data-list-row]");
    await expect(rows).toHaveCount(stories.length);

    for (let i = 0; i < stories.length; i++) {
      await rows.nth(i).click();
      const inspector = page.locator(
        `[data-story-inspector="${stories[i].selfId}"]`,
      );
      await expect(inspector).toBeVisible();
      await expect(
        inspector.locator('[data-story-field-value="story-char-count"]'),
      ).toHaveText(String(stories[i].characterCount));
      await expect(
        inspector.locator('[data-story-field-value="story-para-count"]'),
      ).toHaveText(String(stories[i].paragraphCount));
      await expect(
        inspector.locator('[data-story-field-value="story-self-id"]'),
      ).toHaveText(stories[i].selfId);
    }
  });

  test("AC-STORIES-INSP-2 — an overset story's inspector shows Overset", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, OVERSET_FIXTURE);
    await openStories(page);

    const stories = await wireStories(page);
    const oversetIndex = stories.findIndex((s) => s.overset);
    expect(oversetIndex).toBeGreaterThanOrEqual(0);

    const rows = page.locator("[data-story-list] [data-list-row]");
    await rows.nth(oversetIndex).click();
    const inspector = page.locator(
      `[data-story-inspector="${stories[oversetIndex].selfId}"]`,
    );
    await expect(inspector).toBeVisible();
    // REAL overset field reads "yes" + the StatusPill reads "Overset".
    await expect(
      inspector.locator('[data-story-field-value="story-overset"]'),
    ).toHaveText("yes");
    await expect(
      inspector.locator('[data-status-pill="story-overset-status"]'),
    ).toContainText("Overset");
  });

  test("AC-STORIES-INSP-3 — frame-chain / words / preview are honest seams @feat:editor-shell.panels.stories @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, OVERSET_FIXTURE);
    await openStories(page);

    const stories = await wireStories(page);
    const rows = page.locator("[data-story-list] [data-list-row]");
    await rows.first().click();
    const inspector = page.locator(
      `[data-story-inspector="${stories[0].selfId}"]`,
    );
    await expect(inspector).toBeVisible();
    // The three kit fields with no story-keyed wire read are seams, not
    // fabricated values.
    for (const seam of [
      "story-seam-frame-chain",
      "story-seam-words",
      "story-seam-preview",
    ]) {
      await expect(
        inspector.locator(`[data-story-seam="${seam}"]`),
      ).toContainText("awaits wire read");
    }
  });
});
