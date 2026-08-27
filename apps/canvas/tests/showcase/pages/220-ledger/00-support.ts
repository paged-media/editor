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

// Shared vocabulary for the ledger chapter (220) — paged.sheet driven
// through its real surfaces (the workbook panel, the grid panel's
// formula bar, the command registry) and FOUND on the page afterwards.
//
// Two doors this chapter needs that the driver does not carry:
//
//   · a FULL scene-tree diff (`treeElements`) — the sheet lowerings
//     report a boolean, not an id list, so what a lowering created is
//     learned by diffing `paged.tree()` before/after (the retired
//     07-spreadsheet page proved the recipe). String-id items only;
//     a TABLE rides a story, not the page tree, and is recovered
//     through the hit-test door instead (`tableAt`).
//
//   · the paged-parts listing (`listParts`) — the container's own
//     answer to "which plugin parts travel with this file", read
//     through the privileged wire door the editor's native-document
//     backend uses.

import type { Page } from "@playwright/test";

import { expect } from "@playwright/test";

import type { ShowcaseDoc } from "../../driver";
import { geometryOf } from "../../plugin-support";
import type { PageContext } from "../../types";

/** One string-id scene element, as `paged.tree()` reports it. */
export interface El {
  kind: string;
  id: string;
}

export const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";
export const GRID_PANEL = "media.paged.sheet.panel.grid";
export const SHEET_CMD = "media.paged.sheet.command";

/** E-Data grid arithmetic: 12 columns of 25 pt, 12 pt gutters — a run
 *  of `k` units spans `37k − 12` pt. Column widths cut this way land
 *  every table divider on a grid seam (the 25/12 rhythm). */
export const units = (k: number): number => 37 * k - 12;

/** Every string-id element in the document, in paint order, via
 *  `paged.tree()`. Structured ids (tables, cells) are not page items
 *  and are deliberately absent — see `tableAt` for those. */
export async function treeElements(page: Page): Promise<El[]> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.executeScript("paged.tree()");
    const tree = JSON.parse(reply.output[0] ?? "[]") as Array<
      Record<string, unknown>
    >;
    const out: Array<{ kind: string; id: string }> = [];
    const visit = (node: Record<string, unknown>) => {
      const id = node.id as { kind?: string; id?: unknown } | null | undefined;
      if (id && typeof id.kind === "string" && typeof id.id === "string") {
        out.push({ kind: id.kind, id: id.id });
      }
      for (const child of (node.children ?? []) as Array<
        Record<string, unknown>
      >) {
        visit(child);
      }
    };
    for (const root of tree) visit(root);
    return out;
  });
}

export const isNewEl =
  (before: El[]) =>
  (e: El): boolean =>
    !before.some((b) => b.kind === e.kind && b.id === e.id);

/** Poll until the tree grew past `before` AND the count settles (a
 *  chart lowering pours its labels in a second phase — sampling too
 *  early would translate half a chart). Returns the new elements. */
export async function settleNewElements(
  page: Page,
  before: El[],
  timeoutMs = 30_000,
): Promise<El[]> {
  const deadline = Date.now() + timeoutMs;
  let lastCount = 0;
  for (;;) {
    const fresh = (await treeElements(page)).filter(isNewEl(before));
    if (fresh.length > 0 && fresh.length === lastCount) return fresh;
    lastCount = fresh.length;
    if (Date.now() >= deadline) return fresh;
    await page.waitForTimeout(700);
  }
}

/**
 * Poll until two consecutive CPU snapshots of `pageIndex` are
 * identical — the page has stopped painting. The chart lowering's
 * phase-2 label pours resolve each label's story by hit-testing at the
 * label's ORIGINAL coordinates, and the panel button fires the whole
 * lowering without awaiting it: translating the elements while phase 2
 * is still pouring would move the labels out from under their own
 * hit tests. Waiting for paint to settle closes that race.
 */
export async function awaitRenderStable(
  doc: ShowcaseDoc,
  pageIndex: number,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let prev = await doc.renderPage(pageIndex);
  for (;;) {
    const next = await doc.renderPage(pageIndex);
    if (next.equals(prev)) return;
    prev = next;
    if (Date.now() >= deadline) return;
    await doc.page.waitForTimeout(400);
  }
}

/**
 * Translate-and-scale a lowering's elements as ONE batch:
 * `frameTransform = [s, 0, 0, s, dx, dy]` scales about the page origin
 * and then translates — the same trick for every element of a chart,
 * so the plugin's own measured geometry is preserved and only the
 * placement (and specimen scale) is chosen by the page. Refusals are
 * NOTED per element, never silently swallowed.
 */
export async function placeElements(
  doc: ShowcaseDoc,
  els: El[],
  s: number,
  dx: number,
  dy: number,
  notes: string[],
): Promise<void> {
  const ops = els.map((e) => ({
    op: "setElementProperty",
    args: {
      elementId: { kind: e.kind, id: e.id },
      path: "frameTransform",
      value: { type: "transform", value: [s, 0, 0, s, dx, dy] },
    },
  }));
  try {
    await doc.mutate("batch", { ops });
  } catch (err) {
    // Retry one by one so a single refusing element costs itself, not
    // the whole chart.
    for (const [i, op] of ops.entries()) {
      try {
        await doc.mutate(op.op, op.args);
      } catch (inner) {
        notes.push(
          `${els[i].kind}/${els[i].id} refused the placement transform: ${String(inner).slice(0, 120)}`,
        );
      }
    }
    void err;
  }
}

/**
 * Import a workbook through the panel's K-5 host file picker. Returns
 * `true` when the sheet engine booted and parsed (its range control
 * rendered); `false` with the panel's own boot-error text pushed into
 * `notes` otherwise — the honest gate every sheet module branches on.
 */
export async function importWorkbook(
  page: Page,
  absPath: string,
  notes: string[],
): Promise<boolean> {
  const pick = page.locator("[data-sheet-pick]");
  await expect(pick, "the workbook panel offers its file picker").toBeVisible({
    timeout: 15_000,
  });
  const chooser = page.waitForEvent("filechooser");
  await pick.click();
  await (await chooser).setFiles(absPath);
  const range = page.locator("[data-sheet-range]");
  try {
    await expect(range).toBeVisible({ timeout: 40_000 });
    return true;
  } catch {
    const bootError = await page
      .locator("[data-sheet-boot-error]")
      .first()
      .textContent()
      .catch(() => null);
    notes.push(
      "the paged.sheet engine wasm did NOT boot — the panel reported: " +
        (bootError ?? "(no boot-error message; the range control never rendered)"),
    );
    return false;
  }
}

// ── grid-panel formula bar ───────────────────────────────────────────
//
// The grid SVG's viewBox is content-space pt at PX_PER_PT = 1, so a
// click's cell depends on the WORKBOOK's own row heights and column
// widths — fixed pixel constants (the journeys' 18 px row step) bind
// the wrong cell the moment the scene's rows are 15 pt. This drive
// therefore CALIBRATES itself: two probe clicks read back through the
// formula bar's own cell badge yield the live origin and steps, the
// target click is computed from them, and the binding is verified —
// with a nudge loop for rounding — before anything is typed.

const columnLabel = (col: number): string => {
  let label = "";
  let c = col;
  for (;;) {
    label = String.fromCharCode(65 + (c % 26)) + label;
    c = Math.floor(c / 26) - 1;
    if (c < 0) return label;
  }
};

/** Parse the formula bar's cell badge ("C3") into zero-based (row, col);
 *  null for the unbound "—". */
const parseCellRef = (text: string | null): { row: number; col: number } | null => {
  const m = /^([A-Z]+)(\d+)$/.exec((text ?? "").trim());
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, col: col - 1 };
};

/** Click cell (row, col) in the grid SVG so the formula bar binds, and
 *  ASSERT it bound to that cell (the drive is honest about which cell
 *  it hit) — then the caller types. */
export async function selectGridCell(
  page: Page,
  row: number,
  col: number,
): Promise<void> {
  const svg = page.locator("[data-grid-svg-root]");
  await expect(svg, "the grid panel rendered its SVG").toBeVisible({
    timeout: 10_000,
  });
  const box = await svg.boundingBox();
  if (!box) throw new Error("grid SVG has no bounding box");
  const badge = page.locator("[data-formula-cellref]");
  const clickAndRead = async (
    x: number,
    y: number,
  ): Promise<{ row: number; col: number } | null> => {
    await page.mouse.click(box.x + x, box.y + y);
    await page.waitForTimeout(150);
    return parseCellRef(await badge.textContent());
  };

  // Two probes: near the origin, and a point far enough to cross both
  // a row and a column boundary (clamped inside the SVG).
  const p1x = 18;
  const p1y = 7;
  const p1 = await clickAndRead(p1x, p1y);
  const p2x = Math.min(box.width - 14, 150);
  const p2y = Math.min(box.height - 8, 70);
  const p2 = await clickAndRead(p2x, p2y);
  if (!p1 || !p2 || p2.col === p1.col || p2.row === p1.row) {
    throw new Error(
      `grid calibration failed: probes bound ${JSON.stringify(p1)} / ${JSON.stringify(p2)}`,
    );
  }
  const colStep = (p2x - p1x) / (p2.col - p1.col);
  const rowStep = (p2y - p1y) / (p2.row - p1.row);

  let x = p1x + (col - p1.col) * colStep;
  let y = p1y + (row - p1.row) * rowStep;
  let got: { row: number; col: number } | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    got = await clickAndRead(Math.max(4, x), Math.max(4, y));
    if (got && got.row === row && got.col === col) return;
    if (got) {
      x += (col - got.col) * colStep;
      y += (row - got.row) * rowStep;
    } else {
      x = Math.max(4, x - colStep / 2);
      y = Math.max(4, y - rowStep / 2);
    }
  }
  throw new Error(
    `the formula bar would not bind ${columnLabel(col)}${row + 1} — last ` +
      `bound ${got ? `${columnLabel(got.col)}${got.row + 1}` : "nothing"} ` +
      `(steps ${colStep.toFixed(1)}×${rowStep.toFixed(1)})`,
  );
}

/** Type a formula (or literal) into the bound cell and commit. The
 *  engine recomputes the dirty cut in Rust before this returns. */
export async function enterCell(
  page: Page,
  row: number,
  col: number,
  value: string,
): Promise<void> {
  await selectGridCell(page, row, col);
  const fb = page.locator("[data-formula-input]");
  await expect(fb).toBeEnabled({ timeout: 8_000 });
  await fb.fill(value);
  await fb.press("Enter");
  await page.waitForTimeout(250);
}

// ── read doors ───────────────────────────────────────────────────────

/** The `(storyId, tableId)` under a page-space point — the W3.A1
 *  hit-test door, the ONLY outside way to address a table the plugin
 *  minted (the scene tree carries no table nodes). Filter `any` — the
 *  same one the plugin SDK's own `document.hitTest` defaults to; the
 *  `text` filter answered null over a freshly poured table. */
export async function tableAt(
  page: Page,
  pageId: string,
  x: number,
  y: number,
  filter: "any" | "text" | "frame" = "any",
): Promise<{ storyId: string | null; tableId: string | null }> {
  return page.evaluate(
    async ({ pageId, x, y, filter }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              send: (m: unknown) => Promise<{
                kind: string;
                payload: {
                  storyId?: string | null;
                  tableContext?: { tableId: string } | null;
                };
              }>;
            };
          };
        }
      ).__canvas;
      const reply = await c.client.send({
        kind: "hitTest",
        payload: { pageId, docPoint: [x, y], filter },
      });
      return {
        storyId: reply.payload.storyId ?? null,
        tableId: reply.payload.tableContext?.tableId ?? null,
      };
    },
    { pageId, x, y, filter },
  );
}

/** Poll {@link tableAt} until it answers a table (a fresh pour needs a
 *  compose before the hit path sees it), or time out with whatever the
 *  last answer was. */
export async function settleTableAt(
  doc: ShowcaseDoc,
  pageIndex: number,
  pageId: string,
  x: number,
  y: number,
  timeoutMs = 20_000,
): Promise<{ storyId: string | null; tableId: string | null }> {
  const deadline = Date.now() + timeoutMs;
  let best: { storyId: string | null; tableId: string | null } = {
    storyId: null,
    tableId: null,
  };
  // Alternate the hit filters: the ANY hit answers the frame's story
  // even over an uncomposed pour, while the TEXT hit is the one that
  // carries the W3.A1 tableContext once the page has composed.
  const filters: Array<"any" | "text"> = ["any", "text"];
  for (let i = 0; ; i += 1) {
    await doc.renderPage(pageIndex); // force the compose the hit path reads
    const got = await tableAt(doc.page, pageId, x, y, filters[i % 2]);
    if (got.storyId && !best.storyId) best = got;
    if (got.tableId) return got;
    if (Date.now() >= deadline) return best;
    await doc.page.waitForTimeout(500);
  }
}

/** The `.paged` container parts under `prefix` — the privileged
 *  `listPagedParts` wire door (the same one the editor's
 *  native-document backend reads). */
export async function listParts(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate(async (prefix) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            send: (m: unknown) => Promise<{
              kind: string;
              payload: { paths?: string[] };
            }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.send({
      kind: "listPagedParts",
      payload: { prefix },
    });
    return reply.kind === "pagedPartList" ? (reply.payload.paths ?? []) : [];
  }, prefix);
}

/** The overset flag of one story, read AFTER a render pass (the flag
 *  derives from build diagnostics). `null` when the story is unknown. */
export async function storyOverset(
  page: Page,
  storyId: string,
): Promise<boolean | null> {
  const raw = await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.executeScript("paged.stories()");
    return reply.output[0] ?? "[]";
  });
  const summaries = JSON.parse(raw) as Array<{
    selfId: string;
    overset?: boolean;
  }>;
  const hit = summaries.find((s) => s.selfId === storyId);
  return hit ? (hit.overset ?? false) : null;
}

// ── native-table cell pours (v54/v55 cell doors) ─────────────────────

/** Pour text into one cell (cell-local offset space, protocol v54). */
export async function pourCell(
  doc: ShowcaseDoc,
  storyId: string,
  tableId: string,
  row: number,
  col: number,
  text: string,
): Promise<void> {
  await doc.mutate("insertText", {
    storyId,
    offset: 0,
    text,
    cell: { tableId, row, col },
  });
}

/** Pour + paragraph-style one cell. Cell-local applyStyle offsets are
 *  CONTIGUOUS characters (the recorded offset-convention split). */
export async function pourStyledCell(
  doc: ShowcaseDoc,
  storyId: string,
  tableId: string,
  row: number,
  col: number,
  text: string,
  styleId: string,
): Promise<void> {
  await pourCell(doc, storyId, tableId, row, col, text);
  const contiguous = [...text.replace(/\n/g, "")].length;
  await doc.mutate("applyStyle", {
    storyId,
    start: 0,
    end: contiguous,
    style: styleId,
    scope: "paragraph",
    cell: { tableId, row, col },
  });
}

/** Readable cell padding as ONE batch (the fixture's cell styles carry
 *  no insets; flush-to-rule figures read badly). */
export async function insetCells(
  doc: ShowcaseDoc,
  storyId: string,
  tableId: string,
  cells: Array<[row: number, col: number]>,
  inset = 6,
): Promise<void> {
  const ops: Array<{ op: string; args: unknown }> = [];
  for (const [row, col] of cells) {
    for (const path of ["cellInsetLeft", "cellInsetRight"]) {
      ops.push({
        op: "setElementProperty",
        args: {
          elementId: {
            kind: "tableCell",
            id: { story_id: storyId, table_id: tableId, row, col },
          },
          path,
          value: { type: "length", value: inset },
        },
      });
    }
  }
  await doc.mutate("batch", { ops });
}


const offsetCache = new Map<string, [number, number]>();

/**
 * Where this page's STORED coordinates sit relative to page-local ones
 * — [0,0] on a spread's origin page, [540,0] on the facing page of
 * this fixture. MEASURED with a transient probe (same discipline as
 * the drawing-office kit, which found the seam): wire inserts re-base
 * page-local anchors by the spread origin while transforms/geometry
 * speak stored coords, so any post-insert placement must fold this
 * offset in or artwork lands one page width off. → Appendix A.
 */
export async function spreadOffset(
  ctx: PageContext,
  pageId: string,
): Promise<[number, number]> {
  const hit = offsetCache.get(pageId);
  if (hit) return hit;
  const probe: [number, number, number, number] = [10, 10, 26, 26];
  const id = await ctx.doc.rectangle(pageId, probe);
  const geo = await geometryOf(ctx.page, [{ kind: "rectangle", id }]);
  await ctx.doc.mutate("deleteFrame", { frameId: id });
  const bounds = geo[0]?.bounds;
  if (!bounds) {
    throw new Error(`spread-offset probe on ${pageId} answered no geometry`);
  }
  const off: [number, number] = [bounds[1] - probe[0], bounds[0] - probe[1]];
  offsetCache.set(pageId, off);
  return off;
}
