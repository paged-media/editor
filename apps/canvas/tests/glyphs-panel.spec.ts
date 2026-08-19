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

// Panel-gallery pass — the Glyphs panel's LIVE half: with an
// active text caret, clicking a glyph inserts the character via
// the real `insertText` mutation (story character count grows;
// the recently-used grid appears). Without a caret the grid is
// inert (covered by concept-panels.spec.ts).

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

interface StoryInfo {
  selfId: string;
  characterCount: number;
}

async function storyCount(page: Page, storyId: string): Promise<number> {
  return page.evaluate(async (id) => {
    const dbg = (
      window as unknown as {
        __canvas: {
          client: {
            executeScript(src: string): Promise<{ output: string[] }>;
          };
        };
      }
    ).__canvas;
    const stories = (await dbg.client
      .executeScript("paged.stories()")
      .then((r) => JSON.parse(r.output[0] ?? "[]"))) as Array<{
      selfId: string;
      characterCount: number;
    }>;
    return stories.find((s) => s.selfId === id)?.characterCount ?? -1;
  }, storyId);
}

test("AC-GLYPHS-1 — caret + glyph click inserts via insertText @feat:editor-shell.panels.glyphs @level:gesture", async ({
  page,
}) => {
  await openCanvas(page);
  await loadIdml(page, FIXTURE);

  // Install a caret on the first story through the debug hook —
  // the same path the canvas text tool uses.
  const story = await page.evaluate(async () => {
    const dbg = (
      window as unknown as {
        __canvas: {
          client: {
            executeScript(src: string): Promise<{ output: string[] }>;
          };
          setContentSelection?: (
            sel: { storyId: string; start: number; end: number } | null,
          ) => void;
        };
      }
    ).__canvas;
    const stories = (await dbg.client
      .executeScript("paged.stories()")
      .then((r) => JSON.parse(r.output[0] ?? "[]"))) as Array<{
      selfId: string;
      characterCount: number;
    }>;
    if (!stories.length) throw new Error("fixture has no stories");
    const s = stories[0];
    dbg.setContentSelection?.({ storyId: s.selfId, start: 0, end: 0 });
    return s as { selfId: string; characterCount: number };
  });

  await openPanel(page, "paged.glyphs");
  const root = page.locator('[data-glyphs-panel="ready"]');
  await expect(root.locator('[data-glyph-grid="all"]')).toHaveAttribute(
    "data-caret",
    "true",
  );

  const before = (story as StoryInfo).characterCount;
  await root.locator('[data-glyph="©"]').click();
  // insertText lands → the story grows by one character.
  await expect
    .poll(() => storyCount(page, (story as StoryInfo).selfId))
    .toBe(before + 1);
  // The recently-used grid appears with the inserted glyph.
  await expect(
    root.locator('[data-glyph-grid="recent"] [data-glyph="©"]'),
  ).toBeVisible();
});

test("AC-GLYPHS-2 — Font select is fed real families from the fonts collection @feat:editor-shell.panels.glyphs @level:happy", async ({
  page,
}) => {
  await openCanvas(page);
  await loadIdml(page, FIXTURE);
  await openPanel(page, "paged.glyphs");
  const root = page.locator('[data-glyphs-panel="ready"]');
  // W2.12 — the family select is a real (enabled) KitSelect listing the
  // document's fonts-in-use (the fixture references Open Sans).
  const select = root.locator("[data-glyphs-font]");
  await expect(select).toBeEnabled();
  await expect(select.locator("option")).not.toHaveCount(0);
  await expect(select.locator("option", { hasText: "Open Sans" })).toHaveCount(
    1,
  );
});
