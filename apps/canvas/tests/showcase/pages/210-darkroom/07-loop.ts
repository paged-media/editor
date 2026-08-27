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

// The darkroom loop, closed (p94) — the chapter's workflow written out
// as the numbered procedure it is, run one more time in front of the
// reader with the byte counts of THIS run in the text, and the
// chapter's honesty block: the three limits a careful reader should
// know, stated on the page that taught the loop.

import { statSync } from "node:fs";

import type { PageContext, PageReport } from "../../types";
import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, p } from "../../names-annual";
import {
  EXPORTER,
  commitBytes,
  exportDownload,
  ingestIntoFrame,
  openAdjustments,
  photo,
  replaceBytesFromFile,
  resampleTo,
  resetAdjustments,
  setSlider,
} from "./00-support";

const APPLES = photo("pexels-574919-apples.jpg");
const APPLES_URI = "assets/photos/pexels-574919-apples.jpg";

/** The pair of step images: 3:2 at 130 pt. */
const PLACED: [number, number, number, number] = [60, 268, 190, 355];
const COMMITTED: [number, number, number, number] = [232, 268, 362, 355];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg = ctx.pageIds[0];
  const page = p(94);
  const elements: string[] = [];
  const notes: string[] = [];

  const gpu = await doc.gpuActive();
  const asShot = statSync(APPLES).size;

  const head = await proseFrame(ctx, page, [60, 58, 492, 88], [
    { text: "The darkroom loop, closed", style: STYLE.head2 },
  ]);
  elements.push(head.frameId);

  // ── run the loop once more, for the byte counts ──────────────────
  const placed = await doc.rectangle(pg, PLACED);
  await assignLayer(ctx, "rectangle", placed, LAYER.content);
  await doc.mutate("placeImage", { elementId: placed, uri: APPLES_URI, fit: null });
  await replaceBytesFromFile(ctx, placed, APPLES);

  const committedFrame = await doc.rectangle(pg, COMMITTED);
  await assignLayer(ctx, "rectangle", committedFrame, LAYER.content);
  await doc.mutate("placeImage", {
    elementId: committedFrame,
    uri: APPLES_URI,
    fit: null,
  });
  await replaceBytesFromFile(ctx, committedFrame, APPLES);
  elements.push(placed, committedFrame);

  let exported: number | null = null;
  if (gpu) {
    const importer = await ingestIntoFrame(
      ctx,
      committedFrame,
      APPLES,
      "apples-loop.jpg",
      "image/jpeg",
    );
    if (importer === "media.paged.image.importer.raster") {
      await openAdjustments(ctx);
      await resetAdjustments(ctx);
      await resampleTo(ctx, 480, 320);
      await setSlider(ctx, "Exposure (EV)", 0.9);
      await setSlider(ctx, "Saturation", 1.5);
      const out = await exportDownload(ctx, EXPORTER.jpeg);
      if ("bytes" in out) {
        exported = await commitBytes(ctx, committedFrame, out.bytes);
      } else {
        notes.push(`loop export: ${out.reason}`);
      }
    } else {
      notes.push(`importer answered "${importer}" — loop not re-run`);
    }
  } else {
    notes.push(
      "no GPU render path — the loop's adjust leg did not run; both step " +
        "images carry the file as shot and step 4's byte count says so",
    );
  }

  // ── the procedure, with this run's numbers ───────────────────────
  const stepFour =
    exported !== null
      ? `Export. The bundle's JPEG encoder re-encodes the adjusted ` +
        `pixels and the host delivers the file as a download — ` +
        `${exported.toLocaleString("en-US")} bytes on this run.`
      : "Export. Not run on this lane (no GPU), so the committed frame " +
        "still carries step one's bytes.";
  // Hand-set numerals on the Body style rather than the fixture's
  // Numbered 1: the live list marker renders its separator as a tofu
  // box on this lane (seen in the proof render), and a procedure whose
  // numbers are typographic content reads identically without it.
  const procedure = await proseFrame(ctx, page, [60, 96, 492, 256], [
    {
      text:
        `1 · Place. The frame takes a link and a fitting; the photograph ` +
        `goes in as inline bytes (${asShot.toLocaleString("en-US")} B as shot).`,
      style: STYLE.body,
    },
    {
      text:
        "2 · Ingest. The raster importer decodes the file into the " +
        "paged.image session, bound to the selected frame.",
      style: STYLE.body,
    },
    {
      text:
        "3 · Adjust. Panel parameters drive the registered kernel chain on " +
        "the GPU — here a 480 × 320 resample, +0.9 EV, saturation 1.5. The " +
        "document is untouched.",
      style: STYLE.body,
    },
    { text: `4 · ${stepFour}`, style: STYLE.body },
    {
      text:
        "5 · Commit. replaceImageBytes writes the exported bytes back into " +
        "the frame — inline image data, the lane every checkpoint and the " +
        "IDML round trip preserve.",
      style: STYLE.body,
    },
  ]);
  elements.push(procedure.frameId);

  const capA = await proseFrame(ctx, page, [60, 359, 190, 399], [
    { text: "Step 1 — placed, as shot", style: STYLE.specLabel },
  ]);
  const capB = await proseFrame(ctx, page, [232, 359, 382, 399], [
    {
      text:
        exported !== null
          ? "Steps 2–5 — corrected, committed"
          : "Steps 2–5 — did not run on this lane",
      style: STYLE.specLabel,
    },
  ]);
  elements.push(capA.frameId, capB.frameId);

  // ── the honesty block ────────────────────────────────────────────
  const honesty = await proseFrame(ctx, page, [60, 410, 492, 636], [
    { text: "What this chapter does not claim", style: STYLE.head2 },
    {
      text:
        "Apply is a preview. The panel's Apply composites a Stage-A scene " +
        "layer over the frame — the fastest way to see a correction, and " +
        "session state by design. Reload the document and the layer is " +
        "gone; that is why every exhibit here committed its pixels before " +
        "its module returned.",
      style: STYLE.bodySmall,
    },
    {
      text:
        "The brush-library lane exists; its fixture cannot. The .abr " +
        "reader is real — built clean-room against a measured corpus of " +
        "3,215 presets, a 24-variant warning channel for what it declines " +
        "— but no redistributable .abr ships with this book: the " +
        "published corpus references are licence-blocked for committed " +
        "test assets, and authoring a fake library to press the button " +
        "would demonstrate nothing true. The loader stays unpressed here.",
      style: STYLE.bodySmall,
    },
    {
      text:
        "Tiles are level-0. The plugin's tile provider serves the " +
        "renderer full-resolution level-0 tiles; the buffer graph's mip " +
        "pyramid stays engine-side, not yet across the wasm boundary. " +
        "This chapter's exhibits never depended on it — the committed " +
        "bytes are the document's own, decoded by the engine like any " +
        "placed image.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(honesty.frameId);

  await marginNote(
    ctx,
    page,
    "Three stated limits: Apply's composite is session-only; the .abr " +
      "lane ships no redistributable fixture (none authored, none " +
      "pressed); the tile provider is level-0 only. → Appendix A",
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 137",
      "the loop, end to end, with this run's byte counts",
      "place → ingest → adjust → export → commit",
    ]),
  );

  return {
    title: "The darkroom loop, closed",
    covers: [],
    elements,
    notes,
  };
}
