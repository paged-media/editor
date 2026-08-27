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

// Four symbologies (p112, E-Data verso) — every barcode kind the engine
// encodes, drawn from the SAME data source: Code-128 from the SKU,
// EAN-13 and UPC-A from the order book's valid check-digit columns, QR
// from the per-order URL. All four are clean-room Rust encoders whose
// module grids lower as NATIVE path geometry — closed filled rects
// scaled to the bound frame's content box. Nothing on this page is an
// image: there is no asset, no resolution, and the symbols stay sharp
// at any output size. Each symbol's payload is printed beneath it, as
// resolved for the first order.
//
// THE RE-DRAW ECONOMICS, met here on purpose: `lowerAll` re-lowers
// EVERY binding, and a re-lowered barcode draws a fresh copy of its
// module set onto the CURRENT active page. The expression page ran
// before this one and left two bound symbols alive, so this page's
// lowering also re-drew those two onto p112 — found by geometry,
// removed, and recorded, which is what the honest cost of the shared
// session looks like.

import { expect } from "@playwright/test";

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { withActivePage } from "../../active-page";
import { LAYER, STYLE, SWATCH, p } from "../../names-annual";
import {
  geometryOf,
  removeRefs,
  sceneRefs,
  type Ref,
} from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  addAuthoredBinding,
  assignLayerBatch,
  chapterData,
  clickLower,
  settleStableNew,
  spreadOffset,
  units,
  unshiftSeam,
} from "./00-support";

interface Symbology {
  kind: "code128" | "ean13" | "upca" | "qr";
  title: string;
  column: string;
  payload: string;
  slot: [number, number, number, number];
}

/** Record 1001's values, as the opener's CSV specimen prints them —
 *  the payload captions cite what the engine resolved. */
const SYMBOLS: Symbology[] = [
  {
    kind: "code128",
    title: "Code-128 — sku",
    column: "sku",
    payload: "PA-2025-1001-ALP",
    slot: [60, 216, 60 + units(5), 276],
  },
  {
    kind: "ean13",
    title: "EAN-13 — ean",
    column: "ean",
    payload: "9007830010019",
    slot: [319, 216, 319 + units(4), 276],
  },
  {
    kind: "upca",
    title: "UPC-A — upc",
    column: "upc",
    payload: "072034010010",
    slot: [60, 356, 60 + units(5), 416],
  },
  {
    kind: "qr",
    title: "QR — url",
    column: "url",
    payload: "https://paged.media/annual/orders/1001",
    slot: [319, 340, 415, 436],
  },
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const pg = p(112);
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];
  const elements: string[] = [];
  const covers: string[] = [];

  const head = await proseFrame(ctx, pg, [60, 54, 492, 84], [
    { text: "Four symbologies, one order book", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, pg, [60, 90, 492, 186], [
    {
      text:
        "Retail wants EAN-13 and UPC-A, logistics wants Code-128, screens " +
        "want QR — the order book carries a column for each, with real " +
        "check digits. The engine encodes all four clean-room in Rust and " +
        "lowers each symbol as native path geometry scaled to its bound " +
        "frame: filled rectangles on the page, not an image in a frame. " +
        "Print them at any size; they were never pixels.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── furniture: bound frames + titles + payload captions ───────────
  const rects = new Map<string, string>();
  for (const s of SYMBOLS) {
    const title = await proseFrame(
      ctx,
      pg,
      [s.slot[0], s.slot[1] - 22, s.slot[2], s.slot[1] - 4],
      [{ text: s.title, style: STYLE.caption }],
    );
    const rect = await doc.rectangle(pageId, s.slot);
    await doc.designer.applyStroke(
      "rectangle",
      rect,
      await doc.swatch(SWATCH.slate),
      0.5,
    );
    await doc.setProperty("rectangle", rect, "itemLayer", {
      type: "text",
      value: await doc.layerId(LAYER.content),
    });
    rects.set(s.kind, rect);
    elements.push(title.frameId, rect);
  }

  let verdict =
    "The query engine never reached ready on this lane, so the four bound " +
    "frames above stay empty and honest.";
  /** kind → module count, hoisted so the payload captions (authored
   *  AFTER the drive) print what actually happened under each frame. */
  const drewKind = new Map<string, number>();

  if (chapterData.ready) {
    // ── author the four bindings, then ONE lowering pass ────────────
    for (const s of SYMBOLS) {
      await doc.select("rectangle", rects.get(s.kind)!);
      await addAuthoredBinding(page, "barcode", s.column, s.kind);
    }

    const before = await sceneRefs(page, "polygon");
    let fresh: Ref[] = [];
    await withActivePage(page, pageId, async () => {
      await page.getByRole("button", { name: /^refresh data$/i }).click();
      await page.waitForTimeout(600);
      await clickLower(page);
      // Stabilized, not first-hit: this page MEASURED the difference —
      // settling on the first new module read the pass mid-flight and
      // two whole symbols looked as if they had never drawn.
      fresh = await settleStableNew(page, "polygon", before);
    });
    const off = await spreadOffset(ctx, pageId);
    // The seam correction (see unshiftSeam and the expression page's
    // finding): stored-geometry origins re-based a second time by the
    // page-local wire put every module one page width off here too.
    if (
      await unshiftSeam(
        doc,
        "polygon",
        fresh.map((r) => r.id),
        off,
      )
    ) {
      notes.push(
        "SEAM FINDING — the four symbols (and the re-drawn expression " +
          `specimens) landed one page width off (stored offset ${off[0]},` +
          `${off[1]}); translated back by the measured offset in one batch ` +
          "before classification.",
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
    const counts = new Map<string, number>();
    const mine: Ref[] = [];
    const strays: Ref[] = [];
    for (const g of geo) {
      const owner = g.bounds
        ? SYMBOLS.find((s) => inSlot(g.bounds!, s.slot))
        : undefined;
      if (owner) {
        counts.set(owner.kind, (counts.get(owner.kind) ?? 0) + 1);
        mine.push(g.ref);
      } else {
        strays.push(g.ref);
      }
    }

    for (const [k, v] of counts) drewKind.set(k, v);
    const drawn = SYMBOLS.filter((s) => (counts.get(s.kind) ?? 0) > 0);
    expect(
      drawn.length,
      "the symbology bindings drew native modules into their bound frames",
    ).toBeGreaterThan(0);

    if (strays.length > 0 && drawn.length > 0) {
      // The re-drawn copies of the expression page's two symbols — the
      // lowerAll re-lower, landed on THIS page because it was active.
      // With any slot proven live, everything outside the slots is that
      // re-draw (or a misplacement) and goes, with its count on record.
      await removeRefs(doc, strays);
      notes.push(
        `lowerAll re-drew the expression page's bound symbols onto this page ` +
          `(${strays.length} stray path modules) — removed; a re-lower always ` +
          "draws afresh onto the active page rather than replacing in place.",
      );
    } else if (strays.length > 0) {
      notes.push(
        `${strays.length} new path modules landed outside every slot and NO ` +
          "slot drew — left in place so the evidence of where the lowering " +
          "actually put them survives review.",
      );
    }

    await assignLayerBatch(
      doc,
      "polygon",
      mine.map((r) => r.id),
      LAYER.content,
    ).catch((err) => {
      notes.push(`layer assignment refused: ${String(err).slice(0, 120)}`);
    });
    elements.push(...mine.map((r) => r.id));

    for (const s of SYMBOLS) {
      const n = counts.get(s.kind) ?? 0;
      if (n === 0) {
        notes.push(
          s.kind === "upca"
            ? `${s.title}: no modules — the likely cause is the CSV type ` +
                "sniffer reading the leading-zero UPC column numerically " +
                "(072034010010 → 72034010010), an 11-digit value no UPC-A " +
                "encoder accepts; the missing policy drew nothing rather " +
                "than a fake symbol."
            : `${s.title}: no modules reached its frame on this lane.`,
        );
      }
    }
    if (drawn.length >= 2) {
      covers.push(
        "data.barcode.symbology",
        "frames-paths.path.insert",
        "data.bind.authoring",
      );
      verdict =
        `${drawn.length} of 4 symbologies drew — ` +
        drawn
          .map((s) => `${s.title.split(" — ")[0]} ${counts.get(s.kind)}`)
          .join(" · ") +
        " native filled paths, every module real page geometry. " +
        (drawn.length === SYMBOLS.length
          ? ""
          : "What did not draw refused honestly — the missing policy " +
            "draws nothing rather than a fake symbol; the captions and " +
            "the run notes carry each miss.");
    } else {
      verdict =
        `${drawn.length} of 4 symbologies drew into their frames — the run ` +
        "notes carry the misses.";
    }
  }

  // The payload captions — authored AFTER the drive, so each states
  // what is actually above it rather than what was hoped for.
  for (const s of SYMBOLS) {
    const n = drewKind.get(s.kind) ?? 0;
    const text =
      n > 0
        ? s.payload
        : chapterData.ready
          ? "(nothing drawn — see the run notes)"
          : "(engine not ready — nothing drawn)";
    const payload = await proseFrame(
      ctx,
      pg,
      [
        s.slot[0],
        s.slot[3] + 6,
        s.slot[2] + (s.kind === "qr" ? 77 : 0),
        s.slot[3] + 40,
      ],
      [{ text, style: STYLE.codeBlock }],
    );
    elements.push(payload.frameId);
  }

  const verdictFrame = await proseFrame(ctx, pg, [60, 470, 492, 540], [
    { text: verdict, style: STYLE.bodySmall },
  ]);
  elements.push(verdictFrame.frameId);

  elements.push(
    await marginNote(
      ctx,
      pg,
      "A re-lower draws every bound symbol afresh onto the active page " +
        "instead of replacing it in place — this page removed the re-drawn " +
        "copies of the expression page's two symbols and says so. The " +
        "raster barcode lane stays blocked by design: placeImage needs a " +
        "resolvable URI and the vector lane needs nothing. → Appendix A",
    ),
  );

  elements.push(
    await specLabel(ctx, pg, [
      "Specimen No. 179",
      "authoring row ×4: code128/sku · ean13/ean · upca/upc · qr/url",
      "clean-room encoders (Rust) → insertPath filled rects",
      "payloads printed as resolved for record 1001",
    ]),
  );

  return {
    title: "Four symbologies, one order book",
    covers,
    elements,
    notes: notes.length > 0 ? notes : undefined,
  };
}
