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

// ED-8 — the editor's half of "tables in the showcase".
//
//   · Double-clicking a table with the Selection tool entered paged.draw's
//     vector editing: the draw bundle claims every path-bearing kind,
//     text frames included, and nothing in the host spoke for TEXT first.
//     A double-click on text in a text frame now does what it does in
//     InDesign: switch to the Type tool with the caret at the point — in
//     the cell, when the point is in a table cell.
//   · A cell caret set any way other than a canvas click (automation,
//     the Type tool's own entry above) reached no panel: the Table panel
//     reads a table-cell selection that only the click handler wrote. The
//     content selection's cell now drives it too.
//
// The third symptom — on the showcase's tables, hit tests stop reporting
// cells after the document rebuilds — is the engine's (a replayed
// body-story emission drops the page's cell rects); see the PR.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { loadViaReactPath, screenPoint } from "./harness/viewport";

interface Cell {
  storyId: string;
  tableId: string;
  row: number;
  col: number;
  x: number;
  y: number;
}

/** A page-0 point inside a table cell (and the cell), by hit test. */
async function findCell(page: Page): Promise<Cell> {
  const cell = await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          handle: { pageIds: string[]; pageSizesPt: [number, number][] };
          client: {
            send: (m: unknown) => Promise<{
              kind: string;
              payload?: {
                storyId?: string | null;
                tableContext?: { tableId: string; row: number; col: number } | null;
              };
            }>;
          };
        };
      }
    ).__canvas;
    const pageId = c.handle.pageIds[0];
    const [w, h] = c.handle.pageSizesPt[0];
    for (let gy = 0.04; gy < 0.97; gy += 0.03) {
      for (let gx = 0.04; gx < 0.97; gx += 0.03) {
        const r = await c.client.send({
          kind: "hitTest",
          payload: { pageId, docPoint: [w * gx, h * gy], filter: "any" },
        });
        const p = r.payload;
        // Row 1+ — a body cell, away from a header's edge cases.
        if (p?.tableContext && p.storyId && p.tableContext.row >= 1) {
          return { storyId: p.storyId, ...p.tableContext, x: w * gx, y: h * gy };
        }
      }
    }
    return null;
  });
  expect(cell, "the tables fixture has a body cell on page 0").not.toBeNull();
  return cell!;
}

async function state(page: Page) {
  return page.evaluate(() => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          contentSelection: {
            storyId: string;
            cell?: { tableId: string; row: number; col: number } | null;
          } | null;
          debugContext?: () => {
            tools?: { base?: string };
            editContext?: { type?: string } | null;
          };
        };
      }
    ).__canvas;
    const d = c.debugContext?.();
    return {
      caret: c.contentSelection,
      tool: d?.tools?.base ?? null,
      context: d?.editContext?.type ?? null,
    };
  });
}

test.describe("ED-8 — table cells from the Selection tool and from automation", () => {
  test("AC-TABLE-DBL-1 — double-clicking a cell puts the caret in that cell, with the Type tool @feat:editor-shell.panels.table @level:gesture", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadViaReactPath(page, "tables");
    const cell = await findCell(page);
    await page.locator('[data-tool-slot="select"]').click();
    const at = await screenPoint(page, cell.x, cell.y);
    await page.mouse.dblclick(at.x, at.y);

    await expect.poll(async () => (await state(page)).caret?.cell?.row ?? null).toBe(cell.row);
    const s = await state(page);
    expect(s.context, "no vector editing on a text frame's text").toBeNull();
    expect(s.tool).toBe("paged.tool.type");
    expect(s.caret?.storyId).toBe(cell.storyId);
    expect(s.caret?.cell).toMatchObject({ tableId: cell.tableId, row: cell.row, col: cell.col });

    await openPanel(page, "paged.table");
    await expect(page.locator('[data-table-panel="ready"]')).toBeVisible();
    await expect(page.locator("[data-table-cell-address]")).toHaveText(`R${cell.row} · C${cell.col}`);
  });

  test("AC-TABLE-CARET-1 — a cell caret set through automation reaches the Table panel @feat:editor-shell.panels.table @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadViaReactPath(page, "tables");
    const cell = await findCell(page);
    await openPanel(page, "paged.table");
    await expect(page.locator('[data-table-panel="empty"]')).toBeVisible();

    await page.evaluate((cell) => {
      (
        globalThis as unknown as {
          __canvas: { setContentSelection: (s: unknown) => void };
        }
      ).__canvas.setContentSelection({
        storyId: cell.storyId,
        start: 0,
        end: 0,
        cell: { tableId: cell.tableId, row: cell.row, col: cell.col },
      });
    }, cell);

    await expect(page.locator('[data-table-panel="ready"]')).toBeVisible();
    await expect(page.locator("[data-table-cell-address]")).toHaveText(`R${cell.row} · C${cell.col}`);
  });
});
