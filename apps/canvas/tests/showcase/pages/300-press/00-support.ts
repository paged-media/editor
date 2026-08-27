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

// Shared vocabulary for the press chapter (300) — the export doors
// driven for real and their answers printed as native tables.
//
// Three doors this chapter opens that no earlier chapter did:
//
//   · `client.exportPdf` in-module (04-preflight) — the full session
//     loop begin→pages→finish, run INSIDE the page evaluate so the
//     serialized PDF never crosses CDP: only its byte COUNT plus the
//     diagnostics and structured preflight findings come back to Node.
//     The bytes are discarded where they were born; the proof itself
//     is the assembly's to write.
//
//   · the three container part doors as a round trip (05-container) —
//     `listPagedParts` / `writePagedPart` / `readPagedPart`, with
//     `caller` UNSET on the write: the engine then enforces only the
//     `paged/` namespace boundary (C-34's caller gate is an honesty
//     aid for plugins, not a wall this document needs).
//
//   · `dataTable` — the E-Data ledger-table recipe (frame → caption →
//     insertTable → header band → cell pours → insets → table style),
//     lifted from the table chapter's proven mechanics so the three
//     data pages here print their evidence the same way p66 did.

import type { Page } from "@playwright/test";

import { assignLayer } from "../../annual-support";
import type { Bounds, ShowcaseDoc } from "../../driver";
import { LAYER, STYLE, TABLE_STYLE } from "../../names-annual";
import type { PageContext } from "../../types";

/** E-Data grid arithmetic: 12 columns of 25 pt, 12 pt gutters — a run
 *  of `k` units spans `37k − 12` pt (the ledger chapter's rule). */
export const units = (k: number): number => 37 * k - 12;

// ── the parts doors ──────────────────────────────────────────────────

/** The `.paged` container parts under `prefix` — the privileged
 *  `listPagedParts` wire door (the editor's native-document backend
 *  reads the same one). */
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

/**
 * Write one container part with `caller` UNSET — the wire's
 * `writePagedPart {path, bytes, caller?}` with the optional field
 * omitted, so the engine's only judge is the `paged/` prefix.
 * Throws on any reply that is not `pagedPartWritten`.
 */
export async function writePart(
  page: Page,
  path: string,
  bytes: number[],
): Promise<void> {
  const kind = await page.evaluate(
    async ({ path, bytes }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              send: (m: unknown) => Promise<{
                kind: string;
                payload?: { error?: string };
              }>;
            };
          };
        }
      ).__canvas;
      const reply = await c.client.send({
        kind: "writePagedPart",
        payload: { path, bytes },
      });
      return reply.kind === "pagedPartFailed"
        ? `pagedPartFailed: ${reply.payload?.error ?? "?"}`
        : reply.kind;
    },
    { path, bytes },
  );
  if (kind !== "pagedPartWritten") {
    throw new Error(`writePagedPart ${path} answered ${kind}`);
  }
}

/** Read one container part back. `found: false` is an answer, not an
 *  error — the caller decides which it is. */
export async function readPart(
  page: Page,
  path: string,
): Promise<{ found: boolean; bytes: number[] }> {
  return page.evaluate(async (path) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            send: (m: unknown) => Promise<{
              kind: string;
              payload: { found?: boolean; bytes?: number[] };
            }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.send({
      kind: "readPagedPart",
      payload: { path },
    });
    if (reply.kind !== "pagedPartRead") {
      return { found: false, bytes: [] as number[] };
    }
    return {
      found: reply.payload.found ?? false,
      bytes: reply.payload.bytes ?? [],
    };
  }, path);
}

// ── the preflight door ───────────────────────────────────────────────

/** One structured preflight finding, as `pdfExported` reports it. */
export interface Finding {
  code: string;
  severity: string;
  message: string;
  pageIndex?: number | null;
}

/**
 * Run the REAL `client.exportPdf` (begin → one call per page →
 * finish) inside the page and keep only what a preflight needs: the
 * byte count, the flat diagnostics, and the structured findings. The
 * PDF bytes are dropped in the browser — serialising a whole book
 * through CDP to throw it away in Node would be cost without purpose.
 */
export async function preflight(
  page: Page,
  standard: string,
): Promise<{ pdfBytes: number; diagnostics: string[]; findings: Finding[] }> {
  return page.evaluate(async (standard) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            exportPdf: (o: unknown) => Promise<{
              bytes: Uint8Array;
              diagnostics: string[];
              findings: Array<{
                code: string;
                severity: string;
                message: string;
                pageIndex?: number | null;
              }>;
            }>;
          };
        };
      }
    ).__canvas;
    const out = await c.client.exportPdf({ standard });
    return {
      pdfBytes: out.bytes.length,
      diagnostics: out.diagnostics,
      findings: out.findings,
    };
  }, standard);
}

// ── the ledger table ─────────────────────────────────────────────────

export interface TableSpec {
  caption: string;
  /** Column widths in pt; their sum should be the 432 pt measure. */
  colWidths: number[];
  headers: string[];
  rows: string[][];
  /** Columns set in Table Number (figures) rather than Table Body. */
  numberCols?: number[];
  /** Body-row height in pt (default 24; give wrapped prose more). */
  rowHeight?: number;
}

/**
 * A captioned native table in an E-Data frame — the table chapter's
 * p66 mechanics as one call. The caption pours FIRST (the table
 * attaches after it), the header band arrives via `insertHeaderRow`,
 * every cell is poured + styled through the v54/v55 cell doors, and
 * the fixture's "Annual Table" region cascade does the dressing.
 */
export async function dataTable(
  ctx: PageContext,
  pageIndex: number,
  box: Bounds,
  spec: TableSpec,
): Promise<{ frameId: string; storyId: string; tableId: string }> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[ctx.pageIndexes.indexOf(pageIndex)];
  const frameId = await doc.textFrame(pageId, box);
  await assignLayer(ctx, "textFrame", frameId, LAYER.content);
  const storyId = await doc.storyOf(pageId, box);

  await doc.insertText(storyId, spec.caption, 0);
  await doc.applyStyle(
    storyId,
    0,
    [...spec.caption].length,
    await doc.paragraphStyle(STYLE.caption),
    "paragraph",
  );

  const created = await doc.mutate("insertTable", {
    storyId,
    rows: spec.rows.length,
    cols: spec.colWidths.length,
    headerRows: 0,
    footerRows: 0,
    columnWidths: spec.colWidths,
    rowHeights: spec.rows.map(() => spec.rowHeight ?? 24),
  });
  const tableId = bareTableId(created);
  await doc.mutate("insertHeaderRow", { storyId, tableId });
  await doc.mutate("setRowHeight", { storyId, tableId, row: 0, height: 26 });

  const tableHead = await doc.paragraphStyle(STYLE.tableHead);
  const tableBody = await doc.paragraphStyle(STYLE.tableBody);
  const tableNumber = await doc.paragraphStyle(STYLE.tableNumber);
  const numberCols = new Set(spec.numberCols ?? []);

  for (const [col, label] of spec.headers.entries()) {
    await pourStyledCell(doc, storyId, tableId, 0, col, label, tableHead);
  }
  for (const [i, row] of spec.rows.entries()) {
    for (const [col, text] of row.entries()) {
      if (text.length === 0) continue;
      await pourStyledCell(
        doc,
        storyId,
        tableId,
        1 + i,
        col,
        text,
        numberCols.has(col) ? tableNumber : tableBody,
      );
    }
  }

  // Readable padding, one batch — flush-to-rule figures read badly.
  const insetOps: Array<{ op: string; args: unknown }> = [];
  for (let r = 0; r <= spec.rows.length; r += 1) {
    for (let c = 0; c < spec.colWidths.length; c += 1) {
      for (const path of ["cellInsetLeft", "cellInsetRight"]) {
        insetOps.push({
          op: "setElementProperty",
          args: {
            elementId: {
              kind: "tableCell",
              id: { story_id: storyId, table_id: tableId, row: r, col: c },
            },
            path,
            value: { type: "length", value: 5 },
          },
        });
      }
    }
  }
  await doc.mutate("batch", { ops: insetOps });

  const styles = (await doc.designer.collection(
    "tableStyles",
  )) as unknown as Array<{ selfId: string; name?: string }>;
  const annual = styles.find((s) => s.name === TABLE_STYLE);
  if (!annual) {
    throw new Error(
      `tableStyles has no entry named ${JSON.stringify(TABLE_STYLE)} — have ` +
        `[${styles.map((s) => s.name ?? "?").join(", ")}]`,
    );
  }
  await doc.setProperty(
    "table",
    { story_id: storyId, table_id: tableId },
    "appliedTableStyle",
    { type: "text", value: annual.selfId },
  );

  return { frameId, storyId, tableId };
}

/** The bare `table_id` from whatever `insertTable` handed back —
 *  `insertTable` mints a STRUCTURED id; reading it as a string is a
 *  bug paged.sheet already shipped once. */
export function bareTableId(created: unknown): string {
  if (created && typeof created === "object") {
    const t = (created as { table_id?: unknown }).table_id;
    if (typeof t === "string" && t.length > 0) return t;
  }
  if (typeof created === "string" && created.length > 0) return created;
  throw new Error(
    `insertTable minted no addressable table id: ${JSON.stringify(created)}`,
  );
}

/** Pour + paragraph-style one cell (cell-local offsets, v54/v55). The
 *  applyStyle length is CONTIGUOUS characters — the recorded
 *  offset-convention split. */
export async function pourStyledCell(
  doc: ShowcaseDoc,
  storyId: string,
  tableId: string,
  row: number,
  col: number,
  text: string,
  styleId: string,
): Promise<void> {
  await doc.mutate("insertText", {
    storyId,
    offset: 0,
    text,
    cell: { tableId, row, col },
  });
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
