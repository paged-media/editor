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

// The chart wall (p96–p97, one E-Data spread) — every chart kind the
// sheet engine owns, lowered to NATIVE vector art and hung in a grid.
//
// `annual-charts.xlsx` carries ten DrawingML charts, one per engine
// `ChartKind` (importer-validated in plugin-sheets conformance). Each
// is lowered through the bundle's own surfaces — the FIRST through the
// `lowerChartToFrame` command (which takes the workbook's first chart),
// the other nine through the workbook panel's per-chart "Lower to
// frame" buttons — and every lowering runs the chart subsystem
// (plotters over a custom paged.draw DrawingBackend) to a frozen
// ChartGeometry IR that the bundle writes out as paths and text frames.
// Nothing on these two pages is a picture of a chart.
//
// Each lowering lands at the plugin's fixed 24 pt inset, so the wall
// then applies ONE `frameTransform` batch per chart — a uniform
// scale-about-origin plus translate — which preserves the plugin's own
// measured geometry and only chooses the specimen's size and slot.
// The kind labels under the slots are read from the panel's own chart
// list, never from a hand-kept list: which kinds exist is a Rust
// decision, and the wall repeats the panel's answer.

import { expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openPanel } from "../../../fidelity/canvas-driver";
import { withActivePage } from "../../active-page";
import { proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import { partitionByPage, removeRefs } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  SHEET_CMD,
  WORKBOOK_PANEL,
  awaitRenderStable,
  importWorkbook,
  placeElements,
  settleNewElements,
  treeElements,
  type El,
  isNewEl,
  spreadOffset,
} from "./00-support";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKBOOK = pathResolve(__dirname, "..", "..", "assets", "annual-charts.xlsx");

/** Chart scale on the wall: ten specimens on two pages. */
const S = 0.52;
/** Slot column x per page (E-Data seams: x0 and x0 + 6 units + gutter). */
const COLS_VERSO = [60, 282];
const COLS_RECTO = [48, 270];
const ROWS = [176, 330, 484];
const SLOT_W = 210;

interface ChartRow {
  index: number;
  kind: string;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg96 = ctx.pageIds[0];
  const pg97 = ctx.pageIds[1];
  const notes: string[] = [];
  const covers: string[] = [];
  const elements: string[] = [];

  // ── furniture first, so no later branch leaves the spread bare ───
  const head = await proseFrame(ctx, p(96), [60, 96, 492, 124], [
    { text: "The chart wall", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(96), [60, 128, 492, 170], [
    {
      text:
        "One workbook, ten charts — the engine's whole kind set, lowered " +
        "one by one. Every bar, wedge, ring and spoke on this spread is a " +
        "native path, and every axis number is a text frame; there is no " +
        "picture of a chart anywhere in this document.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── import the workbook through the K-5 host file picker ─────────
  await openPanel(page, WORKBOOK_PANEL);
  const booted = await importWorkbook(page, WORKBOOK, notes);
  if (!booted) {
    elements.push(
      await specLabel(ctx, p(96), [
        "Specimen No. 151",
        "annual-charts.xlsx — engine did not boot (see notes)",
      ]),
    );
    return { title: "The chart wall", covers, elements, notes };
  }
  covers.push(
    "sheet.plugin.bundle",
    "plugin-platform.file-picker",
    "plugin-platform.bundle-lifecycle",
    "editor-shell.plugin-bundles",
  );

  // ── the panel's chart list is the wall's label source ────────────
  const list = page.locator("[data-sheet-chart-list]");
  await expect(list, "the workbook's charts enumerated").toBeVisible({
    timeout: 120_000,
  });
  const rowTexts = await page
    .locator("[data-sheet-chart-list] > div")
    .allInnerTexts();
  const charts: ChartRow[] = [];
  for (const t of rowTexts) {
    const m = /^#(\d+)\s+(\S+)/.exec(t.trim());
    if (m) charts.push({ index: Number(m[1]), kind: m[2] });
  }
  expect(
    charts.length,
    "annual-charts.xlsx carries the engine's full ten-kind battery",
  ).toBe(10);

  // ── lower all ten, five per page ─────────────────────────────────
  let totalPaths = 0;
  let totalLabels = 0;
  for (const [i, chart] of charts.entries()) {
    const onVerso = i < 5;
    const pageId = onVerso ? pg96 : pg97;
    const pageIndex = onVerso ? p(96) : p(97);
    const slot = i % 5;
    const cols = onVerso ? COLS_VERSO : COLS_RECTO;
    const slotX = cols[slot % 2];
    const slotY = ROWS[Math.floor(slot / 2)];
    // The facing-page offset, measured once per page: placement maps
    // STORED coords, inserts re-based page-local ones — fold D in or
    // the facing page's charts land 540·(1−s) short of their slots.
    const D = await spreadOffset(ctx, pageId);

    const before = await treeElements(page);
    let fresh: El[] = [];
    await withActivePage(page, pageId, async () => {
      if (i === 0) {
        // The command lane — `lowerChartToFrame` lowers the FIRST chart.
        await doc.runCommand(`${SHEET_CMD}.lowerChartToFrame`);
      } else {
        await page.locator(`[data-sheet-chart-lower="${chart.index}"]`).click();
      }
      fresh = await settleNewElements(page, before);
    });
    expect(
      fresh.length,
      `chart #${chart.index} (${chart.kind}) lowered something onto the page`,
    ).toBeGreaterThan(0);

    // ASK where it landed; a stray on another page is removed + noted,
    // never left on someone else's spread.
    const { here, elsewhere } = await partitionByPage(page, fresh, pageId);
    if (elsewhere.length > 0) {
      await removeRefs(doc, elsewhere).catch(() => undefined);
      notes.push(
        `chart #${chart.index} (${chart.kind}) put ${elsewhere.length} ` +
          "item(s) on another page despite the supplied active page; removed",
      );
    }

    // The panel button fires the lowering without awaiting it; let the
    // phase-2 label pours finish (paint settles) before moving anything
    // out from under their own hit tests.
    await awaitRenderStable(doc, pageIndex);

    // RE-DIFF after stability: phase 2 mints label frames AFTER the
    // first settle sampled, and an element that misses this list keeps
    // its default minting position — ten charts' leftovers piling into
    // one corner was exactly what the visual review showed. The union
    // (early fresh + late arrivals) is what gets placed.
    const late = (await treeElements(page))
      .filter(isNewEl(before))
      .filter((e) => !fresh.some((f) => f.kind === e.kind && f.id === e.id));
    if (late.length > 0) {
      const parts = await partitionByPage(page, late, pageId);
      if (parts.elsewhere.length > 0) {
        await removeRefs(doc, parts.elsewhere).catch(() => undefined);
      }
      here.push(...parts.here);
    }

    await placeElements(
      doc,
      here,
      S,
      slotX + 16 - 24 * S + D[0] * (1 - S),
      slotY + 4 - 24 * S + D[1] * (1 - S),
      notes,
    );

    const paths = here.filter(
      (e) => e.kind === "polygon" || e.kind === "graphicLine" || e.kind === "oval",
    ).length;
    const labels = here.filter((e) => e.kind === "textFrame").length;
    totalPaths += paths;
    totalLabels += labels;

    const caption = await proseFrame(
      ctx,
      pageIndex,
      [slotX, slotY + 130, slotX + SLOT_W, slotY + 148],
      [
        {
          text: `${chart.kind} — ${paths} native paths, ${labels} label frames`,
          style: STYLE.caption,
        },
      ],
    );
    elements.push(caption.frameId, ...here.map((e) => e.id));
  }

  // The proof the wall is ARTWORK: the lowerings minted real paths.
  expect(
    totalPaths,
    "the chart wall lowered as native paths, not placed pictures",
  ).toBeGreaterThan(0);
  covers.push("sheet.chart.engine", "sheet.chart.graphs");
  notes.push(
    `ten charts lowered as ${totalPaths} native path(s) and ${totalLabels} ` +
      "label frame(s); stacked-column, stacked-bar and radar are the 2026-08 " +
      "kind-set additions that make the set a superset of Illustrator's nine",
  );

  // The wall's legend, in the free recto slot.
  const legend = await proseFrame(
    ctx,
    p(97),
    [COLS_RECTO[1], ROWS[2], COLS_RECTO[1] + SLOT_W, ROWS[2] + 130],
    [
      {
        text:
          "How to read the wall: each specimen is the plugin's own lowering, " +
          "scaled uniformly by one transform per chart — the geometry is the " +
          "engine's, the slot is the page's. The colours are document " +
          "swatches the lowering minted at content-addressed ids, so two " +
          "charts sharing an axis grey share one swatch.",
        style: STYLE.caption,
      },
    ],
  );
  elements.push(legend.frameId);

  elements.push(
    await specLabel(ctx, p(96), [
      "Specimen No. 151",
      "annual-charts.xlsx via the K-5 host file picker",
      "lowerChartToFrame (command lane, chart #0)",
      "column · bar · stacked-column · stacked-bar · line",
    ]),
    await specLabel(ctx, p(97), [
      "Specimen No. 152",
      "per-chart panel lowering ×5",
      "area · pie · donut · scatter · radar",
      "plotters → ChartGeometry IR → insertPath + insertTextFrame",
    ]),
  );

  return { title: "The chart wall — ten kinds, all native", covers, elements, notes };
}
