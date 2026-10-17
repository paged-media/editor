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

// A table row's Start Row and Keep With Next (engine 0.73.1, core ADR
// 175), set from Table panel ▸ Keep options on the selected cell — the
// row is reached through any of its cells — and read back from the ENGINE.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";
import { loadViaReactPath, screenPoint } from "./e2e/harness/viewport";
import { fieldOf, undoOnce } from "./e2e/harness/objects";

interface CellAddr {
  storyId: string;
  tableId: string;
  row: number;
  col: number;
}

/** Sweep page 0 for the first table cell (a hit test with a table context). */
async function findCell(page: Page, pageId: string, widthPt: number, heightPt: number) {
  return page.evaluate(
    async ({ pageId, widthPt, heightPt }) => {
      const c = (globalThis as unknown as {
        __canvas: {
          client: {
            send(m: unknown): Promise<{
              kind: string;
              payload?: { storyId?: string | null; tableContext?: { tableId: string; row: number; col: number } | null };
            }>;
          };
        };
      }).__canvas;
      for (let gy = 0.04; gy < 0.97; gy += 0.03) {
        for (let gx = 0.04; gx < 0.97; gx += 0.03) {
          const r = await c.client.send({ kind: "hitTest", payload: { pageId, docPoint: [widthPt * gx, heightPt * gy], filter: "any" } });
          const p = r.payload;
          if (r.kind === "hitResult" && p?.tableContext && p.storyId) {
            const { tableId, row, col } = p.tableContext;
            return { addr: { storyId: p.storyId, tableId, row, col }, gx, gy };
          }
        }
      }
      return null;
    },
    { pageId, widthPt, heightPt },
  );
}

/** The cell's value for `path` from the engine's element read. */
function cellRead(page: Page, a: CellAddr, path: string): Promise<unknown> {
  return page.evaluate(
    async ({ a, path }) => {
      const c = (globalThis as unknown as {
        __canvas: { client: { elementProperties(id: unknown): Promise<{ entries: { path: string; value: { value: unknown } | null }[] } | null> } };
      }).__canvas;
      const props = await c.client.elementProperties({
        kind: "tableCell",
        id: { story_id: a.storyId, table_id: a.tableId, row: a.row, col: a.col },
      });
      const e = props?.entries.find((x) => x.path === path);
      return e ? (e.value?.value ?? null) : "absent";
    },
    { a, path },
  );
}

test.describe("Table row keep options (engine 0.73.1)", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
  });

  test("ROW-KEEP-1 — Table panel ▸ Keep options ▸ Start row and Keep with next row on the selected cell's row → engine rowStartRow / rowKeepWithNext, one undo each @feat:editor-shell.panels.table @feat:tables.model @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const fx = await loadViaReactPath(page, "tables");
    const p0 = fx.pages[0];
    const found = await findCell(page, p0.pageId, p0.widthPt, p0.heightPt);
    expect(found, "the tables fixture has a cell on page 0").not.toBeNull();
    const { addr, gx, gy } = found!;
    const pt = await screenPoint(page, p0.widthPt * gx, p0.heightPt * gy);
    await page.mouse.click(pt.x, pt.y);
    await openPanel(page, "paged.table");
    const panel = page.locator('[data-table-panel="ready"]');
    await expect(panel).toBeVisible();

    // Start row: the catalog's StartParagraph members.
    const start = fieldOf(panel, "rowStartRow");
    await expect(start).toHaveAttribute("data-value-type", "enum");
    await start.locator("select").first().selectOption("NextFrame");
    await expect.poll(() => cellRead(page, addr, "rowStartRow")).toBe("NextFrame");
    await undoOnce(page);
    await expect.poll(() => cellRead(page, addr, "rowStartRow")).toBe("Anywhere");

    // Keep with next row.
    const keep = fieldOf(panel, "rowKeepWithNext");
    await expect(keep).toHaveAttribute("data-value-type", "bool");
    const before = await cellRead(page, addr, "rowKeepWithNext");
    await keep.locator('[role="switch"]').click();
    await expect.poll(() => cellRead(page, addr, "rowKeepWithNext")).toBe(before !== true);
    await undoOnce(page);
    await expect.poll(() => cellRead(page, addr, "rowKeepWithNext")).toEqual(before);
  });
});
