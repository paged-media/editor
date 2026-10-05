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

// Journey: paged.sheet PAGINATION into a threaded frame chain, driven by the
// "Paginate into threaded frames" command — and checked by VALUE.
//
// A designer draws three text frames and threads them into one story,
// imports a 31-row table (a CSV generated here, so every cell is known),
// selects the first frame and runs the command. The engine packs rows
// greedily across the chain, one native table per frame. The exported
// document must hold:
//   · more than one table, all in the chain's story — the rows really were
//     split across frames rather than overset out of one;
//   · every source row exactly once and in order across those tables —
//     nothing dropped at a frame break, nothing duplicated.
//
// (This replaced a check that the in-frame grid painted more than 64
// pixels, which passed whether or not anything was paginated.)

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";
import { importWorkbook, placedTables } from "./sheet-kit";

const ROWS = 30;
const HEADER = ["item", "qty"];
const BODY = Array.from({ length: ROWS }, (_, i) => [`Item ${i + 1}`, String((i + 1) * 3)]);
const CSV = [HEADER, ...BODY].map((r) => r.join(",")).join("\n") + "\n";

async function link(page: Page, from: string, to: string): Promise<void> {
  await page.evaluate(
    async ({ from, to }) => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { mutate: (m: unknown) => Promise<unknown> } };
        }
      ).__canvas;
      await c.client.mutate({ op: "linkFrames", args: { from, to } });
    },
    { from, to },
  );
}

test.describe("journey · paged.sheet pagination", () => {
  test("'Paginate into threaded frames' splits a tall range across a chain with every row once @feat:sheet.lower.paginate @feat:sheet.lower.page @feat:sheet.plugin.bundle @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Three 200 pt frames: 31 rows of ~15 pt need more than one, fewer
    // than four.
    const a = await designer.addTextFrame({ x0: 36, y0: 36, x1: 276, y1: 236 });
    const b = await designer.addTextFrame({ x0: 300, y0: 36, x1: 540, y1: 236 });
    const c = await designer.addTextFrame({ x0: 36, y0: 300, x1: 276, y1: 500 });
    await link(page, a.frameId, b.frameId);
    await link(page, b.frameId, c.frameId);

    await importWorkbook(page, {
      name: "paginate-rows.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV, "utf8"),
    });
    await page.locator("[data-sheet-range]").fill(`A1:B${ROWS + 1}`);
    await designer.selectElement("textFrame", a.frameId);
    await designer.runCommand("media.paged.sheet.command.paginateToChain");

    await expect
      .poll(async () => (await placedTables(page)).tables.length, { timeout: 15_000 })
      .toBeGreaterThan(1);
    const doc = await placedTables(page);
    const stories = new Set(doc.tables.map((t) => t.storyFile));
    expect(stories.size, "every slice is in the chain's one story").toBe(1);
    expect(doc.tables.length, "three frames hold the range").toBeLessThanOrEqual(3);
    for (const t of doc.tables) {
      expect(t.rows.length, "no empty slice").toBeGreaterThan(0);
    }
    const flowed = doc.tables.flatMap((t) => t.rows);
    expect(flowed, "every source row once, in order").toEqual([HEADER, ...BODY]);
  });
});
