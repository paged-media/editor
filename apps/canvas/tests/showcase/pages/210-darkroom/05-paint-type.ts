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

// Paint + raster type (p92) — three strokes and a word, into pixels.
// The brush and pencil paint raster dabs into the ingested image (the
// journeys' pointer sequence: arm the tool through its activation
// command, hover to let the frame fit resolve, then drag in document
// pt through the live camera). The raster TYPE tool stamps a shaped
// glyph run at a clicked baseline — harfrust shaping, the document's
// own registered face, glyphs rasterised into the same layer lane the
// dabs use. Then the loop: export → replaceImageBytes.
//
// CLAIMS: none. `image.editor.paint` and `image.editor.raster-type`
// are PARTIAL rows in the registry (per-gesture stroke commits, Stage-B
// deferred; one run on one line, no text object) — this page
// demonstrates them and the margin note carries the limits, but a
// partial row is never claimed (AUTHORING rule 6).

import type { PageContext, PageReport } from "../../types";
import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, p } from "../../names-annual";
import {
  CMD,
  EXPORTER,
  TOOL,
  armTool,
  commitBytes,
  exportDownload,
  fitPageForGesture,
  ingestIntoFrame,
  openAdjustments,
  panelStatus,
  photo,
  pointOnPage,
  replaceBytesFromFile,
  resetAdjustments,
  setSlider,
  strokeOnPage,
} from "./00-support";

const APPLES = photo("pexels-574919-apples.jpg");
const APPLES_URI = "assets/photos/pexels-574919-apples.jpg";

/** The working tile: 3:2 at a 280 pt width. */
const TILE: [number, number, number, number] = [60, 158, 340, 345];

/** Poll the status line until it matches AND differs from `previous` —
 *  without the second clause the next stroke's poll instantly matches
 *  the PREVIOUS stroke's still-displayed "Painted N dabs" line and
 *  mis-attributes the landing. */
/** The dab count out of a "Painted N dabs" status — 0 when absent.
 *  A committed stroke with ZERO dabs is not a landing (run 6's lesson:
 *  the pattern matches "Painted 0 dabs" and a poll that stops there
 *  reports a dead stroke as landed). */
function dabCount(status: string | null): number {
  const m = status ? /Painted (\d+) dab/.exec(status) : null;
  return m ? Number(m[1]) : 0;
}

async function statusLanded(
  ctx: PageContext,
  pattern: RegExp,
  timeoutMs: number,
  previous: string | null = null,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await panelStatus(ctx);
    if (pattern.test(status) && status !== previous) return status;
    if (Date.now() >= deadline) return null;
    await ctx.page.waitForTimeout(250);
  }
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg = ctx.pageIds[0];
  const page = p(92);
  const elements: string[] = [];
  const notes: string[] = [];

  const gpu = await doc.gpuActive();

  const head = await proseFrame(ctx, page, [60, 58, 492, 88], [
    { text: "Paint and the raster word", style: STYLE.head2 },
  ]);
  const intro = await proseFrame(ctx, page, [60, 92, 492, 148], [
    {
      text:
        "Painting needed no new kernel: a dab is a solid composited " +
        "through the requested blend with stroke coverage as the mask, " +
        "and erasing is one alpha write. Type is the fifth feature to " +
        "fall out of the same mask ABI — a shaped glyph run IS a coverage " +
        "field, so a word composites exactly like a brushstroke that " +
        "happens to spell something.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  const tile = await doc.rectangle(pg, TILE);
  await assignLayer(ctx, "rectangle", tile, LAYER.content);
  await doc.mutate("placeImage", { elementId: tile, uri: APPLES_URI, fit: null });
  await replaceBytesFromFile(ctx, tile, APPLES);
  elements.push(tile);

  const strokes: string[] = [];
  let typeLanded: string | null = null;
  let committed: number | null = null;
  let changed = false;

  if (gpu) {
    const importer = await ingestIntoFrame(
      ctx,
      tile,
      APPLES,
      "apples-paint.jpg",
      "image/jpeg",
    );
    if (importer === "media.paged.image.importer.raster") {
      await openAdjustments(ctx);
      await resetAdjustments(ctx);
      // NO resample before the tool lanes — the retouch and selection
      // pages' finding, confirmed here empirically: after a panel
      // Resample the machine-driven lanes act against the swapped-out
      // handle (this page's first run painted "0 dabs" and a type run
      // that reported success while the export stayed byte-identical).
      // Strokes and glyphs land on the native 1600 × 1067 pixels.
      const baseline = await exportDownload(ctx, EXPORTER.jpeg);

      await fitPageForGesture(ctx, page);

      // ── stroke one: a broad yellow arc with the brush ────────────
      // Panel setup FIRST, then arm, then a PRIMER TAP inside the
      // frame before the drag. The retouch page's strokes land and
      // this page's did not, and the one mechanical difference was its
      // alt-click preceding the first drag — a single canvas
      // interaction that lets the tool's async frame-fit resolve
      // against real pointer traffic. The tap deposits one dab at
      // worst; the strokes are the exhibit.
      // Stroke ONE deliberately keeps the DEFAULT brush colour: on the
      // earlier proof runs every stroke that followed a
      // [data-image-brush-color] change deposited zero dabs while the
      // retouch page's colour-untouched clone/heal landed — so this
      // page now runs the experiment: default-colour stroke first,
      // colour change only before stroke two, and the notes record
      // which of them landed.
      await setSlider(ctx, "Size (px)", 150); // brush section — first Size (px); IMAGE px on the 1600-wide source
      await armTool(ctx, TOOL.brush);
      const primer = await pointOnPage(ctx, page, 200, 250);
      await ctx.page.mouse.move(primer.x, primer.y);
      await ctx.page.waitForTimeout(1_200);
      await ctx.page.mouse.click(primer.x, primer.y);
      await ctx.page.waitForTimeout(600);
      const preOne = await panelStatus(ctx);
      await strokeOnPage(ctx, page, [
        [80, 200],
        [140, 180],
        [210, 185],
        [280, 210],
      ]);
      const one = await statusLanded(ctx, /Painted \d+ dab/, 20_000, preOne);
      if (one) strokes.push(`brush, default colour, 150 px → ${one.slice(0, 60)}`);

      // ── stroke two: a narrower magenta counter-curve ─────────────
      // Status reset between strokes — identical "Painted N dabs"
      // lines would false-negative the differs-from-previous poll
      // (the retouch page's heal taught this).
      await doc.runCommand(CMD.deselect);
      await setSlider(ctx, "Size (px)", 64);
      await ctx.page
        .locator("[data-image-brush-color]")
        .selectOption({ label: "Magenta" });
      const preTwo = await panelStatus(ctx);
      await strokeOnPage(ctx, page, [
        [90, 260],
        [160, 285],
        [240, 275],
        [300, 250],
      ]);
      const two = await statusLanded(ctx, /Painted \d+ dab/, 20_000, preTwo);
      if (two) strokes.push(`brush, magenta, 64 px → ${two.slice(0, 60)}`);

      // ── stroke three: the pencil, hard-edged and thin ────────────
      await doc.runCommand(CMD.deselect);
      await armTool(ctx, TOOL.pencil);
      await setSlider(ctx, "Size (px)", 26);
      await ctx.page
        .locator("[data-image-brush-color]")
        .selectOption({ label: "Cyan" });
      const preThree = await panelStatus(ctx);
      await strokeOnPage(ctx, page, [
        [85, 230],
        [180, 240],
        [290, 232],
      ]);
      const three = await statusLanded(ctx, /Painted \d+ dab/, 20_000, preThree);
      if (three) strokes.push(`pencil, cyan, 26 px → ${three.slice(0, 60)}`);
      if (dabCount(one) + dabCount(two) + dabCount(three) === 0) {
        // Every solid stroke committed with ZERO dabs — brush, pencil,
        // default colour and changed colour alike — while the previous
        // page's sample-mode clone and heal land through identical
        // gestures (their counts are in the retouch module's record).
        // Type composites through the same solid lane, which is why its
        // "set" report pairs with an unchanged export below.
        notes.push(
          "finding: every solid-paint stroke committed with zero dabs " +
            "(brush and pencil, default and changed colour alike) while " +
            "the sample-mode clone/heal on the previous page land " +
            "through identical gestures — the solid-deposit lane, which " +
            "brush, pencil and raster type share, is the measured suspect",
        );
      }

      // ── the word: raster type at a clicked baseline ──────────────
      await ctx.page.locator("[data-image-type-text]").fill("DARKROOM");
      await ctx.page
        .locator("[data-image-type-family]")
        .fill("Space Grotesk");
      await setSlider(ctx, "Size (px)", 190, 1); // type section — second; image px
      await ctx.page
        .locator("[data-image-brush-color]")
        .selectOption({ label: "White" }); // type paints the brush colour
      await armTool(ctx, TOOL.type);
      const baselinePt = await pointOnPage(ctx, page, 92, 322);
      await ctx.page.mouse.move(baselinePt.x, baselinePt.y);
      await ctx.page.waitForTimeout(750);
      await ctx.page.mouse.click(baselinePt.x, baselinePt.y);
      typeLanded = await statusLanded(ctx, /Type set in/, 20_000);

      // ── the loop ─────────────────────────────────────────────────
      const out = await exportDownload(ctx, EXPORTER.jpeg);
      if ("bytes" in out) {
        committed = await commitBytes(ctx, tile, out.bytes);
        if ("bytes" in baseline) changed = !out.bytes.equals(baseline.bytes);
      } else {
        notes.push(`paint export: ${out.reason}`);
      }
      for (const s of strokes) notes.push(s);
      notes.push(
        typeLanded
          ? `type → ${typeLanded.slice(0, 120)}`
          : "type: no glyph run reported by the panel",
      );
      if (!changed) {
        notes.push(
          "the painted export is byte-identical to the identity baseline " +
            "— no stroke or glyph landed; the captions state it",
        );
      }
    } else {
      notes.push(`importer answered "${importer}" — paint page not driven`);
    }
  } else {
    notes.push(
      "no GPU render path — dab and glyph composites are WGSL dispatches, " +
        "so the tile shows the photograph unpainted",
    );
  }

  const cap = await proseFrame(ctx, page, [60, 352, 340, 420], [
    {
      text:
        committed !== null && changed
          ? `Three strokes (brush 150 px in the default ink, brush 64 px ` +
            `magenta, pencil 26 px cyan) and one shaped run — “DARKROOM”, ` +
            `Space Grotesk 190 px — committed as ` +
            `${committed.toLocaleString("en-US")} B of inline JPEG.`
          : "The strokes and the word did not land on this lane; the tile " +
            "carries the photograph unpainted, and this caption is the " +
            "record of that.",
      style: STYLE.specLabel,
    },
  ]);
  elements.push(cap.frameId);

  const method = await proseFrame(ctx, page, [352, 158, 492, 412], [
    { text: "HOW A STROKE LANDS", style: STYLE.specLabel },
    {
      text:
        "Arm the tool, hover, drag: spacing carries leftover arc length " +
        "across pointer samples, so a fast drag still paints a stroke " +
        "rather than a row of dots. Parameters freeze at pointer-down. " +
        "Strokes commit per gesture into the active layer, journaled in " +
        "the plugin's bounded undo.",
      style: STYLE.caption,
    },
    {
      text:
        "The word is shaped by the face's own tables through harfrust — " +
        "joining scripts come out joined — and the face comes from the " +
        "document's registry, never the network. A glyph the face lacks " +
        "is counted and left undrawn.",
      style: STYLE.caption,
    },
  ]);
  elements.push(method.frameId);

  await marginNote(
    ctx,
    page,
    "Paint and raster type are PARTIAL rows, demonstrated but unclaimed: " +
      "strokes commit per gesture (Stage-B per-drag preview is deferred), " +
      "and type is one run on one line — no wrapping, no text object. " +
      "→ Appendix A",
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 135",
      "brush · pencil · raster type (harfrust-shaped)",
      "strokes → export → replaceImageBytes",
    ]),
  );

  return {
    title: "Paint and the raster word",
    covers: [],
    elements,
    notes,
  };
}
