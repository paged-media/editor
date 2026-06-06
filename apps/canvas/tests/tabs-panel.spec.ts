// W2.4 (2026-06-06) — Tabs panel acceptance. The stop editor went
// fully LIVE on protocol v28's whole-list `paragraphTabStops` path
// (`Value::TabStops(TabStopSpec[])`). With a content selection the
// editor reads the paragraph's stops, edits them in local state, and
// commits the FULL list per change (one `setElementProperty` mutate).
// The op-level round-trip is e2e/tabs-ops.spec.ts; this proves the
// panel mounts live and the add/remove controls drive real commits.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/text.idml`;

async function seedCaret(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (s: string) => Promise<{
              output: string[];
              error: string | null;
            }>;
          };
          setContentSelection: (
            sel: { storyId: string; start: number; end: number } | null,
          ) => void;
        };
      }
    ).__canvas;
    const result = await c.client.executeScript(
      `JSON.stringify(JSON.parse(paged.stories())[0] || null)`,
    );
    if (result.error) return false;
    const json = result.output[0] ?? null;
    if (!json) return false;
    const first = JSON.parse(json);
    if (!first || first.characterCount === 0) return false;
    const end = Math.min(3, first.characterCount);
    c.setContentSelection({ storyId: first.selfId, start: 0, end });
    return true;
  });
}

test.describe("W2.4 — Tabs panel (live whole-list editor)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.tabs");
  });

  test("AC-TABS-1 — panel mounts live (no concept badge, ruler present)", async ({
    page,
  }) => {
    const root = page.locator('[data-tabs-panel="ready"]');
    await expect(root).toBeVisible();
    // Fully live now — no Concept/Partial badge, no Target footnote.
    await expect(root.locator("[data-panel-status]")).toHaveCount(0);
    await expect(root.locator("[data-tabs-ruler]")).toBeVisible();
  });

  test("AC-TABS-2 — without a caret the editor is inert (commit disabled)", async ({
    page,
  }) => {
    const root = page.locator('[data-tabs-panel="ready"]');
    // No content selection → the add button is disabled and the
    // empty hint steers the user to place a caret.
    await expect(root.locator("[data-tab-add]")).toBeDisabled();
    await expect(root.locator("[data-tabs-empty]")).toBeVisible();
  });

  test("AC-TABS-3 — add then remove a stop drives real commits", async ({
    page,
  }) => {
    const seeded = await seedCaret(page);
    expect(seeded).toBe(true);
    const root = page.locator('[data-tabs-panel="ready"]');
    const add = root.locator("[data-tab-add]");
    await expect(add).toBeEnabled();
    // Add one stop — the whole-list commit round-trips through the
    // worker and the editor re-seeds, rendering one stop row.
    await add.click();
    await expect(root.locator("[data-tab-stop]")).toHaveCount(1);
    // The alignment select carries the live IDML enum option values.
    await expect(
      root.locator('[data-tab-alignment="0"] option[value="CharacterAlign"]'),
    ).toHaveCount(1);
    // Remove it — back to the empty list.
    await root.locator('[data-tab-remove="0"]').click();
    await expect(root.locator("[data-tab-stop]")).toHaveCount(0);
  });
});
