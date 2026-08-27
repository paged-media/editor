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

// The expression language (p114, E-Data verso).
//
// The roster is read at BUILD time from the plugin's own per-function
// registry (registry/functions/*.yaml — the files data-core's build.rs
// turns into the dispatch table, so a function outside them is
// uncallable by construction), printed per family with counts that must
// sum to the DSL's forty-two.
//
// The LIVE half runs through the one editor surface that accepts a free
// expression today: the bindings panel's authoring row, whose barcode
// field is an expression the Rust engine evaluates before encoding. Two
// formulas are evaluated against the live records and their results
// drawn as native path geometry — the format family (CURRENCY) and the
// text family (CONCAT), visibly on the page as symbols. The wizard's
// bare-column expressions on p110 are the same DSL's simplest sentences.
//
// This module defines the chapter's FIRST frame-bound bindings and runs
// before the symbology and table pages, so its lowering pass has no
// earlier symbols to re-draw and nothing to clean up.

import { expect } from "@playwright/test";

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { withActivePage } from "../../active-page";
import { LAYER, STYLE, SWATCH, p } from "../../names-annual";
import { geometryOf, sceneRefs } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  addAuthoredBinding,
  assignLayerBatch,
  chapterData,
  clickLower,
  readDslRoster,
  settleStableNew,
  spreadOffset,
  units,
  unshiftSeam,
} from "./00-support";

/** Page-space (x0, y0, x1, y1) exhibit slots on the 25/12 grid. */
const C128_SLOT: [number, number, number, number] = [60, 492, 60 + units(5), 548];
const QR_SLOT: [number, number, number, number] = [319, 486, 415, 582];

const C128_EXPR = "CURRENCY(unit_price)";
const QR_EXPR = 'CONCAT(sku, " - ", url)';

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg = p(114);
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];
  const elements: string[] = [];
  const covers: string[] = [];

  const head = await proseFrame(ctx, pg, [60, 54, 492, 84], [
    { text: "The expression language", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, pg, [60, 90, 492, 172], [
    {
      text:
        "paged.data speaks its own publishing DSL — not a spreadsheet " +
        "grammar — and its whole vocabulary is registry-driven: the files " +
        "printed below are the same ones the engine's build turns into its " +
        "dispatch table, so a function missing here is uncallable by " +
        "construction. Forty-two functions, five families, and below them " +
        "two expressions evaluated live against the order book.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the roster, per family ────────────────────────────────────────
  const roster = readDslRoster();
  if (roster) {
    const total = roster.reduce((n, f) => n + f.names.length, 0);
    if (total !== 42) {
      notes.push(
        `the function registry lists ${total} functions, not the documented 42 — ` +
          "the roster printed is the registry's own answer.",
      );
    }
    // Two rows of family panels on the 12-column grid.
    const slots: Array<[number, number, number, number]> = [
      [60, 184, 60 + units(4), 316],
      [208, 184, 208 + units(4), 316],
      [356, 184, 356 + units(4), 316],
      [60, 326, 60 + units(4), 452],
      [208, 326, 208 + units(6), 452],
    ];
    for (const [i, family] of roster.entries()) {
      const slot = slots[i] ?? slots[slots.length - 1];
      const made = await proseFrame(ctx, pg, slot, [
        {
          text: `${family.family.toUpperCase()} · ${family.names.length}`,
          style: STYLE.tableHead,
        },
        { text: family.names.join(" · "), style: STYLE.codeBlock },
      ]);
      elements.push(made.frameId);
    }
  } else {
    notes.push(
      "the plugin-data function registry is not checked out beside the " +
        "editor — the roster could not be read and the page says so.",
    );
    const missing = await proseFrame(ctx, pg, [60, 184, 492, 240], [
      {
        text:
          "The function registry (plugins/plugin-data/registry/functions) " +
          "is absent from this checkout; the roster cannot be printed " +
          "honestly and is not.",
        style: STYLE.bodySmall,
      },
    ]);
    elements.push(missing.frameId);
  }

  const liveHead = await proseFrame(ctx, pg, [60, 462, 492, 480], [
    {
      text: "Two expressions, evaluated live and lowered as page geometry:",
      style: STYLE.caption,
    },
  ]);
  elements.push(liveHead.frameId);

  // The bound frames the expressions render into.
  const c128Rect = await doc.rectangle(pageId, C128_SLOT);
  const qrRect = await doc.rectangle(pageId, QR_SLOT);
  await doc.designer.applyStroke("rectangle", c128Rect, await doc.swatch(SWATCH.slate), 0.5);
  await doc.designer.applyStroke("rectangle", qrRect, await doc.swatch(SWATCH.slate), 0.5);
  for (const id of [c128Rect, qrRect]) {
    await doc.setProperty("rectangle", id, "itemLayer", {
      type: "text",
      value: await doc.layerId(LAYER.content),
    });
  }
  elements.push(c128Rect, qrRect);

  let c128Line =
    `${C128_EXPR} — not evaluated: the query engine never reached ready on this lane.`;
  let qrLine = `${QR_EXPR} — not evaluated on this lane.`;

  if (chapterData.ready) {
    // ── author the two expression bindings, then ONE lowering ───────
    await doc.select("rectangle", c128Rect);
    await addAuthoredBinding(page, "barcode", C128_EXPR, "code128");
    await doc.select("rectangle", qrRect);
    await addAuthoredBinding(page, "barcode", QR_EXPR, "qr");

    const before = await sceneRefs(page, "polygon");
    let fresh: Awaited<ReturnType<typeof settleStableNew>> = [];
    await withActivePage(page, pageId, async () => {
      await page.getByRole("button", { name: /^refresh data$/i }).click();
      await page.waitForTimeout(600);
      await clickLower(page);
      // Stabilized, not first-hit: the pass commits one symbol batch
      // after another, and sampling at the first new module reads the
      // pass mid-flight (measured on the symbology page).
      fresh = await settleStableNew(page, "polygon", before);
    });
    const off = await spreadOffset(ctx, pageId);
    // The seam correction — see unshiftSeam: on this verso (stored at
    // −540) the lowering's stored-geometry origin is re-based a second
    // time by the wire and the symbols land on the pasteboard.
    if (
      await unshiftSeam(
        doc,
        "polygon",
        fresh.map((r) => r.id),
        off,
      )
    ) {
      notes.push(
        "SEAM FINDING — the barcode lowering feeds the bound rectangle's " +
          "STORED geometry to the page-local insertPath wire, so on this " +
          `page (stored offset ${off[0]},${off[1]}) every module landed one ` +
          "page width off, on the pasteboard; the page translated the " +
          "fresh modules back by the measured offset in one batch.",
      );
    }
    // Geometry `bounds` report the item's UNTRANSFORMED anchors and the
    // corrective translate lives in the transform, so module bounds sit
    // at slot + 2×offset always: the plugin fed STORED rect geometry
    // (local + offset) and the wire re-based it by the offset again.
    // On a spread-origin page 2×0 = 0 and the same formula holds.
    const boff: [number, number] = [off[0] * 2, off[1] * 2];
    const inSlot = (
      b: [number, number, number, number],
      slot: [number, number, number, number],
    ): boolean => {
      const cx = (b[1] + b[3]) / 2;
      const cy = (b[0] + b[2]) / 2;
      return (
        cx >= slot[0] + boff[0] - 6 &&
        cx <= slot[2] + boff[0] + 6 &&
        cy >= slot[1] + boff[1] - 6 &&
        cy <= slot[3] + boff[1] + 6
      );
    };
    const geo = await geometryOf(page, fresh);
    const c128Count = geo.filter((g) => g.bounds && inSlot(g.bounds, C128_SLOT)).length;
    const qrCount = geo.filter((g) => g.bounds && inSlot(g.bounds, QR_SLOT)).length;
    const strays = geo.filter(
      (g) => !g.bounds || (!inSlot(g.bounds, C128_SLOT) && !inSlot(g.bounds, QR_SLOT)),
    );

    if (c128Count + qrCount === 0) {
      // Diagnose before dying: WHERE did the lowering put its modules?
      // The panel's status reported "Resolved + lowered", so the honest
      // question is placement, not resolution.
      const sample = geo
        .slice(0, 6)
        .map(
          (g) =>
            `${g.ref.kind}/${g.ref.id} page=${g.pageId ?? "?"} bounds=[${
              g.bounds?.map((n) => Math.round(n)).join(",") ?? "?"
            }]`,
        )
        .join(" · ");
      throw new Error(
        `the two expression barcodes drew no modules into their bound frames — ` +
          `${fresh.length} new polygon(s) document-wide; this page=${pageId}, ` +
          `offset=[${off.join(",")}], slots c128=[${C128_SLOT.join(",")}] ` +
          `qr=[${QR_SLOT.join(",")}]. Sample: ${sample || "(none)"}`,
      );
    }

    if (strays.length > 0) {
      notes.push(
        `${strays.length} lowered path module(s) landed outside both bound ` +
          "frames — left in place and reported, since this pass had nothing " +
          "earlier to re-draw (see the symbology page for the re-draw " +
          "economics).",
      );
    }
    await assignLayerBatch(
      doc,
      "polygon",
      fresh.map((r) => r.id),
      LAYER.content,
    ).catch((err) => {
      notes.push(`layer assignment for the modules was refused: ${String(err).slice(0, 120)}`);
    });
    elements.push(...fresh.map((r) => r.id));

    if (c128Count > 0) {
      c128Line =
        `${C128_EXPR} — the format family read record 1001's unit price and ` +
        `the engine encoded the formatted string as Code-128: ${c128Count} ` +
        "native filled paths, no image anywhere.";
      covers.push("data.expr.engine", "data.barcode.symbology", "data.bind.authoring");
    } else {
      notes.push("the CURRENCY(unit_price) Code-128 drew no modules in its frame.");
    }
    if (qrCount > 0) {
      qrLine =
        `${QR_EXPR} — the text family joined the record's SKU and order URL ` +
        `and the result is this QR: ${qrCount} native filled paths.`;
      covers.push("data.expr.engine", "data.barcode.symbology", "data.bind.authoring");
    } else {
      notes.push("the CONCAT QR drew no modules in its frame.");
    }
  }

  const c128Caption = await proseFrame(ctx, pg, [60, 556, 60 + units(7), 640], [
    { text: c128Line, style: STYLE.caption },
  ]);
  const qrCaption = await proseFrame(ctx, pg, [319, 588, 492, 652], [
    { text: qrLine, style: STYLE.caption },
  ]);
  elements.push(c128Caption.frameId, qrCaption.frameId);

  elements.push(
    await marginNote(
      ctx,
      pg,
      "The DuckDB network lane is dormant by consent design — remote " +
        "sources stay inert until their origin is granted, and none is. No " +
        "container part carries the imported data yet: the document travels " +
        "with its metadata envelopes and the lowered native content, and a " +
        "reopened session re-imports. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, pg, [
      "Specimen No. 181",
      "registry/functions/*.yaml — 42 fns, 5 families",
      `authoring row: barcode expr ${C128_EXPR}`,
      `authoring row: qr expr ${QR_EXPR}`,
      "lowerAll → insertPath modules (vector lane)",
    ]),
  );

  return {
    title: "The expression language",
    covers: [...new Set(covers)],
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
