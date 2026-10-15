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

// A cell's fill tint and a cell style's (engine 0.71.11, core ADR 152),
// set through the editor's own field and read back from the ENGINE:
//
//   · Table panel ▸ Cell ▸ Tint on the selected cell (`cell` address) —
//     the tinted fill must change the render;
//   · Cell Style Options ▸ Fill ▸ Tint (`style:cell/<id>`).
//
// The object model's SDK still vendors an older catalog (no `style:cell`
// row, and the cell row marked "not stored"); the editor's seam carries
// the pinned engine's rows until it re-syncs (apps/canvas/src/object-model.ts).

import { expect, test, type Locator, type Page } from "@playwright/test";

import { loadIdml, openCanvas, openPanel } from "./fidelity/canvas-driver";
import { generatedFixture } from "./e2e/harness/fixtures";
import { loadViaReactPath, screenPoint } from "./e2e/harness/viewport";
import { fieldOf, undoOnce } from "./e2e/harness/objects";
import { engineGet, expectRenderChange, pageRender } from "./e2e/harness/engine";

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

async function commitNumber(field: Locator, value: number) {
  const input = field.locator("input").first();
  await input.click();
  await input.fill(String(value));
  await input.press("Enter");
}

test.describe("Cell fill tint (engine 0.71.11)", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
  });

  test("CELL-TINT-1 — Table panel ▸ Cell ▸ Tint on the selected cell → engine cellFillTint, the tinted fill renders, one undo @feat:editor-shell.panels.table @feat:tables.model @feat:round-tripping.undo-redo @level:happy", async ({
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

    // A solid fill to tint.
    await panel.locator("[data-cell-fill-select]").selectOption("Color/Black");
    await expect.poll(() => cellRead(page, addr, "cellFillColor")).toBe("Color/Black");

    const field = fieldOf(panel, "cellFillTint");
    await expect(field).toHaveAttribute("data-value-type", "number");
    const input = field.locator("input").first();
    await expect(input).toBeEnabled();
    const before = await cellRead(page, addr, "cellFillTint");
    const render = await pageRender(page, p0);
    await commitNumber(field, 30);
    await expect.poll(() => cellRead(page, addr, "cellFillTint")).toBe(30);
    await expectRenderChange(page, p0, render);
    await undoOnce(page);
    await expect.poll(() => cellRead(page, addr, "cellFillTint")).toEqual(before);
    // The fill colour (the step before) is still applied.
    expect(await cellRead(page, addr, "cellFillColor")).toBe("Color/Black");
  });

  test("CELL-TINT-2 — Cell Style Options ▸ Fill ▸ Tint on style:cell/… → engine cellFillTint, one undo @feat:styles.set-style-property @feat:styles.cell.crud @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await loadIdml(page, generatedFixture("styles-cascade"));
    await openPanel(page, "paged.cell-styles");
    await page.locator('[data-style-options-open="CellStyle/CellBase"]').click();
    const panel = page.locator('[data-style-options-panel="ready"]');
    const address = "style:cell/CellStyle/CellBase";
    await expect(panel).toHaveAttribute("data-style-target", address);
    const field = fieldOf(panel, "cellFillTint");
    await expect(field).toHaveAttribute("data-value-type", "number");
    const before = await engineGet(page, address, "cellFillTint");
    const next = before === 35 ? 45 : 35;
    await commitNumber(field, next);
    await expect.poll(() => engineGet(page, address, "cellFillTint")).toBe(next);
    await undoOnce(page);
    await expect.poll(() => engineGet(page, address, "cellFillTint")).toEqual(before);
  });
});
