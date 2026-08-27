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

// The native table & the governed catalog (p111, E-Data recto — the
// spread's right page, and the chapter's LAST-run module on purpose).
//
// The bound TABLE lowers as a REAL Paged table: the plugin inserts a
// frame, a native <Table> in its story, and pours the cells by
// (tableId, row, col) — it exports to IDML as a table because it IS
// one. What fills it is the panel's one-click demo wiring, and the page
// says so plainly: the bindings panel's authoring row offers variable,
// image and barcode kinds, so a table's COLUMN SPEC has no authoring
// surface yet and the demo's single unnamed column is the only table a
// designer can wire today. The engine underneath carries far more —
// grouped record flows with per-group SUM/AVG/MIN/MAX footers — and the
// margin records exactly where that lane stops short of the page.
//
// Beside it, the dataset panel's governance readouts, transcribed as
// this page's ledger: the §7 governed catalog over the live schema, the
// §10 batch plans, the §7.1 provider publication, and the batch RUN's
// honest refusal (no record-flow binding can be defined either).
//
// Runs LAST because `lowerAll` re-lowers everything: the six bound
// barcodes re-draw onto the active page and the demo table would
// re-commit as a fresh frame on any later pass — this module is the
// pass, and it cleans what the pass re-drew.

import { expect } from "@playwright/test";

import { openPanel } from "../../../fidelity/canvas-driver";
import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { withActivePage } from "../../active-page";
import { LAYER, STYLE, p } from "../../names-annual";
import {
  geometryOf,
  newRefs,
  partitionByPage,
  removeRefs,
  sceneRefs,
  settle,
} from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  BINDINGS_PANEL,
  DATASET_PANEL,
  chapterData,
  settleStableNew,
  spreadOffset,
} from "./00-support";

/** Where the lowered table is translated to (page-local top-left). */
const TABLE_SLOT_TOP = 216;
const TABLE_SLOT_LEFT = 48;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg = p(111);
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];
  const elements: string[] = [];
  const covers: string[] = [];

  const head = await proseFrame(ctx, pg, [48, 54, 480, 84], [
    { text: "A native table, governed", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, pg, [48, 90, 480, 192], [
    {
      text:
        "The bound table is not a picture of a grid: the plugin inserts a " +
        "frame, mints a real Paged table in its story, and pours every cell " +
        "by table, row and column — one row per record of the order book. " +
        "It reflows, it styles, and it exports to IDML as a table because " +
        "it is one. What the shipped panel can WIRE into it is the demo's " +
        "single unnamed column, and this page prints that honestly rather " +
        "than dressing it up.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  const tableCaption = await proseFrame(ctx, pg, [252, 216, 480, 400], [
    {
      text:
        "The lowered table — minted with 49 native rows (one header, 48 " +
        "records) in the demo wiring's one column, trimmed here to eight " +
        "records because a native table paints past its frame. Every body " +
        "cell reads #PARSE because the demo " +
        "wiring binds an EMPTY expression and the engine prints its error " +
        "token rather than inventing a value. A table binding's column " +
        "spec has no authoring surface yet — the authoring row offers " +
        "variable, image and barcode kinds only — so this demo shape is " +
        "the only table a designer can define today, and the page prints " +
        "it as it resolves.",
      style: STYLE.caption,
    },
  ]);
  elements.push(tableCaption.frameId);

  let ledger: string[] = [];

  if (chapterData.ready) {
    // A frame that exists only to hold the caret: the demo wiring also
    // defines an empty-expression variable whose field would land at
    // the caret — parked here, then thrown away with the frame.
    const throwawayBox: [number, number, number, number] = [48, 560, 200, 592];
    const throwaway = await doc.textFrame(pageId, throwawayBox);
    const throwawayStory = await doc.storyOf(pageId, throwawayBox);

    await openPanel(page, BINDINGS_PANEL);
    const framesBefore = await sceneRefs(page, "textFrame");
    const polysBefore = await sceneRefs(page, "polygon");
    await withActivePage(page, pageId, async () => {
      await doc.designer.placeCaret(throwawayStory, 0);
      await page.getByRole("button", { name: /wire demo binding/i }).click();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: /^lower to document$/i }).click();
      await settle(
        page,
        async () =>
          (await newRefs(page, "textFrame", framesBefore)).length > 0,
        30_000,
      );
      await page.waitForTimeout(1_000);
    });

    // The re-drawn barcodes: every bound symbol drew a fresh copy onto
    // this (active) page. None of this page's own content is a path, so
    // every new polygon goes, wherever it landed — read at STABILITY,
    // because the pass commits symbol after symbol and an early sample
    // would leave the late ones as litter (measured on the symbology
    // page).
    const strayPolys = await settleStableNew(page, "polygon", polysBefore, 20_000);
    if (strayPolys.length > 0) {
      await removeRefs(doc, strayPolys);
      notes.push(
        `lowerAll re-drew the six bound symbols during the table pass — ` +
          `${strayPolys.length} stray path modules removed from the active page.`,
      );
    }

    const minted = (await newRefs(page, "textFrame", framesBefore)).filter(
      (r) => r.id !== throwaway,
    );
    const { here, elsewhere } = await partitionByPage(page, minted, pageId);
    if (elsewhere.length > 0) {
      await removeRefs(doc, elsewhere);
      notes.push(
        `${elsewhere.length} lowered frame(s) landed on another page despite ` +
          "the supplied active page — removed.",
      );
    }

    if (here.length > 0) {
      // Translate the table frame into the page's slot. STORED coords:
      // the resize lane speaks them, so the page's measured spread
      // offset folds into the target — without it the table lands one
      // page width off on this recto.
      const [geo] = await geometryOf(page, [here[0]]);
      const off = await spreadOffset(ctx, pageId);
      if (geo?.bounds) {
        const [top, left, bottom, right] = geo.bounds;
        const targetTop = TABLE_SLOT_TOP + off[1];
        const targetLeft = TABLE_SLOT_LEFT + off[0];
        // CLIPPED on purpose: 49 rows compose ~1000 pt tall and would
        // flood the page — the frame is capped at the slot's height and
        // the rest of the table stays in the story (overset), which the
        // caption says out loud.
        const capped = Math.min(bottom - top, 204);
        await doc.mutate("resizeFrame", {
          frameId: here[0].id,
          bounds: [
            targetTop,
            targetLeft,
            targetTop + capped,
            targetLeft + (right - left),
          ],
        });
      }
      await doc
        .setProperty("textFrame", here[0].id, "itemLayer", {
          type: "text",
          value: await doc.layerId(LAYER.content),
        })
        .catch(() => undefined);
      elements.push(...here.map((r) => r.id));
      covers.push("tables.model", "data.bind.engine");

      // TRIM the table to its specimen size. A native table PAINTS past
      // its frame (measured: capping the frame clipped nothing and 49
      // rows flooded the page), so the page edits the table itself —
      // deleteTableRow from the end, one batch — and says so. The
      // lowering minted all 49; eight records remain as the exhibit.
      const off2 = await spreadOffset(ctx, pageId);
      const slotCentre: [number, number] = [
        TABLE_SLOT_LEFT + 40,
        TABLE_SLOT_TOP + 40,
      ];
      void off2; // hitTest speaks page-local points; offset kept for symmetry
      const hit = await page.evaluate(
        async ({ pageId, point }) => {
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
          for (const filter of ["text", "any"]) {
            const reply = await c.client.send({
              kind: "hitTest",
              payload: { pageId, docPoint: point, filter },
            });
            if (reply.payload.tableContext?.tableId) {
              return {
                storyId: reply.payload.storyId ?? null,
                tableId: reply.payload.tableContext.tableId,
              };
            }
          }
          return { storyId: null, tableId: null };
        },
        { pageId, point: slotCentre },
      );
      if (hit.storyId && hit.tableId) {
        const keep = 9; // header + eight records
        const ops = [];
        for (let at = 48; at >= keep; at -= 1) {
          ops.push({
            op: "deleteTableRow",
            args: { storyId: hit.storyId, tableId: hit.tableId, at },
          });
        }
        await doc.batch(ops).catch((err) => {
          notes.push(
            `trimming the demo table's rows was refused: ${String(err).slice(0, 140)}`,
          );
        });
        notes.push(
          "the lowered table paints past its frame (a native table ignores " +
            "the frame's bottom bound), so the page trimmed it to one header " +
            "and eight records via deleteTableRow — an ordinary table edit, " +
            "stated on the page.",
        );
      } else {
        notes.push(
          "the lowered table's tableId did not resolve through hitTest — " +
            "the 49-row table stays untrimmed and overruns its slot.",
        );
      }
      if (here.length > 1) {
        await removeRefs(doc, here.slice(1));
        notes.push(
          `the table lowering left ${here.length} frames on this page; the ` +
            "extras were removed.",
        );
      }
    } else {
      notes.push(
        "the bound table lowered no frame onto this page — " +
          "commitLoweredTable did not resolve the supplied active page.",
      );
    }
    await removeRefs(doc, [{ kind: "textFrame", id: throwaway }]);

    // ── the governance ledger, transcribed from the dataset panel ───
    const firstLine = async (pattern: RegExp): Promise<string | null> => {
      const hit = page.getByText(pattern).first();
      const ok = await hit
        .waitFor({ state: "visible", timeout: 120_000 })
        .then(() => true)
        .catch(() => false);
      if (!ok) return null;
      return (await hit.innerText()).split("\n")[0].trim();
    };

    await openPanel(page, DATASET_PANEL);
    await page.getByRole("button", { name: /refresh \+ catalog/i }).click();
    const catalogLine = await firstLine(/catalog: \d+ cols/);
    if (catalogLine) {
      ledger.push(`§7  ${catalogLine}`);
      ledger.push(
        "    (a bare CSV travels with no metadata sidecar — every column " +
          "arrives undocumented, and the catalog says so)",
      );
      covers.push("data.governed.extract");
    } else {
      notes.push("the governed catalog never rendered its readout.");
    }

    await page.getByRole("button", { name: /^per group$/i }).click();
    const perGroup = await firstLine(/plan: perGroup/);
    if (perGroup) {
      ledger.push(`§10 ${perGroup}`);
      ledger.push(
        "    (the panel pins the group key to the catalog's first column — " +
          "id — so per-group means per-record here; grouping by region is " +
          "the engine lane the margin records)",
      );
    }
    await page.getByRole("button", { name: /^one catalog$/i }).click();
    const oneCatalog = await firstLine(/plan: oneCatalog/);
    if (oneCatalog) ledger.push(`§10 ${oneCatalog}`);
    if (perGroup || oneCatalog) covers.push("data.automation.batch");

    await page.locator("[data-data-batch-run]").click();
    const refusal = await firstLine(/no record-flow binding/i);
    if (refusal) {
      ledger.push(`§10 run batch → refused: “${refusal}”`);
      ledger.push(
        "    (a record-flow binding has no authoring surface either — the " +
          "refusal is the honest answer)",
      );
    }

    await page.getByRole("button", { name: /publish provider/i }).click();
    const provider = await firstLine(/Provider "/);
    if (provider) {
      ledger.push(`§7.1 ${provider}`);
      covers.push("data.provider.contract");
    }
  } else {
    ledger = [
      "the query engine never reached ready on this lane — no table",
      "lowered and no governance readout ran; the frames above say so.",
    ];
  }

  if (ledger.length > 0) {
    const ledgerFrame = await proseFrame(
      ctx,
      pg,
      [48, 436, 480, 654],
      [
        {
          text: "The governance ledger — the dataset panel's own answers:",
          style: STYLE.caption,
        },
        ...ledger.map((text) => ({ text, style: STYLE.codeBlock })),
      ],
    );
    elements.push(ledgerFrame.frameId);
  }

  expect(elements.length, "the table page authored content").toBeGreaterThan(3);

  elements.push(
    await marginNote(
      ctx,
      pg,
      "The grouped catalog this chapter wanted — a native table grouped by " +
        "region with per-group SUM(qty) and AVG(unit_price) footers — lives " +
        "in the engine (the §9.4 record-flow lane carries multi-level " +
        "grouping and footer aggregates) but no editor surface can define a " +
        "grouped table or record-flow binding today: the demo table pins " +
        "group_by to none and the authoring row has no table kind. Shown " +
        "instead: the native single-column table, and the refusals, " +
        "verbatim. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, pg, [
      "Specimen No. 178",
      "wire demo binding → insertTextFrame + insertTable + cell pour",
      "table translated by resizeFrame (stored coords, spread offset folded)",
      "governed catalog · batch plans · provider publish · run-batch refusal",
    ]),
  );

  return {
    title: "A native table, governed",
    covers: [...new Set(covers)],
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
