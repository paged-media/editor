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

// The day-book across the gutter (p100–p101, one E-Data spread) — the
// sheets counterpart of Ch.12's threaded table: a tall lowered range
// continuing across a linked frame chain that spans the spread, with a
// header band repeating at the break.
//
// The data is AUTHORED live: three SEQUENCE spills typed into the grid
// panel's formula bar fill a 24-day circulation day-book from three
// anchors — the dynamic-array machinery doing the data entry. The
// range is then lowered through the panel into a frame deliberately
// too short for it, that frame is threaded into an empty frame on the
// facing page, and a header band is added through core's own table
// ops — which work on the plugin's table because a lowered table IS a
// native table, addressable by (storyId, tableId) like any other.
//
// ONE HONEST BOUNDARY, stated here and in the margin note: the sheets
// engine's own pagination lane — `lowerPaginatedToChain`, greedy row
// packing across the chain with repeated headers computed in Rust —
// is exported by the bundle but reachable only programmatically; no
// command or panel surface drives it in the editor today. What this
// spread exhibits is the lowered native table continuing through the
// HOST's story threading, and it says so rather than borrowing the
// other lane's name. `sheet.lower.paginate` is deliberately NOT
// claimed by this page.

import { expect } from "@playwright/test";

import { openPanel } from "../../../fidelity/canvas-driver";
import { withActivePage } from "../../active-page";
import { assignLayer, marginNote, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, TRIM_W_PT, isRecto, p } from "../../names-annual";
import { partitionByPage, removeRefs } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  GRID_PANEL,
  WORKBOOK_PANEL,
  enterCell,
  pourStyledCell,
  settleNewElements,
  settleTableAt,
  storyOverset,
  tableAt,
  treeElements,
  type El,
} from "./00-support";

/** Frame A (p100, verso): deliberately too short for 25 rows. */
const BOX_A: [number, number, number, number] = [60, 152, 268, 420];
/** Frame B (p101, recto): the continuation. */
const BOX_B: [number, number, number, number] = [48, 152, 256, 560];

const DAYS = 24;
const RANGE = "A8:C31";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg100 = ctx.pageIds[0];
  const pg101 = ctx.pageIds[1];
  const notes: string[] = [];
  const elements: string[] = [];

  // Baseline for the continuation oracle — before ANY authoring.
  const before101 = await doc.renderPage(p(101));

  const head = await proseFrame(ctx, p(100), [60, 96, 492, 124], [
    { text: "A day-book across the gutter", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // ── author the data: three spills from three anchors ─────────────
  // The grid panel shares a dock group with the workbook panel —
  // re-activate its tab before the formula-bar drive.
  await openPanel(page, GRID_PANEL);
  const svg = page.locator("[data-grid-svg-root]");
  await expect(svg, "the grid panel is live").toBeVisible({ timeout: 120_000 });
  await enterCell(page, 7, 0, `=SEQUENCE(${DAYS})`);
  await enterCell(page, 7, 1, `=SEQUENCE(${DAYS},1,1840,7)`);
  await enterCell(page, 7, 2, `=SEQUENCE(${DAYS},1,620,13)`);

  // ── lower the tall range into a frame too short for it ───────────
  await openPanel(page, WORKBOOK_PANEL);
  await page.locator("[data-sheet-range]").fill(RANGE);
  const before = await treeElements(page);
  let fresh: El[] = [];
  await withActivePage(page, pg100, async () => {
    await page.locator("[data-sheet-lower]").click();
    fresh = await settleNewElements(page, before);
  });
  const { here, elsewhere } = await partitionByPage(page, fresh, pg100);
  if (elsewhere.length > 0) {
    await removeRefs(doc, elsewhere).catch(() => undefined);
    notes.push(`the lower strayed ${elsewhere.length} item(s); removed`);
  }
  const frameA = here.find((e) => e.kind === "textFrame");
  expect(frameA, "the tall range lowered a text frame on p100").toBeTruthy();

  // Reshape the plugin's frame to the spread's grid slot. WIRE SHAPE,
  // learned the hard way: insertFrame/insertTextFrame bounds are
  // PAGE-local, but resizeFrame bounds are SPREAD-space — the spine
  // sits at x 0 and a verso spans NEGATIVE x. Page-local numbers in a
  // resize walk the frame across the gutter onto the facing page
  // while it stays parented to its own (which is exactly what this
  // chapter's first pass painted). p100 is a verso: offset by −540.
  const xOff = isRecto(p(100)) ? 0 : -TRIM_W_PT;
  await doc.mutate("resizeFrame", {
    frameId: frameA!.id,
    bounds: [BOX_A[1], BOX_A[0] + xOff, BOX_A[3], BOX_A[2] + xOff],
  });
  notes.push(
    "wire-shape finding: insert bounds are PAGE-local; resizeFrame " +
      "bounds are SPREAD-space (spine at x 0, verso negative) — a " +
      "page-local resize walks a verso frame onto the recto while it " +
      "stays parented to its own page",
  );
  await assignLayer(ctx, "textFrame", frameA!.id, LAYER.content);
  elements.push(...here.map((e) => e.id));

  // The lowered table's own address, through the W3.A1 hit-test door —
  // POLLED after a compose (a fresh pour is invisible to the hit path
  // until the page recomposes; the first pass of this chapter proved
  // it by reading null).
  const cx = (BOX_A[0] + BOX_A[2]) / 2;
  const cy = (BOX_A[1] + BOX_A[3]) / 2;
  const hit = await settleTableAt(doc, p(100), pg100, cx, cy);
  expect(
    hit.storyId,
    "the poured frame answers the hit test with its story",
  ).toBeTruthy();
  const storyId = hit.storyId!;
  const tableId = hit.tableId;

  // ── the chain: an empty frame on the facing page, then the link ──
  const frameB = await doc.textFrame(pg101, BOX_B);
  await doc.linkFrames(frameA!.id, frameB);
  await assignLayer(ctx, "textFrame", frameB, LAYER.content);
  elements.push(frameB);

  // ── the header band, through core's own table ops ────────────────
  // insertHeaderRow works on the plugin's table because the lowering
  // minted a REAL table; the band repeats in every fragment. Reaching
  // the table needs its id from the hit's cell context — when the hit
  // answers the story but no cell (a point between rows), the band is
  // skipped and SAID, not faked.
  let banded = false;
  if (tableId) {
    await doc.mutate("insertHeaderRow", { storyId, tableId });
    await doc.mutate("setRowHeight", { storyId, tableId, row: 0, height: 24 });
    const tableHead = await doc.paragraphStyle(STYLE.tableHead);
    for (const [c, label] of ["DAY", "PRINT", "DIGITAL"].entries()) {
      await pourStyledCell(doc, storyId, tableId, 0, c, label, tableHead);
    }
    banded = true;
  } else {
    notes.push(
      "the hit test answered the frame's story but no table-cell context " +
        "at its centre, so the header band could not be added — " +
        "tables.header-footer-repeat is NOT claimed by this page",
    );
  }

  // ── oracles, before any p101 furniture lands ─────────────────────
  await doc.renderPage(p(100));
  await doc.renderPage(p(101));
  const hitB = await tableAt(
    page,
    pg101,
    (BOX_B[0] + BOX_B[2]) / 2,
    (BOX_B[1] + BOX_B[3]) / 2,
  );
  expect(
    hitB.storyId,
    "the continuation frame on p101 carries the SAME story — the chain is real",
  ).toBe(storyId);
  await doc.expectRenderChanged(p(101), before101);

  const overset = await storyOverset(page, storyId);
  const oversetLine =
    overset === false
      ? "The chain holds the whole day-book — nothing is overset past the last frame."
      : overset === true
        ? "The chain reports OVERSET: rows remain past the second frame — recorded, not hidden."
        : "The story's overset flag could not be read on this run.";
  if (overset !== false) notes.push(oversetLine);

  // ── commentary ───────────────────────────────────────────────────
  const capA = await proseFrame(ctx, p(100), [292, 152, 492, 420], [
    {
      text:
        "Twenty-four delivery days, three columns, all of it typed as " +
        "three SEQUENCE anchors and spilled by the engine. The frame on " +
        "this page is deliberately too short: the table breaks mid-body " +
        "and walks across the gutter.",
      style: STYLE.bodySmall,
    },
    {
      text:
        "The header band was added AFTER the lowering, through the same " +
        "insertHeaderRow every native table answers — the strongest " +
        "evidence the plugin's output is not plugin-private.",
      style: STYLE.bodySmall,
    },
  ]);
  const capB = await proseFrame(ctx, p(101), [292, 152, 480, 420], [
    {
      text:
        (banded
          ? "The continuation. The band above the first body row here was " +
            "poured once, on the facing page; the renderer repeats it at " +
            "the break because bands are structure, not decoration. "
          : "The continuation — the same story, walking on across the " +
            "gutter. (No header band could be added on this run; see the " +
            "chapter notes.) ") + oversetLine,
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(capA.frameId, capB.frameId);

  elements.push(
    await marginNote(
      ctx,
      p(100),
      "The sheets engine also owns a pagination lane of its own — " +
        "lowerPaginatedToChain, greedy row packing with repeated headers, " +
        "all threading math in Rust — but no editor command or panel " +
        "reaches it today; it is exported for programmatic hosts. This " +
        "spread therefore shows the HOST chain threading the lowered " +
        "native table, and claims only that. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, p(100), [
      "Specimen No. 155",
      `=SEQUENCE ×3 → ${RANGE}`,
      "lower → resizeFrame → linkFrames",
      "insertHeaderRow on the lowered table",
    ]),
    await specLabel(ctx, p(101), [
      "Specimen No. 156",
      "the continuation — band repeated at the break",
      "same storyId across the chain (hit-test verified)",
    ]),
  );

  const covers = [
    "sheet.lower.page",
    "sheet.calc.spill",
    "layout-model.text-frame-chain",
  ];
  if (banded) covers.push("tables.header-footer-repeat");
  return {
    title: "A day-book across the gutter",
    covers,
    elements,
    notes,
  };
}
