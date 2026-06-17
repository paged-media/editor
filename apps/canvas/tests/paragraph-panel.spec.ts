// SDK Phase 3 — Paragraph panel acceptance.
//
// Mirrors the Character panel — declarative composition over the
// new ParagraphSpaceBefore / ParagraphSpaceAfter /
// ParagraphFirstLineIndent apply arms. Content-scope bindings.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 3 — Paragraph panel (declarative composition)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.paragraph");
  });

  test("AC-PARA-1 — Paragraph panel mounts and shows section title @feat:editor-shell.panels.paragraph @level:smoke", async ({
    page,
  }) => {
    await expect(page.locator('[data-paragraph-panel="ready"]')).toBeVisible();
    await expect(
      page.locator('[data-paragraph-panel="ready"] [data-section="Paragraph"]'),
    ).toBeVisible();
    // W2.1 (2026-06-06): L/R indents, drop caps, hyphenation and keep
    // options flipped seam→live on protocol v28. The only remaining
    // honest seam is "Align to baseline grid" (no matching
    // PropertyPath on the v28 wire).
    const seams = page.locator('[data-paragraph-panel="ready"] [data-seam]');
    await expect(seams).toHaveCount(1);
    // The Paragraph rules disclosure is now a live bespoke section
    // (whole-struct `Value::ParagraphRule`): two rule rows, each with
    // an on/off pill that clears to null when toggled off.
    await expect(
      page.locator(
        '[data-paragraph-panel="ready"] [data-section="Paragraph rules"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator('[data-paragraph-panel="ready"] [data-rule-row]'),
    ).toHaveCount(2);
  });

  test("AC-PARA-2 — fields render em-dash placeholder when no content selection @feat:editor-shell.panels.paragraph @level:happy", async ({
    page,
  }) => {
    // W2.1: with the layout paths live, the mixed-control count grew
    // past the pre-flip 4 (alignment + L/R/1st indents + space ×2 +
    // drop caps ×2 all render the sentinel). Assert presence rather
    // than a brittle exact count.
    const mixed = page.locator('[data-paragraph-panel="ready"] [data-mixed]');
    await expect(mixed.first()).toBeVisible();
    expect(await mixed.count()).toBeGreaterThanOrEqual(4);
  });

  test("AC-PARA-3 — content selection over a real story populates Paragraph fields @feat:editor-shell.panels.paragraph @level:happy", async ({
    page,
  }) => {
    const seeded = await page.evaluate(async () => {
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
      if (result.error) return null;
      const json = result.output[0] ?? null;
      if (!json) return null;
      const first = JSON.parse(json);
      if (!first || first.characterCount === 0) return null;
      const end = Math.min(3, first.characterCount);
      c.setContentSelection({ storyId: first.selfId, start: 0, end });
      return true;
    });
    expect(seeded).toBe(true);
    // After selection the fields POPULATE from the (homogeneous,
    // single-paragraph) range, so the mixed/em-dash count collapses
    // from the no-selection state (AC-PARA-2: >= 4) down toward the
    // floor. We don't assert exactly 0 — same null-vs-mixed caveat as
    // the Character panel's AC-CHAR-3. Two leaf families read absence
    // differently: a `Value::Length(None)` ("inherit default") renders
    // as 0 in the LengthInput (NOT mixed), but an absent `Value::Bool`
    // on a toggle SWITCH (Hyphenate / Keep lines / Keep with next)
    // legitimately renders `data-mixed` per ToggleSwitchLeaf's
    // documented contract (None ⇒ pill off + sentinel). The fixture
    // paragraph inherits a keep/hyphenation default (None), so one
    // switch stays mixed even though the range is uniform. Assert the
    // populate, not an unreachable zero.
    await expect
      .poll(
        async () =>
          await page
            .locator('[data-paragraph-panel="ready"] [data-mixed]')
            .count(),
      )
      .toBeLessThan(4);
  });
});
