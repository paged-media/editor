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

// Journey: edit a web frame's text ON THE CANVAS.
//
//   1. double-click the web frame (enters its edit context), click on the
//      rendered text — the caret appears (the bundle's tool-preview line);
//   2. type: the frame re-renders live with the typed text while the
//      document is untouched; Enter commits — the source's text node
//      changed (and only by what was typed) and the canvas shows it;
//   3. that commit is ONE document undo step;
//   4. the Esc path: click, type, Esc — the canvas shows the source as it
//      was and the document never changed.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";
import {
  insertWebFrameWith,
  sceneText,
  screenPointInFrame,
  select,
  tapSceneLayers,
  undo,
  webSource,
  type ElementRef,
} from "./web-kit";

const HTML = "<p>Hello world</p>";
const CSS = "p { margin: 0; font: 32px/40px Inter, sans-serif; color: #101820; }";
const BREADCRUMB = "[data-edit-context-breadcrumb]";
/** The caret the session draws: a tool-preview polyline. */
const CARET = 'svg polyline[stroke="var(--overlay-snap)"]';

/** Enter the frame's edit context and click into the first word. */
async function clickIntoText(page: Page, frame: ElementRef): Promise<void> {
  if ((await page.locator(BREADCRUMB).count()) === 0) {
    await select(page, [frame]);
    const centre = await screenPointInFrame(page, frame, 120, 90);
    await page.mouse.dblclick(centre.x, centre.y);
    await expect(page.locator(BREADCRUMB)).toBeVisible({ timeout: 10_000 });
  }
  // Entering raises the context's panel and the canvas relayouts; aim
  // once the frame's screen position has settled.
  let at = await screenPointInFrame(page, frame, 40, 15);
  await expect
    .poll(async () => {
      const next = await screenPointInFrame(page, frame, 40, 15);
      const still = Math.abs(next.x - at.x) < 0.5 && Math.abs(next.y - at.y) < 0.5;
      at = next;
      return still;
    })
    .toBe(true);
  await page.mouse.click(at.x, at.y);
  // A vertical line has no width, so Playwright calls it hidden — count it.
  await expect
    .poll(() => page.locator(CARET).count(), { timeout: 10_000, message: "the caret is drawn" })
    .toBeGreaterThan(0);
}

/** The paragraph's text in the document's source. */
async function sourceText(page: Page, frame: ElementRef): Promise<string> {
  const html = (await webSource(page, frame))?.html ?? "";
  return html.replace(/<[^>]*>/g, "");
}

test.describe("journey · paged.web in-frame text editing", () => {
  test("click into a web frame's text, type, Enter commits one undoable source edit; Esc cancels @feat:plugin-web.in-frame-edit @feat:plugin-web.engine-rendering @feat:plugin-web.auto-render @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await tapSceneLayers(page);

    const frame = await insertWebFrameWith(page, HTML, CSS);
    await expect.poll(() => sceneText(page, frame.id), { timeout: 15_000 }).toBe("Hello world");
    const original = await designer.renderBytes();

    // ── 1–2. Click, type, Enter. ──
    await clickIntoText(page, frame);
    await page.keyboard.type("ZQ");
    await expect
      .poll(() => sceneText(page, frame.id), { timeout: 10_000, message: "the canvas shows the typing live" })
      .toContain("ZQ");
    expect(await sourceText(page, frame), "typing alone does not write the document").toBe("Hello world");
    await page.keyboard.press("Enter");
    await expect.poll(() => sourceText(page, frame), { timeout: 10_000 }).toContain("ZQ");
    const committed = await sourceText(page, frame);
    expect(committed.replace("ZQ", ""), "only the typed text changed").toBe("Hello world");
    expect((await webSource(page, frame))?.html, "the markup around the text node is kept").toBe(
      `<p>${committed}</p>`,
    );
    await expect.poll(() => sceneText(page, frame.id), { timeout: 10_000 }).toBe(committed);
    await designer.expectRenderChangesFrom(original);

    // ── 3. One document undo step. ──
    await page.keyboard.press("Escape"); // leave the context (no edit open)
    await expect(page.locator(BREADCRUMB)).toHaveCount(0, { timeout: 10_000 });
    await undo(page);
    await expect.poll(() => sourceText(page, frame), { timeout: 10_000 }).toBe("Hello world");
    await expect.poll(() => sceneText(page, frame.id), { timeout: 15_000 }).toBe("Hello world");

    // ── 4. Esc cancels: the canvas returns, the document never moved. ──
    await clickIntoText(page, frame);
    await page.keyboard.type("XY");
    await expect.poll(() => sceneText(page, frame.id), { timeout: 10_000 }).toContain("XY");
    await page.keyboard.press("Escape");
    await expect.poll(() => sceneText(page, frame.id), { timeout: 10_000 }).toBe("Hello world");
    expect(await sourceText(page, frame), "a cancelled edit writes nothing").toBe("Hello world");
    await expect
      .poll(async () => designer.renderDiffPixels(original, await designer.renderBytes()), {
        timeout: 15_000,
        message: "after Esc the frame renders as before the edit",
      })
      .toBeLessThanOrEqual(16);
  });
});
