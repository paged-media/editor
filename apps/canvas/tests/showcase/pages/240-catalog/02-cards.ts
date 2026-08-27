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

// The record card (p110, E-Data verso — the spread's left page).
//
// THE FLOW THIS PAGE DRIVES, end to end through the real editor host:
// annual-orders.csv registers through the sources panel's host
// file-picker door; the session boots the vendored DuckDB-WASM engine
// and registers the table; the field-mapping wizard asks the RUST
// engine for each column's binding expression (the bundle never decides
// the mapping); and each confirmed binding lowers as a tagged
// placeholder FIELD placed at the TEXT CARET — the C-9 read door, the
// same one the D-01 lane resolves first in its precedence.
//
// One wizard pass per card line, deliberately: the wizard confirms its
// chosen columns as a batch and every NEW binding's field lands at the
// one caret, so a card whose lines carry one field each needs the caret
// moved — and the wizard re-run — between bindings. A field, once
// placed, is placed ONCE (the session keys it by binding id and later
// lowers only re-resolve it), which is exactly what makes the pass-per-
// line drive clean: pass N adds field N and refreshes the others in
// place.
//
// RECIPE FROM: the retired 09-database spread (import gateway + wizard
// testids), tests/journey/plugins/data-fieldmap.journey.spec.ts (the
// wizard contract) and data-render.journey.spec.ts (the honest DuckDB
// degrade).

import { marginNote, proseFrame, plate, specLabel } from "../../annual-support";
import { withActivePage } from "../../active-page";
import { STYLE, SWATCH, p } from "../../names-annual";
import { settle } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  chapterData,
  clickLower,
  fieldValue,
  importOrders,
  units,
  wizardMapSingle,
} from "./00-support";

/** The card's lines: CSV column → the printed label it follows. */
const CARD_LINES: Array<{ column: string; label: string }> = [
  { column: "customer", label: "Customer   " },
  { column: "product", label: "Product   " },
  { column: "unit_price", label: "Unit price   " },
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg = p(110);
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];
  const elements: string[] = [];
  const covers: string[] = [];

  const head = await proseFrame(ctx, pg, [60, 54, 492, 84], [
    { text: "The record card", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, pg, [60, 90, 492, 200], [
    {
      text:
        "The order book from the opener, published. The CSV registers " +
        "through the plugin's DuckDB query engine; the field-mapping wizard " +
        "asks the Rust engine for each column's binding expression; and " +
        "three of those bindings resolve into the card below as tagged " +
        "placeholder fields, each placed at the text caret. Nothing in the " +
        "card is typed: every value was resolved from record 1001 by the " +
        "engine, and a data refresh re-resolves it in place.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── the card furniture (the page decides where its frames sit) ────
  // 12-column grid: the card spans columns 1–7, the commentary 8–12.
  const cardX0 = 60;
  const cardX1 = 60 + units(7); // 307
  const cardPlate = await plate(
    ctx,
    pg,
    [cardX0, 220, cardX1, 412],
    SWATCH.vermilionTint,
  );
  const cardRule = await plate(
    ctx,
    pg,
    [cardX0, 220, cardX1, 222],
    SWATCH.vermilion,
  );
  elements.push(cardPlate, cardRule);

  const cardHead = await proseFrame(ctx, pg, [cardX0 + 12, 234, cardX1 - 12, 254], [
    { text: "Order record — three live fields", style: STYLE.tableHead },
  ]);
  elements.push(cardHead.frameId);

  const lines: Array<{ frameId: string; storyId: string }> = [];
  for (const [i, line] of CARD_LINES.entries()) {
    const y0 = 266 + i * 44;
    const made = await proseFrame(
      ctx,
      pg,
      [cardX0 + 12, y0, cardX1 - 12, y0 + 34],
      [{ text: line.label, style: STYLE.catalogEntry }],
    );
    lines.push(made);
    elements.push(made.frameId);
  }

  const commentary = await proseFrame(ctx, pg, [319, 220, 492, 448], [
    {
      text:
        "The caret lane. Each field went in at a real insertion point: the " +
        "page placed the caret after a label, and the plugin's lowering " +
        "asked the host's caret door (C-9) where “here” was. A field is " +
        "placed once — the session keys it by its binding id — so later " +
        "lowering passes on these pages re-resolve these three in place " +
        "rather than duplicating them.",
      style: STYLE.caption,
    },
  ]);
  elements.push(commentary.frameId);

  // ── the plugin drive ──────────────────────────────────────────────
  let statusText =
    "The query engine did not boot in this lane, so the card's lines " +
    "carry their labels and no fields — see the run notes.";

  const got = await importOrders(ctx, notes);
  if (got === "ready") {
    covers.push("editor-shell.plugin-bundles", "plugin-platform.file-picker");

    const resolved: string[] = [];
    for (const [i, line] of CARD_LINES.entries()) {
      await wizardMapSingle(page, line.column);
      const bindingId = `v_${line.column}`;
      await withActivePage(page, pageId, async () => {
        // The caret goes AFTER the label — offsets here are single-
        // paragraph ASCII, so byte and character spaces agree.
        await doc.designer.placeCaret(lines[i].storyId, line.label.length);
        await clickLower(page);
        const landed = await settle(
          page,
          async () => (await fieldValue(page, bindingId)) !== null,
          30_000,
        );
        if (!landed) {
          notes.push(
            `the wizard-mapped binding ${bindingId} lowered no field within 30 s — ` +
              "the D-01 placeholder lane did not commit on this lane.",
          );
        }
      });
      const value = await fieldValue(page, bindingId);
      if (value !== null) {
        resolved.push(`${line.column} → “${value}”`);
        chapterData.cardFields.push({
          binding: bindingId,
          column: line.column,
          storyId: lines[i].storyId,
        });
      }
    }

    if (chapterData.cardFields.length > 0) {
      // The wizard's product IS the fields — the mapping row is claimed
      // on landed evidence, not on the dialog having opened.
      covers.push(
        "data.bind.field-mapping",
        "data.bind.engine",
        "data.expr.engine",
      );
    }
    if (chapterData.cardFields.length === CARD_LINES.length) {
      covers.push(
        "plugin-platform.text-caret-door",
        "stories-text.fields.insert",
      );
      statusText =
        "All three fields above are tagged placeholder runs, not pasted " +
        `text. The engine resolved them from the first order: ${resolved.join(
          " · ",
        )}. The expression behind each is the engine's own suggestion from ` +
        "the mapping wizard — a bare column reference in the plugin's " +
        "publishing DSL.";
    } else if (chapterData.cardFields.length > 0) {
      statusText =
        `${chapterData.cardFields.length} of ${CARD_LINES.length} mapped ` +
        `bindings reached the card as fields (${resolved.join(" · ")}); ` +
        "the run notes carry the misses.";
    }
  }

  const status = await proseFrame(ctx, pg, [60, 470, 492, 560], [
    { text: statusText, style: STYLE.bodySmall },
  ]);
  elements.push(status.frameId);

  elements.push(
    await marginNote(
      ctx,
      pg,
      "Two shipped edges met here. The mapping wizard confirms bindings " +
        "in batches and every new binding's field lands at the one caret, " +
        "so this card took one wizard pass per line. And the order book's " +
        "date column is WITHHELD from the session: the query seam decodes " +
        "a DATE column as epoch-milliseconds where the engine expects " +
        "days, so any dated result refuses to ingest whole — found by " +
        "this page, driven around, not papered over. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, pg, [
      "Specimen No. 177",
      "importData · shell.pickFile · DuckDB-WASM → ready",
      "Map fields… ×3 (engine-computed exprs)",
      "lowerAll → insertField at the C-9 caret",
      "fields read back via document.placeholders",
    ]),
  );

  return {
    title: "The record card",
    covers,
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
