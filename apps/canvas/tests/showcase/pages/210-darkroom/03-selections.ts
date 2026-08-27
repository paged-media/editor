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

// Selections (p90) — the mask made visible. The apples photograph is
// ingested once; the RECTANGULAR MARQUEE and then QUICK SELECTION are
// driven as real pointer gestures on the real viewport (the camera is
// put on this page first — the image journeys' coordinate lesson:
// document pt through the live camera, never raw page px). The
// resulting engine-side coverage gates a loud saturation push, and the
// masked result goes through the chapter's loop — export → commit — so
// the page shows a photograph saturated only where the selection said.
//
// The panel's Selection readout (bounds + coverage %) is the engine
// answering, and both raw values are printed in the caption: numbers
// measured on this run, not typed.
//
// Fallback, stated not hidden: if the pointer lane lands no coverage
// (a camera/tool wiring regression, not a kernel gap), the command
// lane (select all) substitutes so the page still demonstrates a
// masked dispatch — with a full-extent mask, and a caption that says
// exactly that. Claims follow the measured outcome, not the plan.

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
  photo,
  replaceBytesFromFile,
  resetAdjustments,
  selectionBounds,
  selectionCoverage,
  setSlider,
  strokeOnPage,
} from "./00-support";

const APPLES = photo("pexels-574919-apples.jpg");
const APPLES_URI = "assets/photos/pexels-574919-apples.jpg";

/** The exhibit frame: the apples' 3:2 at a 300 pt width. */
const FRAME: [number, number, number, number] = [60, 158, 360, 358];

/** Poll the coverage readout until non-null (or timeout). */
async function awaitCoverage(
  ctx: PageContext,
  timeoutMs: number,
): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const c = await selectionCoverage(ctx);
    if (c !== null) return c;
    if (Date.now() >= deadline) return null;
    await ctx.page.waitForTimeout(200);
  }
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg = ctx.pageIds[0];
  const page = p(90);
  const elements: string[] = [];
  const notes: string[] = [];
  const covers: string[] = [];

  const gpu = await doc.gpuActive();

  const head = await proseFrame(ctx, page, [60, 58, 492, 88], [
    { text: "Selections — the mask, made visible", style: STYLE.head2 },
  ]);
  elements.push(head.frameId);

  // ── the exhibit frame ────────────────────────────────────────────
  const frame = await doc.rectangle(pg, FRAME);
  await assignLayer(ctx, "rectangle", frame, LAYER.content);
  await doc.mutate("placeImage", { elementId: frame, uri: APPLES_URI, fit: null });
  await replaceBytesFromFile(ctx, frame, APPLES);
  elements.push(frame);

  let marqueeReport = "not driven (no GPU on this lane)";
  let quickReport = "not driven";
  let maskedCoverage: number | null = null;
  let committed: number | null = null;
  let door = "none";

  if (gpu) {
    const importer = await ingestIntoFrame(
      ctx,
      frame,
      APPLES,
      "apples-selection.jpg",
      "image/jpeg",
    );
    if (importer === "media.paged.image.importer.raster") {
      await openAdjustments(ctx);
      await resetAdjustments(ctx);
      // NO resample on this page, deliberately. `resizeTo` swaps the
      // engine-held handle and (by code reading) nothing re-binds the
      // selection machinery the way decode's `selectionBind` does —
      // rather than gamble the mask on that seam, the selection works
      // at the photograph's native resolution.
      notes.push(
        "selection runs at native resolution — resizeTo swaps the " +
          "engine handle with no selectionBind (code reading; the " +
          "resample+selection seam is untested territory this page " +
          "chose not to stand on)",
      );

      // ── the pointer lane: marquee, then quick selection ──────────
      await fitPageForGesture(ctx, page);
      await armTool(ctx, TOOL.marqueeRect);
      // A drag well inside the frame (page pt): the lower-left basket
      // of apples, roughly.
      await strokeOnPage(ctx, page, [
        [95, 200],
        [265, 320],
      ]);
      const marqueeCov = await awaitCoverage(ctx, 10_000);
      const marqueeBounds = await selectionBounds(ctx);
      marqueeReport =
        marqueeCov !== null
          ? `marquee: ${marqueeCov.toFixed(1)}% at ${marqueeBounds ?? "?"}`
          : "marquee drag landed no coverage";

      // Quick selection REPLACES the marquee: paint a stroke and let
      // the region grow from the painted statistics.
      await armTool(ctx, TOOL.quickSelect);
      await strokeOnPage(ctx, page, [
        [120, 230],
        [170, 250],
        [220, 270],
        [260, 290],
      ]);
      const quickCov = await awaitCoverage(ctx, 10_000);
      quickReport =
        quickCov !== null
          ? `quick selection grew to ${quickCov.toFixed(1)}%`
          : "quick-selection stroke landed no coverage";

      maskedCoverage = quickCov ?? marqueeCov;
      door = quickCov !== null ? "quick selection" : marqueeCov !== null ? "marquee" : "none";
      if (maskedCoverage === null) {
        // The stated fallback: the command lane. Full extent — and the
        // caption says so.
        await doc.runCommand(CMD.selectAll);
        maskedCoverage = await awaitCoverage(ctx, 10_000);
        door = maskedCoverage !== null ? "select all (command fallback)" : "none";
        notes.push(
          "pointer selection lane landed no coverage; the command lane " +
            "(select all) substituted — the masked dispatch below ran " +
            "against the full extent",
        );
      } else {
        covers.push("image.selection.mask-tools", "image.selection.mask");
      }

      if (maskedCoverage !== null) {
        // Soften the mask edge, then the masked adjustment: a loud
        // saturation push that only the covered pixels receive.
        await doc.runCommand(CMD.feather);
        await setSlider(ctx, "Saturation", 2.8);
        const out = await exportDownload(ctx, EXPORTER.jpeg);
        if ("bytes" in out) {
          committed = await commitBytes(ctx, frame, out.bytes);
          if (door === "quick selection" || door === "marquee") {
            covers.push("image.selection.masked-pipeline");
          }
        } else {
          notes.push(`masked export: ${out.reason}`);
        }
        await doc.runCommand(CMD.deselect);
      } else {
        notes.push(
          "no selection landed by any door — the frame carries the " +
            "uncorrected photograph and no masked claim is made",
        );
      }
    } else {
      notes.push(`importer answered "${importer}" — selection page not driven`);
    }
  }

  // ── captions, written from the measured outcome ──────────────────
  const abi = await proseFrame(ctx, page, [372, 158, 492, 380], [
    {
      text: "THE MASK ABI",
      style: STYLE.specLabel,
    },
    {
      text:
        "A selection is an engine-side coverage field over the ingested " +
        "pixels. At dispatch it is lowered to a per-tile r16float window " +
        "and bound at the kernel ABI's group 2 — every pointwise kernel " +
        "composites mix(backdrop, result, mask), so one mask gates the " +
        "whole adjustment vocabulary without any kernel knowing.",
      style: STYLE.caption,
    },
    {
      text:
        "Add, subtract and intersect are max, min and multiply on the " +
        "same field; feather is a gaussian pass over the mask, not the " +
        "image.",
      style: STYLE.caption,
    },
  ]);
  elements.push(abi.frameId);

  const outcomeParas =
    committed !== null
      ? [
          {
            text:
              `What ran on this build: ${marqueeReport}; ${quickReport}. ` +
              `The ${door} mask (${(maskedCoverage ?? 0).toFixed(1)}% of ` +
              "the image, feathered) gated a saturation push to 2.8, and " +
              "the masked result was exported and committed — " +
              `${committed.toLocaleString("en-US")} bytes of inline JPEG. ` +
              "Where the photograph above is loud, the mask said yes; " +
              "where it is quiet, the same dispatch was arithmetic " +
              "multiplied by zero.",
            style: STYLE.body,
          },
          {
            text:
              "The figures in this caption are the engine's own Selection " +
              "readouts (bounds and coverage), read from the panel on this " +
              "run — measured, not typed.",
            style: STYLE.bodySmall,
          },
        ]
      : [
          {
            text:
              "This lane ran without a GPU, or without a landed mask, so " +
              "the photograph above is the placed original and this " +
              "caption says so — the demonstration degraded honestly " +
              `rather than fake a mask. (${marqueeReport}; ${quickReport}.)`,
            style: STYLE.body,
          },
        ];
  const outcome = await proseFrame(ctx, page, [60, 380, 492, 470], outcomeParas);
  elements.push(outcome.frameId);

  await marginNote(
    ctx,
    page,
    "The selection itself is session state — a coverage field over " +
      "ingested pixels, with no .paged representation. What persists is " +
      "the masked result, committed as inline bytes. → Appendix A",
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 133",
      "marquee + quick selection as pointer gestures",
      "masked adjust → export → replaceImageBytes",
    ]),
  );

  return {
    title: "Selections — the mask made visible",
    covers,
    elements,
    notes,
  };
}
