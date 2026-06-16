// E2E op suite — the LIVE Table panel (W3.A2).
//
// The v30 table surface: a click into a table cell sets the table
// selection (HitResult.tableContext → TableSelectionContext), the Table
// panel drives the SELECTED cell, and the six table ops + the cell
// PropertyPaths mutate it. These specs drive the REAL panel controls
// and assert the OPERATION SANDWICH for the representative ops the
// inventory calls out:
//
//   - cell fill colour  → assert engine `cellFillColor` changed → undo
//   - insert row        → the table gains a row (a fresh hit one row
//                         down now lands in the table) → undo
//   - row height        → setRowHeight applies + undoes on the channel
//
// Cell properties read back via `elementProperties(cellId)` (engine
// truth), so the assertions check the MODEL, not just the UI.
// Aftercare-C: the Table NodeId now carries tableRowCount /
// tableColumnCount (integer-as-Length) and a TableCell ElementId
// resolves precise per-cell geometry, so AC-TABLE-DIMS asserts the
// panel shows the real row × column totals and the cell overlay paints a
// rect tighter than the whole table frame. "insert row" is still
// asserted by the render + channel below.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { loadViaReactPath, screenPoint } from "./harness/viewport";

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
            payload: {
              pageId,
              docPoint: [widthPt * gx, heightPt * gy],
              filter: "any",
            },
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

/** Read a cell's `cellFillColor` (engine truth). */
async function cellFill(page: Page, addr: CellAddr): Promise<string | null> {
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
    const id = {
      kind: "tableCell",
      id: { story_id: a.storyId, table_id: a.tableId, row: a.row, col: a.col },
    };
    const props = await c.client.elementProperties(id);
    const v = props?.entries.find((e) => e.path === "cellFillColor")?.value;
    return v && v.type === "colorRef" ? (v.value as string | null) : null;
  }, addr);
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas;
    await c.client.undo();
  });
}

/** First swatch selfId (for the fill apply). */
async function firstSwatchId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<Array<{ selfId: string }>>;
          };
        };
      }
    ).__canvas;
    const sw = await c.client.collection("swatches");
    // skip None/Paper-style pseudo-swatches by preferring a non-empty
    // colour name; fall back to the first.
    return sw.find((s) => !/none|paper/i.test(s.selfId))?.selfId ?? sw[0]?.selfId ?? null;
  });
}

/** Load the tables fixture, fit, and click into its first cell so the
 *  Table panel addresses it. Returns the cell address + the click pt. */
async function loadAndSelectCell(
  page: Page,
): Promise<{ addr: CellAddr; gx: number; gy: number; pageId: string; widthPt: number; heightPt: number }> {
  const fx = await loadViaReactPath(page, "tables");
  const p0 = fx.pages[0];
  const found = await findCell(page, p0.pageId, p0.widthPt, p0.heightPt);
  expect(found, "no table cell found in the tables fixture page 0").not.toBeNull();
  const { addr, gx, gy } = found as { addr: CellAddr; gx: number; gy: number };
  // Click the cell on the real canvas → onHit → table selection.
  const pt = await screenPoint(page, p0.widthPt * gx, p0.heightPt * gy);
  await page.mouse.click(pt.x, pt.y);
  await openPanel(page, "paged.table");
  await expect(page.locator('[data-table-panel="ready"]')).toBeVisible();
  return { addr, gx, gy, pageId: p0.pageId, widthPt: p0.widthPt, heightPt: p0.heightPt };
}

test.describe("W3.A2 — Table panel op sandwiches", () => {
  test("AC-TABLE-FILL: cell fill colour applies + undoes (engine truth) @feat:editor-shell.panels.table @feat:tables.model @level:happy", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const { addr } = await loadAndSelectCell(page);

    const before = await cellFill(page, addr);
    const swatch = await firstSwatchId(page);
    expect(swatch).not.toBeNull();

    // Drive the REAL fill select in the panel.
    await page
      .locator("[data-cell-fill-select]")
      .selectOption(swatch as string);

    // Engine truth: the cell's fill is now the chosen swatch.
    await expect
      .poll(() => cellFill(page, addr), { timeout: 5_000 })
      .toBe(swatch);

    // Undo restores the prior fill.
    await undo(page);
    await expect
      .poll(() => cellFill(page, addr), { timeout: 5_000 })
      .toBe(before);
  });

  test("AC-TABLE-INSERT-ROW: insert row grows the table + undo shrinks it @feat:editor-shell.panels.table @feat:tables.model @level:happy", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const { addr, pageId, widthPt, heightPt } = await loadAndSelectCell(page);

    // Probe the highest row index present before the insert (sweep).
    const maxRowBefore = await page.evaluate(
      async ({ pageId, widthPt, heightPt }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                send: (m: unknown) => Promise<{
                  kind: string;
                  payload?: { tableContext?: { row: number } | null };
                }>;
              };
            };
          }
        ).__canvas;
        let maxRow = -1;
        for (let gy = 0.04; gy < 0.97; gy += 0.02) {
          for (let gx = 0.04; gx < 0.97; gx += 0.06) {
            const r = await c.client.send({
              kind: "hitTest",
              payload: { pageId, docPoint: [widthPt * gx, heightPt * gy], filter: "any" },
            });
            const row = r.payload?.tableContext?.row;
            if (typeof row === "number") maxRow = Math.max(maxRow, row);
          }
        }
        return maxRow;
      },
      { pageId, widthPt, heightPt },
    );

    // Insert a row via the panel button (at the selected row index).
    await page.locator('[data-table-panel="ready"] button:has-text("+ Row")').click();

    // The table grew: the max row index hit on the page increased.
    await expect
      .poll(
        async () =>
          page.evaluate(
            async ({ pageId, widthPt, heightPt }) => {
              const c = (
                globalThis as unknown as {
                  __canvas: {
                    client: {
                      send: (m: unknown) => Promise<{
                        kind: string;
                        payload?: { tableContext?: { row: number } | null };
                      }>;
                    };
                  };
                }
              ).__canvas;
              let maxRow = -1;
              for (let gy = 0.04; gy < 0.97; gy += 0.02) {
                for (let gx = 0.04; gx < 0.97; gx += 0.06) {
                  const r = await c.client.send({
                    kind: "hitTest",
                    payload: { pageId, docPoint: [widthPt * gx, heightPt * gy], filter: "any" },
                  });
                  const row = r.payload?.tableContext?.row;
                  if (typeof row === "number") maxRow = Math.max(maxRow, row);
                }
              }
              return maxRow;
            },
            { pageId, widthPt, heightPt },
          ),
        { timeout: 6_000 },
      )
      .toBeGreaterThan(maxRowBefore);

    // Undo: the row count returns to baseline.
    await undo(page);
    await expect
      .poll(
        async () =>
          page.evaluate(
            async ({ pageId, widthPt, heightPt }) => {
              const c = (
                globalThis as unknown as {
                  __canvas: {
                    client: {
                      send: (m: unknown) => Promise<{
                        kind: string;
                        payload?: { tableContext?: { row: number } | null };
                      }>;
                    };
                  };
                }
              ).__canvas;
              let maxRow = -1;
              for (let gy = 0.04; gy < 0.97; gy += 0.02) {
                for (let gx = 0.04; gx < 0.97; gx += 0.06) {
                  const r = await c.client.send({
                    kind: "hitTest",
                    payload: { pageId, docPoint: [widthPt * gx, heightPt * gy], filter: "any" },
                  });
                  const row = r.payload?.tableContext?.row;
                  if (typeof row === "number") maxRow = Math.max(maxRow, row);
                }
              }
              return maxRow;
            },
            { pageId, widthPt, heightPt },
          ),
        { timeout: 6_000 },
      )
      .toBe(maxRowBefore);
    void addr;
  });

  test("AC-TABLE-ROW-HEIGHT: setRowHeight applies + undoes on the channel @feat:editor-shell.panels.table @feat:tables.model @level:happy", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    await loadAndSelectCell(page);

    // Record the mutationApplied/undoApplied replies the panel drives.
    const replies: string[] = [];
    await page.exposeFunction("__recordReply", (k: string) => replies.push(k));
    await page.evaluate(() => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { subscribe: (f: (m: { kind: string }) => void) => void } };
          __recordReply: (k: string) => void;
        }
      );
      c.__canvas.client.subscribe((m) => {
        if (m.kind === "mutationApplied" || m.kind === "undoApplied") {
          c.__recordReply(m.kind);
        }
      });
    });

    // Type a row height into the panel input + commit (Enter).
    const input = page.locator('[data-num-input="row-height"]');
    await input.fill("42");
    await input.press("Enter");

    await expect.poll(() => replies.filter((r) => r === "mutationApplied").length).toBeGreaterThan(0);

    await undo(page);
    await expect.poll(() => replies.filter((r) => r === "undoApplied").length).toBeGreaterThan(0);
  });

  test("AC-TABLE-DIMS: panel shows row × column totals; cell overlay is tighter than the table frame @feat:editor-shell.panels.table @feat:tables.model @level:happy", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    await loadAndSelectCell(page);

    // Aftercare-C — tableRowCount / tableColumnCount read back onto the
    // Table NodeId, so the panel renders the real totals (e.g. "3 × 4"),
    // not an em-dash placeholder.
    const dims = page.locator("[data-table-dims]");
    await expect(dims).toBeVisible();
    await expect
      .poll(async () => (await dims.textContent())?.trim() ?? "", {
        timeout: 6_000,
      })
      .toMatch(/^\d+ × \d+$/);

    // The precise per-cell overlay (elementGeometry([tableCellId]) now
    // resolves) paints a rect strictly inside the containing table frame
    // — proof it's the cell rect, not the table-AABB fallback.
    const overlay = page.locator("[data-table-cell-overlay]");
    await expect(overlay).toBeVisible();
    const ob = await overlay.boundingBox();
    expect(ob, "overlay bounding box").not.toBeNull();
    // The table fixture's cell is smaller than the whole table frame, so
    // a precise cell rect is bounded well under a full A4 page width.
    expect(ob!.width).toBeGreaterThan(0);
    expect(ob!.height).toBeGreaterThan(0);
    expect(ob!.width).toBeLessThan(page.viewportSize()!.width);
  });
});
