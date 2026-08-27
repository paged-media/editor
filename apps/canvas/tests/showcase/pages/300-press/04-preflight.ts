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

// The preflight — p123, E-Data recto. This page runs the REAL export:
// `client.exportPdf({standard: "pdf17"})` over the whole document as
// it stands at this moment of the build, keeps the diagnostics and
// the structured preflight findings, and discards the bytes where
// they were made (the proof itself is the assembly's to write). What
// the door reported is printed below as a native table — including,
// honestly, a table with nothing in it, because a clean preflight is
// a result, not an absence.

import { expect } from "@playwright/test";

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { dataTable, preflight, units } from "./00-support";

const MAX_ROWS = 9;

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(123);
  const [left, top, right] = contentBox(page);

  const head = await proseFrame(ctx, page, [left, top, right, top + 32], [
    { text: "The preflight", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // ── the real export, run first so the page prints facts ──────────
  const t0 = Date.now();
  const result = await preflight(ctx.page, "pdf17");
  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  notes.push(
    `exportPdf standard=pdf17 — ${result.pdfBytes} bytes (discarded), ` +
      `${result.diagnostics.length} diagnostic(s), ` +
      `${result.findings.length} finding(s), ${seconds}s`,
  );
  expect(
    result.pdfBytes,
    "the export session produced a PDF (bytes counted, then discarded)",
  ).toBeGreaterThan(1000);

  const intro = await proseFrame(ctx, page, [left, top + 40, right, top + 148], [
    {
      text:
        "A preflight is the press asking its questions early. While this page was built, the document you are holding went through the real export door — client.exportPdf, standard PDF 1.7, the same begin-page-finish session the File menu drives — and answered for every page it had. The serialized proof came back " +
        `${formatBytes(result.pdfBytes)} long and was discarded on the spot; what this page keeps is the export's judgment: ` +
        `${result.diagnostics.length} diagnostic line(s) and ${result.findings.length} structured finding(s), printed verbatim below.`,
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(intro.frameId);

  // ── the codes, explained (fixed layout — the table below is the
  //    dynamic half and takes the remaining space) ───────────────────
  const explain = await proseFrame(ctx, page, [left, top + 156, right, top + 336], [
    {
      text:
        "Two codes carry most preflights. font_not_embeddable names a face whose fsType licence forbids embedding: the exporter follows its policy — outline the glyphs, or fail the export — rather than ship a file the licence disallows. image_missing_bytes names a placed link whose pixels never arrived; the page paints its proxy, and a proof would too, so the finding says it before the press does. Each finding arrives with a severity and the page it was raised on, which is what turns a warning list into a work list.",
      style: STYLE.body,
    },
    {
      text:
        `Beneath the findings runs the flat diagnostics channel — ${result.diagnostics.length} line(s) on this run` +
        (result.diagnostics.length > 0
          ? `, the first of them: “${truncate(result.diagnostics[0], 130)}”`
          : ", i.e. nothing to report") +
        ". The findings are the structured half of the same story (protocol 62 carries both), and this document elects to print the structured one.",
      style: STYLE.body,
    },
  ]);
  elements.push(explain.frameId);

  // ── the findings, as a native table ──────────────────────────────
  const shown = result.findings.slice(0, MAX_ROWS);
  const rows: string[][] =
    result.findings.length === 0
      ? [
          [
            "—",
            "clean",
            "—",
            "0 findings: every face embeddable, every placed image carrying bytes",
          ],
        ]
      : shown.map((f) => [
          f.code,
          f.severity,
          f.pageIndex === null || f.pageIndex === undefined
            ? "doc"
            : String(f.pageIndex + 1),
          truncate(f.message, result.findings.length > 4 ? 110 : 220),
        ]);
  if (result.findings.length > MAX_ROWS) {
    rows.push([
      "…",
      "",
      "",
      `${result.findings.length - MAX_ROWS} further finding(s) not printed — the count is the fact`,
    ]);
  }
  // The body rows share the space left above the apparatus band.
  const tableTop = top + 348;
  const rowHeight = Math.max(
    22,
    Math.min(40, Math.floor((630 - tableTop - 66) / rows.length)),
  );
  const table = await dataTable(
    ctx,
    page,
    [left, tableTop, right, Math.min(634, tableTop + 66 + rows.length * rowHeight)],
    {
      caption:
        "Table 20·1 — preflight findings, exactly as the pdfExported reply carried them.",
      colWidths: [units(3), 50, 38, 432 - units(3) - 50 - 38],
      headers: ["CODE", "SEV.", "PAGE", "FINDING"],
      rows,
      rowHeight,
    },
  );
  elements.push(table.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 189",
      "client.exportPdf standard=pdf17 (in-module)",
      "bytes discarded · diagnostics + findings kept",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "The preflight here runs standard pdf17 over the in-build document; " +
        "the PDF/X-4 pass with output intent, ConvertToDestination and " +
        "marks belongs to the assembly, on the finished book. → Appendix A",
    ),
  );

  return {
    title: "The preflight — the export door's own findings",
    covers: ["the-renderer.pdf-export", "the-renderer.export-diagnostics"],
    elements,
    notes,
  };
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} bytes`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
