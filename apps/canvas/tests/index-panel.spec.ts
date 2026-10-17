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
// Index panel ▸ Generate index (core ADR 168, protocol 72): the engine
// writes the document's index into a story, replacing its text, as
// InDesign's Replace Existing Index does. The target is the story with
// the text cursor; without one the button stays disabled and says so.

import { expect, test, type Page } from "@playwright/test";

import { loadIdml, openCanvas, openPanel } from "./fidelity/canvas-driver";
import { generatedFixture } from "./e2e/harness/fixtures";

/** The first story's id and size, read through `paged.stories()`. */
async function firstStory(
  page: Page,
): Promise<{ selfId: string; characterCount: number; paragraphCount: number }> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (s: string) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript(`JSON.stringify(JSON.parse(paged.stories())[0])`);
    if (r.error) throw new Error(r.error);
    return JSON.parse(r.output[0]);
  });
}

async function placeCaret(page: Page, storyId: string): Promise<void> {
  await page.evaluate((id) => {
    (
      globalThis as unknown as {
        __canvas: {
          setContentSelection: (sel: { storyId: string; start: number; end: number }) => void;
        };
      }
    ).__canvas.setContentSelection({ storyId: id, start: 0, end: 0 });
  }, storyId);
}

test.describe("Index panel — Generate index", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, generatedFixture("text"));
    await openPanel(page, "paged.index");
  });

  test("AC-INDEX-GEN-1 — without a text cursor the button is disabled and says why @feat:cross-references-hyperlinks.index @level:smoke", async ({
    page,
  }) => {
    const button = page.locator("[data-generate-index]");
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", /Place the text cursor/);
  });

  test("AC-INDEX-GEN-2 — with the cursor in a story, Generate writes the index there @feat:cross-references-hyperlinks.index @level:edge", async ({
    page,
  }) => {
    const story = await firstStory(page);
    await placeCaret(page, story.selfId);
    const button = page.locator("[data-generate-index]");
    await expect(button).toBeEnabled();
    await button.click();
    // The story's text is now the index. The fixture has no topics, so it
    // is the title alone: the engine's default "Index" (the document
    // carries no IndexOptions), one paragraph of five characters.
    await expect
      .poll(async () => {
        const s = await firstStory(page);
        return [s.paragraphCount, s.characterCount];
      }, { timeout: 15_000 })
      .toEqual([1, 5]);
    await expect(page.locator("[data-generate-index-error]")).toHaveCount(0);
  });
});
