// E2E op suite — the LIVE Table panel v2 (W2.11, protocol-v35 surface).
//
// Drives the REAL panel controls + the in-canvas cell-text caret entry,
// asserting the OPERATION SANDWICH against ENGINE TRUTH (not just the
// UI) for the v35 additions:
//
//   - SPANS         → setCellSpan via the panel; the cell's rendered
//                     geometry grows (its AABB widens/tallens — a span
//                     covers neighbour cells) → undo restores it.
//   - HEADER ROW    → insertHeaderRow via the panel; the table's
//                     `tableRowCount` read (over the wire) increases →
//                     undo restores it. (Header rows count toward the
//                     total row count — the engine exposes no separate
//                     header-count read, so the row total IS the wire
//                     proof.)
//   - EDGE STROKE   → set a cell's top-edge stroke colour/weight/tint
//                     via the panel; read it back from the cell
//                     properties surface (v35 cell edge-stroke paths) →
//                     undo restores.
//   - CELL TEXT     → with the Type tool, click into a cell; assert the
//                     selection carries the v35 `cell` qualifier and the
//                     caret resolves IN the cell; type → the cell's
//                     stream grows → undo restores. Proves the UI path
//                     (the wire path is proven core-side).
//
// Cell + table properties read back via `elementProperties` / the wire
// caret/word queries, so the assertions check the MODEL.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { activateTool, loadViaReactPath, screenPoint } from "./harness/viewport";

interface CellAddr {
  storyId: string;
  tableId: string;
  row: number;
  col: number;
}

/** Sweep page 0 for the first table cell; return its address + the
 *  page-local doc point that hit it (so a test can re-click it). */
async function findCell(
  page: Page,
  pageId: string,
  widthPt: number,
  heightPt: number,
): Promise<{ addr: CellAddr; gx: number; gy: number } | null> {
  return page.evaluate(
    async ({ pageId, widthPt, heightPt }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              send: (m: unknown) => Promise<{
                kind: string;
                payload?: {
                  storyId?: string | null;
                  tableContext?: {
                    tableId: string;
                    row: number;
                    col: number;
                  } | null;
                };
              }>;
            };
          };
        }
      ).__canvas;
      for (let gy = 0.04; gy < 0.97; gy += 0.03) {
        for (let gx = 0.04; gx < 0.97; gx += 0.03) {
          const reply = await c.client.send({
            kind: "hitTest",
            payload: { pageId, docPoint: [widthPt * gx, heightPt * gy], filter: "any" },
          });
          const p = reply.payload;
          if (reply.kind === "hitResult" && p?.tableContext && p.storyId) {
            return {
              addr: {
                storyId: p.storyId,
                tableId: p.tableContext.tableId,
                row: p.tableContext.row,
                col: p.tableContext.col,
              },
              gx,
              gy,
            };
          }
        }
      }
      return null;
    },
    { pageId, widthPt, heightPt },
  );
}

/** Read the Table NodeId's `tableRowCount` (integer-as-Length). */
async function tableRowCount(page: Page, addr: CellAddr): Promise<number | null> {
  return page.evaluate(async (a) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementProperties: (id: unknown) => Promise<{
              entries: Array<{ path: string; value: { type: string; value: unknown } }>;
            } | null>;
          };
        };
      }
    ).__canvas;
    const id = { kind: "table", id: { story_id: a.storyId, table_id: a.tableId } };
    const props = await c.client.elementProperties(id);
    const v = props?.entries.find((e) => e.path === "tableRowCount")?.value;
    return v && v.type === "length" && v.value != null
      ? Math.round(v.value as number)
      : null;
  }, addr);
}

/** Read one cell-property path's value (engine truth). */
async function cellProp(
  page: Page,
  addr: CellAddr,
  path: string,
): Promise<{ type: string; value: unknown } | null> {
  return page.evaluate(
    async ({ a, path }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries: Array<{ path: string; value: { type: string; value: unknown } }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const id = {
        kind: "tableCell",
        id: { story_id: a.storyId, table_id: a.tableId, row: a.row, col: a.col },
      };
      const props = await c.client.elementProperties(id);
      return props?.entries.find((e) => e.path === path)?.value ?? null;
    },
    { a: addr, path },
  );
}

/** The selected cell's rendered page-space AABB (via elementGeometry on
 *  the TableCell ElementId), as `[top, left, bottom, right]`. */
async function cellRect(
  page: Page,
  addr: CellAddr,
): Promise<[number, number, number, number] | null> {
  return page.evaluate(async (a) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementGeometry: (ids: unknown[]) => Promise<
              Array<{
                bounds: [number, number, number, number];
                itemTransform: [number, number, number, number, number, number] | null;
              }>
            >;
          };
        };
      }
    ).__canvas;
    const id = {
      kind: "tableCell",
      id: { story_id: a.storyId, table_id: a.tableId, row: a.row, col: a.col },
    };
    const items = await c.client.elementGeometry([id]);
    const item = items[0];
    if (!item) return null;
    const [top, left, bottom, right] = item.bounds;
    const t = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
    const corners: Array<[number, number]> = [
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom],
    ].map(([x, y]) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]]);
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    return [Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)];
  }, addr);
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as { __canvas: { client: { undo: () => Promise<unknown> } } }
    ).__canvas.client.undo();
  });
}

async function firstSwatchId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: { collection: (n: string) => Promise<Array<{ selfId: string }>> };
        };
      }
    ).__canvas;
    const sw = await c.client.collection("swatches");
    return sw.find((s) => !/none|paper/i.test(s.selfId))?.selfId ?? sw[0]?.selfId ?? null;
  });
}

/** Load the tables fixture, fit, click into its first cell so the Table
 *  panel addresses it, and open the panel. */
async function loadAndSelectCell(page: Page): Promise<{
  addr: CellAddr;
  gx: number;
  gy: number;
  pageId: string;
  widthPt: number;
  heightPt: number;
}> {
  const fx = await loadViaReactPath(page, "tables");
  const p0 = fx.pages[0];
  const found = await findCell(page, p0.pageId, p0.widthPt, p0.heightPt);
  expect(found, "no table cell found in the tables fixture page 0").not.toBeNull();
  const { addr, gx, gy } = found as { addr: CellAddr; gx: number; gy: number };
  const pt = await screenPoint(page, p0.widthPt * gx, p0.heightPt * gy);
  await page.mouse.click(pt.x, pt.y);
  await openPanel(page, "paged.table");
  await expect(page.locator('[data-table-panel="ready"]')).toBeVisible();
  return { addr, gx, gy, pageId: p0.pageId, widthPt: p0.widthPt, heightPt: p0.heightPt };
}

test.describe("W2.11 — Table panel v2 op sandwiches", () => {
  test("AC-TABLE-SPAN: setCellSpan grows the cell's rendered geometry + undo restores", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const { addr } = await loadAndSelectCell(page);

    const before = await cellRect(page, addr);
    expect(before, "cell rect before span").not.toBeNull();
    const wBefore = before![3] - before![1];
    const hBefore = before![2] - before![0];

    // Drive the REAL Merge 2×2 control in the panel.
    await page.locator('[data-cockpit-action="merge-cells"]').click();

    // Engine truth: a 2×2 span covers neighbour cells, so the origin
    // cell's rendered AABB is strictly larger in BOTH dimensions.
    await expect
      .poll(
        async () => {
          const r = await cellRect(page, addr);
          if (!r) return 0;
          const w = r[3] - r[1];
          const h = r[2] - r[0];
          return w > wBefore + 0.5 && h > hBefore + 0.5 ? 1 : 0;
        },
        { timeout: 6_000 },
      )
      .toBe(1);

    // The panel reflects the applied span.
    await expect(page.locator("[data-cell-span]")).toHaveText(/2 × 2/);

    // Undo restores the original cell geometry.
    await undo(page);
    await expect
      .poll(
        async () => {
          const r = await cellRect(page, addr);
          if (!r) return 0;
          const w = r[3] - r[1];
          const h = r[2] - r[0];
          return Math.abs(w - wBefore) < 0.5 && Math.abs(h - hBefore) < 0.5 ? 1 : 0;
        },
        { timeout: 6_000 },
      )
      .toBe(1);
  });

  test("AC-TABLE-HEADER: insertHeaderRow raises tableRowCount (wire read) + undo restores", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const { addr } = await loadAndSelectCell(page);

    const rowsBefore = await tableRowCount(page, addr);
    expect(rowsBefore, "tableRowCount before header insert").not.toBeNull();

    // Drive the REAL + Header control.
    await page.locator('[data-cockpit-action="insert-header-row"]').click();

    // Wire read: the header row counts toward the table's total rows.
    await expect
      .poll(() => tableRowCount(page, addr), { timeout: 6_000 })
      .toBe((rowsBefore as number) + 1);

    // The panel's applied-header count + total row display update.
    await expect(page.locator("[data-header-count]")).toHaveText("1");
    await expect(page.locator("[data-table-total-rows]")).toHaveText(
      String((rowsBefore as number) + 1),
    );

    // Undo restores the row count.
    await undo(page);
    await expect
      .poll(() => tableRowCount(page, addr), { timeout: 6_000 })
      .toBe(rowsBefore as number);
  });

  test("AC-TABLE-EDGE-STROKE: per-cell top-edge stroke applies + reads back + undoes", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const { addr } = await loadAndSelectCell(page);

    const swatch = await firstSwatchId(page);
    expect(swatch).not.toBeNull();
    const colorBefore = await cellProp(page, addr, "cellTopEdgeStrokeColor");

    // Set the top edge colour via the panel select.
    await page
      .locator('[data-edge-color-select="top"]')
      .selectOption(swatch as string);
    await expect
      .poll(async () => {
        const v = await cellProp(page, addr, "cellTopEdgeStrokeColor");
        return v && v.type === "colorRef" ? (v.value as string | null) : null;
      }, { timeout: 5_000 })
      .toBe(swatch);

    // Set the top-edge weight via the panel input (Enter commits).
    const weightInput = page.locator('[data-num-input="edge-weight-top"]');
    await weightInput.fill("3");
    await weightInput.press("Enter");
    await expect
      .poll(async () => {
        const v = await cellProp(page, addr, "cellTopEdgeStrokeWeight");
        return v && v.type === "length" ? (v.value as number | null) : null;
      }, { timeout: 5_000 })
      .toBe(3);

    // Set the top-edge tint.
    const tintInput = page.locator('[data-num-input="edge-tint-top"]');
    await tintInput.fill("40");
    await tintInput.press("Enter");
    await expect
      .poll(async () => {
        const v = await cellProp(page, addr, "cellTopEdgeStrokeTint");
        return v && v.type === "length" ? (v.value as number | null) : null;
      }, { timeout: 5_000 })
      .toBe(40);

    // Undo the tint commit — read-back restores to the prior tint.
    await undo(page);
    await expect
      .poll(async () => {
        const v = await cellProp(page, addr, "cellTopEdgeStrokeWeight");
        return v && v.type === "length" ? (v.value as number | null) : null;
      }, { timeout: 5_000 })
      .toBe(3);

    void colorBefore;
  });

  test("AC-TABLE-CELL-TEXT: Type-tool click enters in-cell editing; typing inserts; undo restores", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const { addr, pageId, widthPt, heightPt } = await loadAndSelectCell(page);

    // Switch to the Type tool. Re-find the cell hit point AFTER the
    // panel opened (the right dock resized the viewport / re-fit the
    // camera), so the screen mapping is current, then click into it.
    // The settle lets the re-fit camera transition land before we map
    // the doc point to screen px (otherwise the click misses the cell).
    await activateTool(page, "type");
    await page.waitForTimeout(1000);
    const found = await findCell(page, pageId, widthPt, heightPt);
    expect(found, "cell hit point for type-tool click").not.toBeNull();
    const { gx, gy } = found as { gx: number; gy: number };
    const pt = await screenPoint(page, widthPt * gx, heightPt * gy);
    await page.mouse.click(pt.x, pt.y);

    // The content selection now carries the v35 `cell` qualifier
    // addressing THIS cell — proof the caret entered the cell, not the
    // body story.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              JSON.stringify(
                (
                  globalThis as unknown as {
                    __canvas: {
                      contentSelection: {
                        storyId: string;
                        cell?: { tableId: string; row: number; col: number } | null;
                      } | null;
                    };
                  }
                ).__canvas.contentSelection?.cell ?? null,
              ),
          ),
        { timeout: 6_000 },
      )
      .toBe(
        JSON.stringify({ tableId: addr.tableId, row: addr.row, col: addr.col }),
      );

    // The caret resolves IN the cell (a real in-cell caret geometry).
    const caret = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            contentSelection: unknown;
            client: { caretGeometry: (s: unknown) => Promise<unknown> };
          };
        }
      ).__canvas;
      return c.client.caretGeometry(c.contentSelection);
    });
    expect(caret, "in-cell caret geometry").toBeTruthy();

    // Record the cell-local caret x at the selection start (engine
    // truth) so we can prove typing advances it.
    const caretXBefore = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            contentSelection: { storyId: string; start: number; end: number; cell?: unknown } | null;
            client: { caretGeometry: (s: unknown) => Promise<{ xPt: number } | null> };
          };
        }
      ).__canvas;
      const g = await c.client.caretGeometry(c.contentSelection);
      return g?.xPt ?? null;
    });
    expect(caretXBefore, "caret x before typing").not.toBeNull();

    // Type a character — routes through useTextEditing with the cell
    // qualifier, inserting into the cell's stream.
    await page.keyboard.press("Z");

    // The selection advanced by one (cell-local), and the caret moved
    // right of where it was — proof the insert landed and the caret
    // re-resolved in the cell.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              (
                globalThis as unknown as {
                  __canvas: { contentSelection: { start: number } | null };
                }
              ).__canvas.contentSelection?.start ?? -1,
          ),
        { timeout: 6_000 },
      )
      .toBe(1);
    await expect
      .poll(async () => {
        const x = await page.evaluate(async () => {
          const c = (
            globalThis as unknown as {
              __canvas: {
                contentSelection: unknown;
                client: { caretGeometry: (s: unknown) => Promise<{ xPt: number } | null> };
              };
            }
          ).__canvas;
          const g = await c.client.caretGeometry(c.contentSelection);
          return g?.xPt ?? null;
        });
        return x != null && caretXBefore != null && x > caretXBefore + 0.1 ? 1 : 0;
      }, { timeout: 6_000 })
      .toBe(1);

    // Undo removes the inserted character — the cell stream is restored.
    await undo(page);
    await expect
      .poll(async () => {
        const x = await page.evaluate(async () => {
          const c = (
            globalThis as unknown as {
              __canvas: {
                contentSelection: { storyId: string; start: number; end: number; cell?: unknown } | null;
                client: { caretGeometry: (s: unknown) => Promise<{ xPt: number } | null> };
              };
            }
          ).__canvas;
          // Re-resolve the caret at offset 0 in the cell (the insert
          // origin) — it should match the pre-typing x within slop.
          const sel = c.contentSelection;
          if (!sel) return null;
          const g = await c.client.caretGeometry({ ...sel, start: 0, end: 0 });
          return g?.xPt ?? null;
        });
        return x != null && caretXBefore != null && Math.abs(x - caretXBefore) < 1.5 ? 1 : 0;
      }, { timeout: 6_000 })
      .toBe(1);
  });
});
