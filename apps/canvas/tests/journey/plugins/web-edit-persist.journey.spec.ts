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

// Journey: a web frame's source is EDITED, SAVED, and SURVIVES — the
// document is the source of truth and the canvas follows it.
//
//   1. insert a web frame, save version 1 from the source panel; the
//      document's label holds it and the canvas shows it (the scene text
//      the bundle submits is the source text — auto render on save);
//   2. edit and save version 2; label and canvas move to it;
//   3. save the document (.paged) and open it in a FRESH editor: the frame
//      comes back with version 2, rendered on open (no command), and the
//      page reads back pixel-equal to the page that was saved;
//   4. back in the first editor, ONE document undo reverts the save: the
//      label is version 1 again and so is the canvas (auto render on undo).
//
// Values, not DOM: labels via `elementProperties`, canvas via the scene
// layers the editor's client received, pixels via the deterministic CPU
// snapshot (polled — `expectRenderChangesFrom`).

import { expect, test, type Browser, type Page } from "@playwright/test";

import { fitFirstPage } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";
import {
  insertWebFrameWith,
  saveSource,
  sceneText,
  tapSceneLayers,
  undo,
  webFrames,
  webSource,
} from "./web-kit";

const CSS = "p { margin: 0; font: 22px/30px Inter, sans-serif; color: #101820; }";
const V1 = "<p>Autumn line sheet, first proof</p>";
const V2 = "<p>Winter catalogue: second proof with corrections</p>";
const V1_TEXT = "Autumn line sheet, first proof";
const V2_TEXT = "Winter catalogue: second proof with corrections";

async function exportPaged(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () =>
    Array.from(
      await (
        globalThis as unknown as { __canvas: { client: { exportPaged: () => Promise<Uint8Array> } } }
      ).__canvas.client.exportPaged(),
    ),
  );
  return Buffer.from(bytes);
}

/** Open `paged` through the file door of a brand-new editor. */
async function reopenFresh(browser: Browser, paged: Buffer): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await new Designer(page).open();
  await tapSceneLayers(page);
  await page.setInputFiles('input[type="file"]', {
    name: "web-edit-persist.paged",
    mimeType: "application/octet-stream",
    buffer: paged,
  });
  await expect
    .poll(async () => (await webFrames(page).catch(() => [])).length, { timeout: 20_000 })
    .toBe(1);
  await fitFirstPage(page);
  return page;
}

test.describe("journey · paged.web edit persistence", () => {
  test("a saved source survives save → reopen, renders on open, and one undo reverts the save on canvas @feat:plugin-web.metadata-persistence @feat:plugin-web.auto-render @feat:plugin-web.engine-rendering @level:happy", async ({
    page,
    browser,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await tapSceneLayers(page);

    // ── 1. Version 1: the label holds it, the canvas shows it. ──
    const frame = await insertWebFrameWith(page, V1, CSS);
    expect((await webSource(page, frame))?.css).toBe(CSS);
    await expect.poll(() => sceneText(page, frame.id), { timeout: 15_000 }).toBe(V1_TEXT);
    const v1Pixels = await designer.renderBytes();

    // ── 2. Version 2: edit + save → label and canvas follow. ──
    await saveSource(page, frame, V2, CSS);
    await expect.poll(() => sceneText(page, frame.id), { timeout: 15_000 }).toBe(V2_TEXT);
    await designer.expectRenderChangesFrom(v1Pixels);
    const v2Pixels = await designer.renderBytes();

    // ── 3. Save the document, open it in a fresh editor. ──
    const paged = await exportPaged(page);
    const reopened = await reopenFresh(browser, paged);
    try {
      const [again] = await webFrames(reopened);
      const src = await webSource(reopened, again!);
      expect(src?.html, "the reopened frame carries the saved source").toBe(V2);
      expect(src?.css).toBe(CSS);
      // Rendered on open — nobody invoked a render command here.
      await expect
        .poll(() => sceneText(reopened, again!.id), { timeout: 20_000 })
        .toBe(V2_TEXT);
      // And the page reads back as the page that was saved.
      const reDesigner = new Designer(reopened);
      await expect
        .poll(async () => reDesigner.renderDiffPixels(v2Pixels, await reDesigner.renderBytes()), {
          timeout: 15_000,
          message: "the reopened page renders like the saved one",
        })
        .toBeLessThanOrEqual(16);
    } finally {
      await reopened.context().close();
    }

    // ── 4. One undo reverts the save: label AND canvas back to v1. ──
    await undo(page);
    await expect.poll(async () => (await webSource(page, frame))?.html, { timeout: 10_000 }).toBe(V1);
    await expect.poll(() => sceneText(page, frame.id), { timeout: 15_000 }).toBe(V1_TEXT);
    await designer.expectRenderChangesFrom(v2Pixels);
    await expect
      .poll(async () => designer.renderDiffPixels(v1Pixels, await designer.renderBytes()), {
        timeout: 15_000,
        message: "after undo the page renders like version 1",
      })
      .toBeLessThanOrEqual(16);
  });
});
