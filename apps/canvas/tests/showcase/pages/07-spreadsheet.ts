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

// Page 7 — SPREADSHEET: a workbook lowered onto the page twice.
//
// RECIPE FROM: `tests/journey/plugins/sheet.journey.spec.ts` and
// `sheet-grid-formula.journey.spec.ts` (the K-5 file-picker →
// `[data-sheet-range]` → `[data-sheet-lower]` sequence, copied
// verbatim) and `sheet-chart.journey.spec.ts` (the chart lowering).
//
// paged.sheet HAS NO BLANK-WORKBOOK PATH — the engine opens a workbook,
// it does not mint one — so this page needs a real `.xlsx`. It reuses
// `tests/e2e/harness/sheet-09-chart.xlsx`, which the sheet journeys
// already drive, rather than adding a fixture: it is licence-clear, it
// is 3.5 KB, and it is the only harness workbook carrying a real chart
// part (`xl/charts/chart1.xml` + `drawing1.xml`), which this page needs
// for its second half.
//
// TWO LOWERINGS, TWO ENGINES.
//
//   TABLE — `lowerToFrame` turns a cell range into a NATIVE `<Table>`
//     in a real text frame: the engine computes the IR in Rust, the
//     host-model translator shapes the mutations, and the column widths
//     come from the DOCUMENT's own font metrics through the text
//     measurement door. Nothing about the result is plugin-private —
//     it exports to IDML as a table because it IS a table.
//   CHART — `lowerChartToFrame` runs the chart subsystem (plotters
//     driving a custom paged.draw DrawingBackend) to a frozen
//     ChartGeometry IR, which the bundle writes out as native paths and
//     label frames. So the bars on this page are Polygons and the axis
//     numbers are text frames; there is no picture of a chart anywhere.
//
// WHY THE PAGE MOVES WHAT THE PLUGIN PLACED. Both lowerings place at a
// fixed 24 pt inset from the page corner (`placement.ts`'s
// `DEFAULT_INSET_PT`, `lower-chart.ts`'s `CHART_INSET_PT`), so on their
// own they would sit on top of each other and on top of this page's
// heading. Each lowering is therefore followed by a TRANSLATION of
// exactly the elements it created — `frameTransform` set to
// `[1, 0, 0, 1, dx, dy]`, a real wire op that round-trips — which
// preserves the plugin's own measured geometry and only chooses where
// on the page it sits. Writing new `frameBounds` instead would silently
// discard those measured column widths.
//
// ONE THING TO WATCH, seen on every probe render. `measureColumnWidths`
// takes the widest formatted cell text in each column, measures it
// through the host shaper and adds a 4 pt inset — yet column B comes out
// a hair narrower than its own header, so "Revenue" wraps to two lines
// in the lowered table. The page does not correct it: the table on it is
// the table the plugin measured, and a showcase that quietly widened the
// column would hide the one place this is visible.
//
// PAGE PLACEMENT. Like every bundle, paged.sheet resolves its target as
// `meta.activePage ?? pages[0]`. Building this document is what showed
// that nothing answered the first half — both lowerings landed on page
// one — and the editor now folds its own active page in; see
// `../active-page.ts`. Both lowerings here are wrapped in
// `withActivePage` so they target the page this module owns rather than
// whatever the host last looked at.

import { expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openPanel } from "../../fidelity/canvas-driver";
import { withActivePage } from "../active-page";
import type { Bounds } from "../driver";
import { headingAndCaption, labelFrame } from "../plugin-support";
import type { PageContext, PageReport } from "../types";

/** The harness workbook the sheet journeys drive: Region / Revenue over
 *  three quarters, plus one clustered-column chart part. */
const WORKBOOK = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "e2e",
  "harness",
  "sheet-09-chart.xlsx",
);

const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";
const CMD_LOWER_CHART = "media.paged.sheet.command.lowerChartToFrame";
const RANGE = "A1:B4";

const FOOTNOTE: Bounds = [566, 72, 700, 540];

/** Where the plugin puts things, and where this page wants them. Both
 *  lowerings start at a 24 pt inset from the page corner. */
// The chart's axis LABELS are placed left of its plot origin, so the
// translate has to clear the 72 pt margin by more than the chart box
// itself needs — measured off a probe render, the "22.50" tick starts
// about 26 pt to the left of the plot area.
const CHART_MOVE = { dx: 100, dy: 166 }; // → plot x 124–484, y 190–430
const TABLE_MOVE = { dx: 48, dy: 426 }; // → x 72…, y 450…

const TITLE = "Spreadsheet — a workbook, lowered twice";

const SUMMARY =
  "One .xlsx opened through the host file picker. paged.sheet parsed it in " +
  "Rust, then put it on the page twice: once as vector artwork from its " +
  "chart engine, once as a native table from a cell range.";

const FOOTNOTE_TEXT =
  "The bars are not a picture of a chart. The chart subsystem ran to a " +
  "frozen geometry description and the bundle wrote that out as native " +
  "paths and text frames, so the plot exports to IDML and to PDF as " +
  "ordinary artwork and a reader without the plugin still sees it. The " +
  "table below it is a native IDML table, and its column widths were " +
  "measured through this document's own font metrics rather than guessed " +
  "from character counts — narrowly enough that the second column's header " +
  "wraps by a hair, which is left as it was measured. The workbook itself " +
  "travels in the container as a plugin part, so reopening the file gives " +
  "the numbers back, live.";

interface Element {
  kind: string;
  id: string;
}

/** Every addressable element in the document, in paint order. A
 *  before/after diff is how this module learns which items a lowering
 *  created — the commands report a boolean, not a list of ids. */
async function treeElements(ctx: PageContext): Promise<Element[]> {
  return ctx.page.evaluate(async () => {
    const client = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas.client;
    const reply = await client.executeScript("paged.tree()");
    const tree = JSON.parse(reply.output[0] ?? "[]") as Array<
      Record<string, unknown>
    >;
    const out: Array<{ kind: string; id: string }> = [];
    const visit = (node: Record<string, unknown>) => {
      const id = node.id as { kind?: string; id?: string } | null | undefined;
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

const isNew = (before: Element[]) => (e: Element) =>
  !before.some((b) => b.kind === e.kind && b.id === e.id);

/** Invoke a command through the real registry (menu / palette door). */
async function invoke(ctx: PageContext, id: string): Promise<void> {
  await ctx.page.evaluate((commandId) => {
    const commands = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: { invoke: (id: string) => Promise<unknown> };
          };
        };
      }
    ).__canvas.registries.commands;
    return commands.invoke(commandId);
  }, id);
}

/**
 * Translate one element by `(dx, dy)`. Records a refusal as a note
 * instead of throwing: a chart lowers as sixteen separate items, and
 * one of them declining the write is worth REPORTING on the page's
 * behalf, not worth losing the other fifteen over.
 */
async function translate(
  ctx: PageContext,
  el: Element,
  dx: number,
  dy: number,
  notes: string[],
): Promise<void> {
  try {
    await ctx.doc.setProperty(el.kind, el.id, "frameTransform", {
      type: "transform",
      value: [1, 0, 0, 1, dx, dy],
    });
  } catch (err) {
    notes.push(
      `${el.kind}/${el.id} refused the placement translate: ${String(err)}`,
    );
  }
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];
  const covers: string[] = [];

  // ── furniture, first, so no later branch can leave the page bare ──
  const furniture = await headingAndCaption(doc, pageId, TITLE, SUMMARY);
  furniture.push(await labelFrame(doc, pageId, FOOTNOTE, FOOTNOTE_TEXT));

  // ── open the workbook through the host file picker (K-5) ────────
  await openPanel(page, WORKBOOK_PANEL);
  const pick = page.locator("[data-sheet-pick]");
  await expect(pick, "the workbook panel offers its file picker").toBeVisible({
    timeout: 15_000,
  });
  const chooser = page.waitForEvent("filechooser");
  await pick.click();
  await (await chooser).setFiles(WORKBOOK);

  // The range control only renders once the engine has BOOTED and
  // PARSED, so it is the honest answer to "did the sheet wasm come up".
  // The bundle says so itself when it did not (`data-sheet-boot-error`).
  const range = page.locator("[data-sheet-range]");
  try {
    await expect(range).toBeVisible({ timeout: 40_000 });
  } catch {
    const bootError = await page
      .locator("[data-sheet-boot-error]")
      .first()
      .textContent()
      .catch(() => null);
    notes.push(
      "the paged.sheet engine wasm did NOT boot, so neither the table nor " +
        `the chart was lowered — the panel reported: ${bootError ?? "(no boot-error message; the range control simply never rendered)"}`,
    );
    return { title: TITLE, covers, elements: furniture, notes };
  }
  notes.push(
    "the paged.sheet engine wasm booted and parsed the workbook (its range " +
      `control rendered, and accepted ${RANGE})`,
  );
  covers.push(
    "sheet.plugin.bundle",
    "plugin-platform.file-picker",
    "plugin-platform.bundle-lifecycle",
    "editor-shell.plugin-bundles",
  );

  // ── LOWER THE RANGE to a native table ───────────────────────────
  await range.fill(RANGE);
  const beforeTable = await treeElements(ctx);
  await withActivePage(ctx.page, pageId, async () => {
    await page.locator("[data-sheet-lower]").click();
    await expect
      .poll(
        async () => (await treeElements(ctx)).filter(isNew(beforeTable)).length,
        {
          message: "the range lowered to a frame on this page",
          timeout: 30_000,
        },
      )
      .toBeGreaterThan(0);
  });
  const tableEls = (await treeElements(ctx)).filter(isNew(beforeTable));
  for (const el of tableEls) {
    await translate(ctx, el, TABLE_MOVE.dx, TABLE_MOVE.dy, notes);
  }
  covers.push("sheet.lower.page");

  // ── LOWER THE CHART to native vector art ────────────────────────
  const beforeChart = await treeElements(ctx);
  await withActivePage(ctx.page, pageId, async () => {
    await invoke(ctx, CMD_LOWER_CHART);
    await expect
      .poll(
        async () => (await treeElements(ctx)).filter(isNew(beforeChart)).length,
        {
          message: "the chart lowered to native paths + label frames",
          timeout: 30_000,
        },
      )
      .toBeGreaterThan(0);
  });
  const chartEls = (await treeElements(ctx)).filter(isNew(beforeChart));
  for (const el of chartEls) {
    await translate(ctx, el, CHART_MOVE.dx, CHART_MOVE.dy, notes);
  }
  // The proof it is ARTWORK and not an image: the lowering minted real
  // paths. A chart that arrived as a placed picture would mint none.
  const paths = chartEls.filter((e) => e.kind === "polygon").length;
  const labels = chartEls.filter((e) => e.kind === "textFrame").length;
  expect(
    paths,
    "the chart lowered as native paths, not as a placed picture",
  ).toBeGreaterThan(0);
  covers.push("sheet.chart.engine");
  notes.push(
    `the chart lowered as ${paths} native path(s) and ${labels} label frame(s)`,
  );

  return {
    title: TITLE,
    covers,
    elements: [
      ...furniture,
      ...tableEls.map((e) => e.id),
      ...chartEls.map((e) => e.id),
    ],
    notes,
  };
}
