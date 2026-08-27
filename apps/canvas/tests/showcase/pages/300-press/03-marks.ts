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

// The marks plate — p122, D-Plate verso, full-bleed. The anatomy of a
// press sheet drawn as native geometry: the trim rule, the nine-point
// bleed band, crop marks and registration marks — Slate hairlines and
// Vermilion accents, every one an insertLine / insertOval /
// insertFrame the wire minted.
//
// One honest boundary, stated on the page and in the margin: a page
// RENDER stops at its own trim, so this plate depicts the apparatus
// INSIDE the sheet (the trim rule drawn 36 pt in, the bleed band as
// the ring outside it). The real marks are minted OUTSIDE the trim by
// the export door — `exportPdf` takes `cropMarks`, `registrationMarks`
// and `bleedOverridePt` — in the assembly's press pass, where a proof
// belongs. This page DEPICTS; the assembly PERFORMS.
//
// Styling rides ONE batch at the end (stroke colour/weight + layer for
// every line and circle): each mutation pays a full recompose against
// the whole authored book on the in-chain run, and a batch is one
// mutation.

import { plate, proseFrame, marginNote, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

/** The depicted sheet: trim drawn 36 pt inside the page, bleed 9 pt
 *  outside that trim, crop marks 5 pt beyond the bleed. */
const TRIM = 36;
const BLEED = 9;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const page = p(122);
  const pageId = ctx.pageIds[0];

  const t0 = TRIM;
  const t1x = 540 - TRIM;
  const t1y = 720 - TRIM;
  const b0 = TRIM - BLEED;
  const b1x = 540 - TRIM + BLEED;
  const b1y = 720 - TRIM + BLEED;

  // ── the field, the bleed band, the sheet ─────────────────────────
  elements.push(
    await plate(ctx, page, [0, 0, 540, 720], SWATCH.paperWarm, LAYER.background),
  );
  // The bleed band: a Vermilion 20% ring — the sheet plate covers all
  // but the 9 pt between bleed edge and trim.
  const band = await plate(
    ctx,
    page,
    [b0, b0, b1x, b1y],
    SWATCH.vermilionTint,
    LAYER.content,
  );
  elements.push(band);
  const sheet = await plate(
    ctx,
    page,
    [t0, t0, t1x, t1y],
    SWATCH.paperWarm,
    LAYER.content,
  );
  elements.push(sheet);

  // ── native lines and circles, styled as one batch below ──────────
  const slateLines: string[] = [];
  const vermilionLines: string[] = [];
  const circles: string[] = [];
  const line = async (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    bucket: string[],
  ): Promise<string> => {
    const id = await doc.mutateId("insertLine", {
      pageId,
      start: [x0, y0],
      end: [x1, y1],
    });
    bucket.push(id);
    elements.push(id);
    return id;
  };

  // The trim rule: four Slate hairlines exactly on the depicted trim.
  await line(t0, t0, t1x, t0, slateLines);
  await line(t0, t1y, t1x, t1y, slateLines);
  await line(t0, t0, t0, t1y, slateLines);
  await line(t1x, t0, t1x, t1y, slateLines);

  // Crop marks: at each corner, one horizontal and one vertical
  // hairline aligned with the trim, starting 5 pt beyond the bleed.
  const gap = 5;
  const len = 14;
  const near = b0 - gap; // 22 — mark end nearest the sheet
  const farX = b1x + gap;
  const farY = b1y + gap;
  for (const y of [t0, t1y]) {
    await line(near - len, y, near, y, slateLines); // left pair
    await line(farX, y, farX + len, y, slateLines); // right pair
  }
  for (const x of [t0, t1x]) {
    await line(x, near - len, x, near, slateLines); // top pair
    await line(x, farY, x, farY + len, slateLines); // bottom pair
  }

  // Registration marks: circle + crosshair, Vermilion — the press's
  // alignment targets. Three edges only: the bottom edge belongs to
  // the annual's own apparatus band (spec label + margin note live
  // there on every page), and a target under running text would be
  // the one dishonest mark on the plate.
  const reg = async (cx: number, cy: number): Promise<void> => {
    const r = 5;
    const oval = await doc.mutateId("insertOval", {
      pageId,
      bounds: [cy - r, cx - r, cy + r, cx + r],
    });
    circles.push(oval);
    elements.push(oval);
    await line(cx - r - 3, cy, cx + r + 3, cy, vermilionLines);
    await line(cx, cy - r - 3, cx, cy + r + 3, vermilionLines);
  };
  await reg(270, 16);
  await reg(16, 300);
  await reg(524, 300);

  // Label pointers, Vermilion. The crop-mark pointer runs diagonally
  // to the top-right vertical mark (marks live only at the corners);
  // the registration pointer reaches the left-edge target.
  await line(150, 47, 150, t0 + 1, vermilionLines); // → trim rule
  await line(255, 47, 255, b0 + 4, vermilionLines); // → bleed band
  await line(430, 47, t1x - 2, near - 2, vermilionLines); // → crop mark
  await line(58, 328, 26, 306, vermilionLines); // → registration

  const slate = await doc.swatch(SWATCH.slate);
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const contentLayer = await doc.layerId(LAYER.content);
  const styleOps: Array<{ op: string; args: unknown }> = [];
  const styleLine = (id: string, colour: string, weight: number): void => {
    styleOps.push(
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "graphicLine", id },
          path: "frameStrokeColor",
          value: { type: "colorRef", value: colour },
        },
      },
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "graphicLine", id },
          path: "frameStrokeWeight",
          value: { type: "length", value: weight },
        },
      },
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "graphicLine", id },
          path: "itemLayer",
          value: { type: "text", value: contentLayer },
        },
      },
    );
  };
  for (const id of slateLines) styleLine(id, slate, 0.35);
  for (const id of vermilionLines) styleLine(id, vermilion, 0.5);
  for (const id of circles) {
    styleOps.push(
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "oval", id },
          path: "frameFillColor",
          value: { type: "colorRef", value: "Swatch/None" },
        },
      },
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "oval", id },
          path: "frameStrokeColor",
          value: { type: "colorRef", value: vermilion },
        },
      },
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "oval", id },
          path: "frameStrokeWeight",
          value: { type: "length", value: 0.5 },
        },
      },
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "oval", id },
          path: "itemLayer",
          value: { type: "text", value: contentLayer },
        },
      },
    );
  }
  await doc.mutate("batch", { ops: styleOps });

  // ── the labels ───────────────────────────────────────────────────
  const label = async (
    x: number,
    text: string,
    width = 96,
  ): Promise<void> => {
    const f = await proseFrame(ctx, page, [x - width / 2, 56, x + width / 2, 84], [
      { text, style: STYLE.specValue },
    ]);
    elements.push(f.frameId);
  };
  await label(150, "trim rule");
  await label(255, "bleed · 9 pt");
  await label(430, "crop marks");
  const regLabel = await proseFrame(ctx, page, [60, 316, 200, 344], [
    { text: "registration", style: STYLE.specValue },
  ]);
  elements.push(regLabel.frameId);

  // ── the account ──────────────────────────────────────────────────
  const account = await proseFrame(ctx, page, [120, 380, 420, 600], [
    { text: "The sheet, annotated", style: STYLE.head2 },
    {
      text:
        "Every page of this annual is a 540 × 720 pt sheet, and this one draws the press apparatus on itself: the Slate trim rule, the tinted nine-point bleed band outside it, crop marks held five points off the bleed, and the registration targets a press aligns its plates by — three of them, the fourth edge ceded to this book's own apparatus band below. Nothing here is decoration borrowed from a template — each mark is a native line, circle or rectangle this page minted over the wire.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        "And every one of them is a depiction. A page render stops at its own trim, so the anatomy is drawn 36 points in, where it can be seen. The real marks are minted outside the trim by the export door — exportPdf carries cropMarks, registrationMarks, colorBars and bleedOverridePt — in the assembly's PDF/X-4 press pass, on the finished book, where a proof belongs.",
      style: STYLE.body,
    },
  ]);
  elements.push(account.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 188",
      "insertLine ×22 · insertOval ×3",
      "depicted — the real marks land at export",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "A page render stops at its trim, so this plate DEPICTS bleed and " +
        "marks inside the sheet; the real ones are minted outside the trim " +
        "by exportPdf (cropMarks / registrationMarks / bleedOverridePt) in " +
        "the assembly's press pass. → Appendix A",
    ),
  );

  return {
    title: "The marks plate — trim, bleed and marks anatomy",
    covers: [
      "frames-paths.line.insert",
      "frames-paths.shape-tools",
      "color-swatches.fill-stroke-apply",
    ],
    elements,
  };
}
