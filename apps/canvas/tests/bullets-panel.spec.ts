// W2.4 (2026-06-06) — Bullets & Numbering panel acceptance. List
// type + bullet glyph + numbering format flipped seam→live on
// protocol v28's list-authoring text paths
// (`paragraphListType` / `paragraphBulletCharacter` /
// `paragraphNumberingFormat`, all `Value::Text`). The list-definition
// rows (List / Level / Restart / Position) stay honest seams, so the
// panel keeps its Partial badge (the Glyphs precedent). The op-level
// round-trip is e2e/bullets-ops.spec.ts; this proves the live
// controls render and the list-type segment commits.

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

test.describe("W2.4 — Bullets & Numbering panel (partial-live)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.bullets-numbering");
  });

  test("AC-BN-1 — panel mounts with the Partial badge and live controls", async ({
    page,
  }) => {
    const root = page.locator('[data-bullets-panel="ready"]');
    await expect(root).toBeVisible();
    await expect(root.locator('[data-panel-status="partial"]')).toBeVisible();
    // The live list-type toggle (paragraphListType) carries the IDML
    // enum option values; the bullet glyph + numbering format are
    // bound text fields.
    await expect(root.locator("[data-toggle-group]")).toBeVisible();
    await expect(
      root.locator('[data-bullets-field="bullet-character"]'),
    ).toBeVisible();
    await expect(
      root.locator('[data-bullets-field="numbering-format"]'),
    ).toBeVisible();
  });

  test("AC-BN-2 — without a caret the bound controls are inert", async ({
    page,
  }) => {
    const root = page.locator('[data-bullets-panel="ready"]');
    // The text fields disable when there's no content selection (no
    // commit target); the list-type toggle renders its mixed state.
    await expect(
      root.locator('[data-bullets-field="bullet-character"]'),
    ).toBeDisabled();
    await expect(
      root.locator('[data-bullets-field="numbering-format"]'),
    ).toBeDisabled();
  });

  test("AC-BN-3 — with a caret the list-type segment commits", async ({
    page,
  }) => {
    const seeded = await seedCaret(page);
    expect(seeded).toBe(true);
    const root = page.locator('[data-bullets-panel="ready"]');
    // The Bullet segment writes `paragraphListType = "BulletList"`.
    const bulletSeg = root.locator(
      '[data-toggle-group] [data-option-value="BulletList"]',
    );
    await expect(bulletSeg).toBeEnabled();
    await bulletSeg.click();
    // The binding re-reads the model after the commit and lights the
    // active segment.
    await expect(bulletSeg).toHaveAttribute("data-active", "true");
    // The bound text fields are now editable.
    await expect(
      root.locator('[data-bullets-field="bullet-character"]'),
    ).toBeEnabled();
  });
});
