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

// The container, opened — p124, E-Data verso. A `.paged` file is a
// structurally valid IDML package whose extra tenants ride alongside:
// each plugin owns a `paged/<plugin-id>/` subtree of parts that
// travel WITH the document. This page asks the container itself what
// it carries (`listPagedParts`), prints the answer as the parts-index
// table, then exercises the write half of the same door: a small
// manifest note authored INTO `paged/annual/manifest-note.json` with
// `caller` unset — so the engine's only judge is the `paged/` prefix
// — and read back byte-for-byte through `readPagedPart`.
//
// The ROLE column mirrors the bundles' own `contributes.partTypes`
// declarations (spec / source / derived), matched by part shape; the
// container path itself carries no role metadata, and the caption
// says so.

import { expect } from "@playwright/test";

import { proseFrame, specLabel } from "../../annual-support";
import { STYLE, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { dataTable, listParts, readPart, units, writePart } from "./00-support";

const NOTE_PATH = "paged/annual/manifest-note.json";
const MAX_ROWS = 10;

/** The bundles' declared part roles, matched by (plugin, shape). This
 *  mirrors `contributes.partTypes` in each manifest — the container
 *  path carries no role field, which the caption states. */
function roleOf(plugin: string, rest: string): string {
  if (plugin === "annual") return "note (this document)";
  if (plugin === "media.paged.sheet") return "source";
  if (plugin === "media.paged.doc") {
    return rest.endsWith(".docx") ? "source" : "derived";
  }
  if (plugin === "media.paged.web") return "spec";
  if (plugin === "media.paged.draw") return "spec";
  if (plugin === "media.paged.data") return "source";
  if (plugin === "media.paged.image") return "source";
  return "—";
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(124);
  const [left, top, right] = contentBox(page);

  const head = await proseFrame(ctx, page, [left, top, right, top + 32], [
    { text: "The container, opened", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // ── write first, so the listing below includes this page's part ──
  const before = await listParts(ctx.page, "paged/");
  const manifestNote = {
    document: "The Paged Annual, Volume One",
    writtenBy: "chapter 300-press, p124",
    note: "The full coverage ledger is written at assembly.",
  };
  const noteBytes = Array.from(
    new TextEncoder().encode(`${JSON.stringify(manifestNote, null, 2)}\n`),
  );
  await writePart(ctx.page, NOTE_PATH, noteBytes);
  const readBack = await readPart(ctx.page, NOTE_PATH);
  expect(readBack.found, `${NOTE_PATH} reads back after the write`).toBe(true);
  expect(
    readBack.bytes.length,
    "the part reads back byte-for-byte",
  ).toBe(noteBytes.length);
  const roundTrip = JSON.parse(
    new TextDecoder().decode(Uint8Array.from(readBack.bytes)),
  ) as typeof manifestNote;
  expect(roundTrip.note, "the JSON survives the container").toBe(
    manifestNote.note,
  );
  const parts = (await listParts(ctx.page, "paged/")).sort();
  notes.push(
    `listPagedParts paged/ — ${before.length} part(s) before this page, ` +
      `${parts.length} after; ${NOTE_PATH} written (caller unset) and read ` +
      `back ${readBack.bytes.length} bytes`,
  );

  const intro = await proseFrame(ctx, page, [left, top + 40, right, top + 146], [
    {
      text:
        "A .paged file is a valid IDML package with tenants. Every plugin that worked on this book may leave parts under its own paged/ namespace — a workbook, a web source, a recipe — and they travel with the file, opaque to the IDML half and untouched by it. Below is the container's own answer to what it carries at this moment of the build: " +
        `${parts.length} part(s), listed by the same listPagedParts door the editor's native-document backend reads.`,
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(intro.frameId);

  // ── the parts index ──────────────────────────────────────────────
  const grouped = parts
    .map((path) => {
      const segs = path.replace(/^paged\//, "").split("/");
      const plugin = segs[0] ?? "?";
      const rest = segs.slice(1).join("/") || "—";
      return { plugin, rest };
    })
    .sort((a, b) =>
      a.plugin === b.plugin
        ? a.rest.localeCompare(b.rest)
        : a.plugin.localeCompare(b.plugin),
    );
  const shown = grouped.slice(0, MAX_ROWS);
  const rows: string[][] = shown.map((g) => [
    truncate(g.rest, 52),
    g.plugin.replace(/^media\.paged\./, "paged."),
    roleOf(g.plugin, g.rest),
  ]);
  if (grouped.length > MAX_ROWS) {
    rows.push(["…", `${grouped.length - MAX_ROWS} more part(s)`, ""]);
  }
  const tableTop = top + 156;
  const rowHeight = Math.max(20, Math.min(28, Math.floor(220 / rows.length)));
  const table = await dataTable(
    ctx,
    page,
    [left, tableTop, right, Math.min(500, tableTop + 62 + rows.length * rowHeight)],
    {
      caption:
        "Table 20·2 — the parts index, grouped by plugin. Roles are the bundles' own partTypes declarations; the path carries none.",
      colWidths: [units(6), units(3), 432 - units(6) - units(3)],
      headers: ["PART", "PLUGIN", "ROLE"],
      rows,
      rowHeight,
    },
  );
  elements.push(table.frameId);
  const tableBottom = Math.min(500, tableTop + 62 + rows.length * rowHeight);

  // ── the round trip, printed ──────────────────────────────────────
  const rt = await proseFrame(ctx, page, [left, tableBottom + 16, right, 630], [
    { text: "One part, written and read back", style: STYLE.head2 },
    {
      text: `writePagedPart ${NOTE_PATH} · caller unset · ${noteBytes.length} bytes in`,
      style: STYLE.codeBlock,
    },
    {
      text: `readPagedPart → found · ${readBack.bytes.length} bytes out · note: “${roundTrip.note}”`,
      style: STYLE.codeBlock,
    },
    {
      text:
        "The write went through the same wire door a plugin's host.parts uses, with the caller field left unset — the engine then enforces only the paged/ boundary (a named caller is additionally confined to its own subtree). The bytes came back equal, and from the next save on, the note travels inside the file. " +
        (before.length === 0
          ? "In this solo build the note is the container's only tenant; in the chain build the studios' workbooks, sources and recipes ride beside it."
          : `It joins the ${before.length} part(s) the studios had already checked in.`),
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(rt.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 190",
      "listPagedParts · writePagedPart · readPagedPart",
      "caller unset — the paged/ namespace gate",
    ]),
  );

  return {
    title: "The container, opened — parts listed, written, read back",
    covers: [
      "package-anatomy.paged-container",
      "package-anatomy.paged-parts-door",
    ],
    elements,
    notes,
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
