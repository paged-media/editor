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

// Gesture tier — the Page tool's v1 grammar on the canvas (coverage
// campaign P3, layout-model.spreads-pages):
//
//   PG-01  Alt+click a page inserts a new page after it (pageCount+1,
//          undone in one step).
//
// Pointer-driven through the real rail slot; the count oracle is the
// wire handle the app itself reads.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { activateTool, loadViaReactPath, screenPoint } from "./harness/viewport";
import { undo } from "./harness/gesture";

async function pageCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript(src: string): Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.pages()");
    return (JSON.parse(r.output[0] ?? "[]") as unknown[]).length;
  });
}

test("PG-01 — Alt+click with the Page tool inserts a page after the clicked one; ONE undo removes it @feat:layout-model.spreads-pages @level:gesture", async ({
  page,
}) => {
  await openCanvas(page);
  await loadViaReactPath(page, "geometry");

  const before = await pageCount(page);
  expect(before).toBeGreaterThan(0);

  await activateTool(page, "page");
  // Page 0's on-page centre in page-local pt (the fixture's pages are
  // US-Letter-ish; 100,100 is safely inside).
  const at = await screenPoint(page, 100, 100);
  await page.keyboard.down("Alt");
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up("Alt");

  await expect.poll(() => pageCount(page), { timeout: 5_000 }).toBe(before + 1);

  await undo(page);
  await expect.poll(() => pageCount(page), { timeout: 5_000 }).toBe(before);
});
