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

// PSD (p93) — the format Paged promises never to destroy. The annual's
// own layered fixture (annual-layers.psd: Backdrop / Plate / Signal,
// 400 × 300 RGB-8, emitted byte-stable by image-psd's own builders)
// goes through the K-2 importer; the composite is committed to the
// page through the loop; the panel's PSD-layers section lists the
// parsed records; one layer's opacity is edited through that section
// (a RECORD edit — the canvas keeps the import-time flatten, and the
// caption says so rather than pretending a re-flatten); and the edited
// PSD is exported through the Export lane as a real download, byte
// count on the page.
//
// The preservation invariant is CITED, not faked: byte-identical
// zero-edit round-trip is proven in image-psd's own gates (the
// 11-fixture corpus + 64-case proptest, PSB included, lazy-verbatim
// guard). A page that re-ran a byte diff it cannot honestly display
// would be theatre; a page that cites the gate names the evidence.

import type { PageContext, PageReport } from "../../types";
import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { LAYER, STYLE, p } from "../../names-annual";
import { resolve as pathResolve } from "node:path";
import { statSync } from "node:fs";
import {
  ASSETS,
  EXPORTER,
  commitBytes,
  exportDownload,
  ingestIntoFrame,
  openAdjustments,
  replaceBytesFromFile,
} from "./00-support";

const PSD = pathResolve(ASSETS, "annual-layers.psd");
const PSD_URI = "assets/annual-layers.psd";

/** The composite frame: the PSD's own 4:3 at a 240 pt width. */
const FRAME: [number, number, number, number] = [48, 164, 288, 344];

interface PsdRow {
  index: number;
  name: string;
  opacityPct: number;
}

/** Read the panel's PSD-layers section — the parsed records. */
async function readPsdRows(ctx: PageContext): Promise<PsdRow[]> {
  return ctx.page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll("[data-image-psd-layer]"),
    );
    return rows.map((row) => ({
      index: Number(row.getAttribute("data-image-psd-layer")),
      name: row.querySelector("span")?.textContent?.trim() ?? "?",
      opacityPct: Number(
        (row.querySelector("[data-image-psd-opacity]") as HTMLInputElement)
          ?.value ?? "0",
      ),
    }));
  });
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg = ctx.pageIds[0];
  const page = p(93);
  const elements: string[] = [];
  const notes: string[] = [];
  const covers: string[] = [];

  const gpu = await doc.gpuActive();
  const psdFileBytes = statSync(PSD).size;

  const head = await proseFrame(ctx, page, [48, 58, 480, 88], [
    { text: "PSD — the file that must survive", style: STYLE.head2 },
  ]);
  const intro = await proseFrame(ctx, page, [48, 92, 480, 156], [
    {
      text:
        "A PSD is somebody's working file, so the rule is preservation " +
        "first: the reader retains every block it parses, unknown blocks " +
        "opaquely, and a zero-edit save is byte-identical — an invariant " +
        "proven in the plugin's own gates over a synthesized corpus and a " +
        "64-case property test, PSB included. What follows is the annual's " +
        "own three-layer fixture through that machinery.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  const frame = await doc.rectangle(pg, FRAME);
  await assignLayer(ctx, "rectangle", frame, LAYER.content);
  await doc.mutate("placeImage", { elementId: frame, uri: PSD_URI, fit: null });
  elements.push(frame);

  let rows: PsdRow[] = [];
  let committed: number | null = null;
  let psdExport: { name: string; bytes: number } | null = null;
  let opacityEdited: string | null = null;

  const importer = await ingestIntoFrame(
    ctx,
    frame,
    PSD,
    "annual-layers.psd",
    "image/vnd.adobe.photoshop",
  );
  if (importer === "media.paged.image.importer.raster") {
    await openAdjustments(ctx);

    // ── the composite, committed through the loop ────────────────
    if (gpu) {
      const out = await exportDownload(ctx, EXPORTER.png);
      if ("bytes" in out) {
        committed = await commitBytes(ctx, frame, out.bytes);
      } else {
        notes.push(`PSD composite export: ${out.reason}`);
      }
    } else {
      notes.push(
        "no GPU — the composite export lane needs the adjust chain even " +
          "at identity, so the frame shows no committed flatten",
      );
    }

    // ── the structural session: list, edit, export ───────────────
    rows = await readPsdRows(ctx);
    if (rows.length > 0) {
      const target =
        rows.find((r) => r.name === "Signal") ?? rows[rows.length - 1];
      const input = ctx.page
        .locator(`[data-image-psd-layer="${target.index}"]`)
        .locator("[data-image-psd-opacity]");
      await input.fill("30");
      opacityEdited = `${target.name}: ${target.opacityPct}% → 30%`;
      const psd = await exportDownload(ctx, EXPORTER.psd);
      if ("bytes" in psd) {
        psdExport = { name: psd.name, bytes: psd.bytes.length };
        covers.push("image.psd.editor-doors");
      } else {
        notes.push(`PSD export: ${psd.reason}`);
      }
    } else {
      notes.push(
        "the PSD-layers section rendered no rows — the structural parse " +
          "declined; nothing was edited and image.psd.editor-doors is " +
          "not claimed",
      );
    }
  } else {
    notes.push(`importer answered "${importer}" — the PSD page not driven`);
  }

  // ── captions and the roster, from the measured records ───────────
  const cap = await proseFrame(ctx, page, [48, 348, 288, 404], [
    {
      text:
        committed !== null
          ? `annual-layers.psd · ${psdFileBytes.toLocaleString("en-US")} B ` +
            `on disk · composite committed as ` +
            `${committed.toLocaleString("en-US")} B of inline PNG`
          : `annual-layers.psd · ${psdFileBytes.toLocaleString("en-US")} B ` +
            "on disk · composite not committed on this lane",
      style: STYLE.specLabel,
    },
  ]);
  elements.push(cap.frameId);

  const rosterParas =
    rows.length > 0
      ? [
          { text: "THE PARSED RECORDS", style: STYLE.specLabel },
          ...rows.map((r) => ({
            text: `${r.name} — opacity ${r.opacityPct}%`,
            style: STYLE.codeBlock,
          })),
          {
            text:
              (opacityEdited
                ? `Edited through the panel: ${opacityEdited}. `
                : "") +
              (psdExport
                ? `The edited PSD exported as ${psdExport.name}, ` +
                  `${psdExport.bytes.toLocaleString("en-US")} bytes — a ` +
                  "record edit carried on the retained parse."
                : "The edited PSD did not export on this lane."),
            style: STYLE.caption,
          },
          {
            text:
              "The canvas shows the import-time flatten; a layer edit " +
              "lands in the EXPORTED file, not in a live re-composite — " +
              "the panel states this limit where the edit is made.",
            style: STYLE.caption,
          },
        ]
      : [
          { text: "THE PARSED RECORDS", style: STYLE.specLabel },
          {
            text:
              "No layer records rendered on this lane — the structural " +
              "parse declined and this page records that instead of " +
              "inventing a roster.",
            style: STYLE.caption,
          },
        ];
  const roster = await proseFrame(ctx, page, [300, 164, 480, 428], rosterParas);
  elements.push(roster.frameId);

  const invariant = await proseFrame(ctx, page, [48, 440, 480, 540], [
    {
      text:
        "Three layers — Backdrop (normal), Plate (multiply), Signal " +
        "(screen) — assembled by the crate's own spec builders, mask-free " +
        "by the layer-import tier's documented envelope. The preservation " +
        "claim on this page is a citation, not a re-run: byte-identity at " +
        "zero edits is the gate image-psd holds in its own test suite, " +
        "and what this page adds is the editor reach — list, edit, " +
        "export, through the panel a designer actually touches.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(invariant.frameId);

  await marginNote(
    ctx,
    page,
    "PSD structural edits are record edits on the retained parse: " +
      "visible in the exported file, not on the canvas (the import-time " +
      "flatten stands). Round-trip proof spans the synthesized corpus; a " +
      "real-Adobe corpus is the registry's named confidence step. " +
      "→ Appendix A",
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 136",
      "annual-layers.psd via the raster importer",
      "layer list · opacity edit · PSD export",
    ]),
  );

  return {
    title: "PSD — list, edit, export, preserve",
    covers,
    elements,
    notes,
  };
}
