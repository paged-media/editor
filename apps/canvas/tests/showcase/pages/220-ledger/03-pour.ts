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

// The native pour (p98, E-Data verso) — a workbook range lowered
// through the panel's lower flow into a REAL Paged table.
//
// The three-phase lower this page exhibits: (1) frame + binding as one
// batch; (2) `insertTable` sized by the DOCUMENT's font metrics — the
// bundle measures each column's widest formatted cell through
// `host.text.measureString`, so the widths on this page are
// measurements, not guesses; (3) the cell pour in the engine's two
// apply lanes (text, then decor). The page then says out loud how the
// bundle FINDS what it made: a freshly inserted empty frame's story is
// invisible to the hit-test door, so the bundle diffs the stories
// collection across the insert — and only once the frame has content
// does hitTest answer, which is how the chart labels and the chain
// lowering resolve THEIR stories. Two read doors, one honest split.
//
// Also demonstrated, then put away: the in-frame grid session
// (showGridInFrame / hideGridInFrame) — C-1 scene-layer state that
// would not survive this chapter's checkpoint, shown and hidden so the
// page records the distinction it opened the chapter with.

import { expect } from "@playwright/test";

import { openPanel } from "../../../fidelity/canvas-driver";
import { withActivePage } from "../../active-page";
import { assignLayer, marginNote, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, p } from "../../names-annual";
import { partitionByPage, removeRefs, settle } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  SHEET_CMD,
  WORKBOOK_PANEL,
  placeElements,
  settleNewElements,
  treeElements,
  type El,
} from "./00-support";

const RANGE = "A1:E5";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg98 = ctx.pageIds[0];
  const notes: string[] = [];
  const covers: string[] = [];
  const elements: string[] = [];

  const head = await proseFrame(ctx, p(98), [60, 96, 492, 124], [
    { text: "The native pour", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(98), [60, 128, 492, 208], [
    {
      text:
        "The quarterly circulation block — Data!A1:E5 of the chart wall's " +
        "workbook — lowered to a native table. The engine computes the " +
        "range in Rust; the bundle inserts a frame, then a real <Table> " +
        "whose column widths were measured through this document's own " +
        "font shaper, then pours every cell. It exports to IDML as a " +
        "table because it IS a table.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // Re-activate the workbook panel tab (it shares a dock group with
  // the grid panel), then select the Data sheet and the range, and
  // lower through the COMMAND lane — the same `session.lowerSelection()`
  // the panel button drives.
  await openPanel(page, WORKBOOK_PANEL);
  const select = page.locator("[data-sheet-select]");
  await expect(select, "the sheet picker is live").toBeVisible({ timeout: 15_000 });
  await select.selectOption({ index: 0 });
  const optionText = await select
    .locator("option")
    .first()
    .textContent()
    .catch(() => null);
  if (optionText && !optionText.startsWith("Data")) {
    notes.push(`expected the first sheet to be Data, panel says: ${optionText}`);
  }
  await page.locator("[data-sheet-range]").fill(RANGE);

  const before = await treeElements(page);
  let fresh: El[] = [];
  await withActivePage(page, pg98, async () => {
    await doc.runCommand(`${SHEET_CMD}.lowerToFrame`);
    fresh = await settleNewElements(page, before);
  });
  expect(fresh.length, "the range lowered a frame onto this page").toBeGreaterThan(0);
  const { here, elsewhere } = await partitionByPage(page, fresh, pg98);
  if (elsewhere.length > 0) {
    await removeRefs(doc, elsewhere).catch(() => undefined);
    notes.push(
      `the lower put ${elsewhere.length} item(s) on another page despite the ` +
        "supplied active page; removed",
    );
  }
  expect(here.length, "the lowered frame is on p98").toBeGreaterThan(0);
  covers.push("sheet.lower.page", "plugin-platform.text-measurement");

  // The plugin places at a fixed 24 pt inset; ONE translate per element
  // chooses the slot and keeps every measured width exactly as measured.
  await placeElements(doc, here, 1, 36, 196, notes);
  for (const el of here) {
    if (el.kind === "textFrame") {
      await assignLayer(ctx, el.kind, el.id, LAYER.content).catch(() => undefined);
    }
  }
  elements.push(...here.map((e) => e.id));

  // ── the grid session, shown and put away ─────────────────────────
  // Scene-layer state by design: the checkpoint at this chapter's end
  // would drop it, so the page shows it, records whether it painted,
  // and hides it again. Demonstrated, not resident.
  const beforeGrid = await doc.renderPage(p(98));
  await doc.runCommand(`${SHEET_CMD}.showGridInFrame`);
  const gridPainted = await settle(
    page,
    async () => !(await doc.renderPage(p(98))).equals(beforeGrid),
    10_000,
  );
  await doc.runCommand(`${SHEET_CMD}.hideGridInFrame`);
  notes.push(
    gridPainted
      ? "showGridInFrame painted the live grid into the lowered frame " +
          "(C-1 scene layer), and hideGridInFrame cleared it — demonstrated, " +
          "not resident: session state never reaches the checkpoint"
      : "showGridInFrame produced no visible paint within 10 s on this lane " +
          "— recorded, not claimed; hideGridInFrame was still issued",
  );

  const caption = await proseFrame(ctx, p(98), [60, 380, 492, 500], [
    {
      text:
        "How the bundle finds what it made: a just-inserted EMPTY frame's " +
        "story is invisible to the hit-test door — the text hit path needs " +
        "content — so the lower resolves its story by diffing the stories " +
        "collection across the insert. Only after the pour does hitTest " +
        "answer at the frame's centre, and that is the door the chart label " +
        "pours and the chain lowering use. Two read doors, split by " +
        "emptiness; this page states the split rather than papering over it.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(caption.frameId);

  elements.push(
    await marginNote(
      ctx,
      p(98),
      "The page lowering runs over the engine's NoStyles contract " +
        "(getRangeLowered): the workbook's cell fills and text colours do " +
        "not reach this table today. The styled read exists as a separate " +
        "door (getRangeStyled) feeding the Character panel provider; " +
        "flipping it on under the page lane is a recorded, deliberate " +
        "non-change. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, p(98), [
      "Specimen No. 153",
      "lowerToFrame (command lane) — Data!A1:E5",
      "insertTextFrame + insertTable + cell pour",
      "columns via host.text.measureString (S-13)",
      "showGridInFrame · hideGridInFrame (session, put away)",
    ]),
  );

  return { title: "The native pour", covers, elements, notes };
}
