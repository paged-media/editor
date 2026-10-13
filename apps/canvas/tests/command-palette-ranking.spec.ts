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

// ED-15 — the command palette ranks by what a command is CALLED.
//
// It used cmdk's default fuzzy scorer over "<category> <title> <id>": a
// query matched as a scattered subsequence anywhere in that string, ids
// included. "export" ranked Blend: Expand first (e·x·p from "Expand",
// o·r·t from the id), and "table" / "style" listed only Blend commands,
// whose long ids happen to contain those letters in order.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "./journey/driver/designer";
import { paletteScore } from "../../../packages/shell/src/chrome/palette-score";

/** The titles of the first `n` rows the palette shows for `query`. */
async function topTitles(page: Page, query: string, n = 6): Promise<string[]> {
  const input = page.getByPlaceholder("Ask or search anything…");
  await input.fill(query);
  // cmdk re-sorts on input; give it the frame.
  await page.waitForTimeout(150);
  return page
    .locator("[cmdk-list] [cmdk-item]:not([data-palette-ai])")
    .evaluateAll(
      (els, n) =>
        els.slice(0, n).map((e) => (e.querySelector("span")?.textContent ?? "").trim()),
      n,
    );
}

test.describe("ED-15 — command palette ranking", () => {
  test("AC-PALETTE-RANK-1 — export, table and style surface the commands named for them @feat:editor-shell.command-palette @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await designer.runCommand("paged.palette.toggle");
    await expect(page.getByPlaceholder("Ask or search anything…")).toBeVisible();

    const exportTop = await topTitles(page, "export");
    expect(exportTop[0], `first row for "export": ${exportTop.join(" | ")}`).toMatch(/export/i);
    expect(exportTop.filter((t) => /blend/i.test(t))).toEqual([]);

    for (const q of ["table", "style"]) {
      const top = await topTitles(page, q);
      expect(top.length, `"${q}" finds commands`).toBeGreaterThan(0);
      for (const t of top) {
        expect(t, `"${q}" row: ${top.join(" | ")}`).toMatch(new RegExp(q, "i"));
      }
    }

    // Typing on through a title still finds it.
    expect((await topTitles(page, "text frame"))[0]).toMatch(/text frame/i);
  });

  test("AC-PALETTE-RANK-2 — the score: a title word beats the id, scattered letters match nothing @feat:editor-shell.command-palette @level:edge", () => {
    const blendExpand = paletteScore("media.paged.draw.command.blendExpand", "export", [
      "Blend: Expand",
      "Draw",
    ]);
    expect(blendExpand, "a scattered subsequence is no match").toBe(0);

    const exportPdf = paletteScore("paged.file.exportPdf", "export", ["Export PDF…", "File"]);
    const exportInId = paletteScore("media.paged.x.command.exportThing", "export", [
      "Write a thing",
      "X",
    ]);
    expect(exportPdf).toBeGreaterThan(exportInId);
    expect(exportInId).toBeGreaterThan(0);

    // Every word of the query must land somewhere.
    expect(paletteScore("paged.insert.textFrame", "text frame", ["Insert text frame", "Insert"])).toBeGreaterThan(0);
    expect(paletteScore("paged.insert.textFrame", "text banana", ["Insert text frame", "Insert"])).toBe(0);
  });
});
