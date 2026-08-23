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
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/text.idml`;
const NUMBERING_FIXTURE = `${REPO_ROOT}/corpus/idml/generated/numbering.idml`;

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

  test("AC-BN-1 — panel mounts with the Partial badge and live controls @feat:editor-shell.panels.bullets-numbering @level:smoke", async ({
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

  test("AC-BN-2 — without a caret the bound controls are inert @feat:editor-shell.panels.bullets-numbering @level:gesture", async ({
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

  test("AC-BN-3 — with a caret the list-type segment commits @feat:editor-shell.panels.bullets-numbering @level:gesture", async ({
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

test.describe("W2.10 — Bullets & Numbering list definitions (live CRUD)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, NUMBERING_FIXTURE);
    await openPanel(page, "paged.bullets-numbering");
  });

  test("AC-BN-LD-1 — the list-definitions manager renders the document's named lists", async ({
    page,
  }) => {
    const defs = page.locator('[data-list-definitions="ready"]');
    await expect(defs).toBeVisible();
    // The numbering fixture ships one named list (`Shared`).
    const rows = defs.locator("[data-list-def]");
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator("[data-list-def-name]")).toHaveText(
      "Shared",
    );
    // Continuity toggle reflects the fixture's
    // ContinueNumbersAcrossStories=true.
    await expect(
      rows.first().locator("[data-list-def-continuity]"),
    ).toHaveAttribute("aria-checked", "true");
    // The applied-list read-back honest seam is present.
    await expect(defs.locator("[data-applied-readback-seam]")).toBeVisible();
  });

  test("AC-BN-LD-2 — New list creates a definition; the list grows @feat:editor-shell.panels.bullets-numbering @level:happy", async ({
    page,
  }) => {
    const defs = page.locator('[data-list-definitions="ready"]');
    await expect(defs.locator("[data-list-def]")).toHaveCount(1);
    await defs.locator('[data-toolbar-btn="new-numbering-list"]').click();
    await expect(defs.locator("[data-list-def]")).toHaveCount(2);
    await expect(
      defs.locator('[data-list-def] [data-list-def-name]', {
        hasText: "New list",
      }),
    ).toBeVisible();
  });

  test("AC-BN-LD-3 — continuity toggle flips and re-reads from the model @feat:editor-shell.panels.bullets-numbering @level:happy", async ({
    page,
  }) => {
    const row = page.locator('[data-list-definitions="ready"] [data-list-def]').first();
    const toggle = row.locator("[data-list-def-continuity]");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    // The collection re-fetches after the editNumberingList mutation;
    // the toggle reflects the new model value.
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("AC-BN-LD-4 — delete removes a created list @feat:editor-shell.panels.bullets-numbering @level:happy", async ({ page }) => {
    const defs = page.locator('[data-list-definitions="ready"]');
    await defs.locator('[data-toolbar-btn="new-numbering-list"]').click();
    await expect(defs.locator("[data-list-def]")).toHaveCount(2);
    // Delete the newly created one (second row).
    await defs
      .locator("[data-list-def]")
      .nth(1)
      .locator("[data-list-def-delete]")
      .click();
    await expect(defs.locator("[data-list-def]")).toHaveCount(1);
  });

  test("AC-BN-LD-5 — Assign is inert without a caret, active with one @feat:editor-shell.panels.bullets-numbering @level:gesture", async ({
    page,
  }) => {
    const row = page.locator('[data-list-definitions="ready"] [data-list-def]').first();
    // No content selection yet → assign disabled.
    await expect(row.locator("[data-list-def-assign]")).toBeDisabled();
    // Seed a caret in the first story.
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
      if (result.error) return false;
      const first = JSON.parse(result.output[0] ?? "null");
      if (!first || first.characterCount === 0) return false;
      c.setContentSelection({
        storyId: first.selfId,
        start: 0,
        end: Math.min(3, first.characterCount),
      });
      return true;
    });
    expect(seeded).toBe(true);
    await expect(row.locator("[data-list-def-assign]")).toBeEnabled();
  });
});
