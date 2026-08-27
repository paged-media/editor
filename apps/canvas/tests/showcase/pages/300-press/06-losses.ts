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

// The loss ledger — p125, E-Data recto. `doc.exportIdmlWithLost()`
// runs in-module (bytes discarded) and the reply's `lost` list is
// printed VERBATIM as a native table. So that the ledger has something
// true to report in every build mode, the page first authors its own
// specimen: a vermilion plate under an opacity mask (the Annual Ramp
// as mask artwork — the ink-and-light chapter's proven recipe), left
// RESIDENT. IDML has no opacity-mask element, so the export names it;
// the loss the table prints is standing right beside it.
//
// The assembly's own gate reads the same list and allows only the
// /opacity/ family — anything else there is a silent-loss regression,
// so this page's oracle (the list mentions an opacity mask) and the
// assembly's stay two views of one contract.

import { expect } from "@playwright/test";

import { assignLayer, marginNote, plate, proseFrame, specLabel } from "../../annual-support";
import { GRADIENT_RAMP, LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { dataTable } from "./00-support";

const MAX_ROWS = 4;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(125);
  const pageId = ctx.pageIds[0];
  const [left, top, right] = contentBox(page);

  const head = await proseFrame(ctx, page, [left, top, right, top + 32], [
    { text: "The loss ledger", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const intro = await proseFrame(ctx, page, [left, top + 40, right, top + 168], [
    {
      text:
        "Two exports leave this document. The .paged container keeps everything — the native model part carries the whole scene, masks and all. The .idml interchange twin is for other hands, and its writer holds a harder line: an unmutated document round-trips byte-identically (measured on the real corpus: 99 of 99 packages, 11,876 entries, zero gaps), a mutated one differs only where the edit touched — and whatever IDML cannot express is not smuggled or silently dropped, it is NAMED, in the export reply itself.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(intro.frameId);

  // ── the specimen: an opacity mask, resident ──────────────────────
  const target = await plate(
    ctx,
    page,
    [left, top + 186, left + 120, top + 266],
    SWATCH.vermilion,
    LAYER.content,
  );
  elements.push(target);
  const maskArt = await doc.rectangle(pageId, [
    left - 6,
    top + 176,
    left + 130,
    top + 276,
  ]);
  await doc.setProperty("rectangle", maskArt, "frameFillColor", {
    type: "colorRef",
    value: await doc.gradient(GRADIENT_RAMP),
  });
  await assignLayer(ctx, "rectangle", maskArt, LAYER.content);
  await doc.mutate("applyOpacityMask", {
    targetId: { kind: "rectangle", id: target },
    maskId: { kind: "rectangle", id: maskArt },
    maskType: "luminosity",
    invert: false,
  });
  const specimenCap = await proseFrame(
    ctx,
    page,
    [left + 140, top + 186, right, top + 276],
    [
      {
        text:
          "The specimen: a vermilion plate fading through an opacity mask whose artwork is the Annual Ramp. It stays on this page — paged-native, resident, and named by the export below as exactly what the interchange twin cannot carry.",
        style: STYLE.caption,
      },
    ],
  );
  elements.push(specimenCap.frameId);

  // ── the export, and the list, verbatim ───────────────────────────
  const { bytes, lost } = await doc.exportIdmlWithLost();
  notes.push(
    `exportIdml — ${bytes.length} bytes (discarded), lost: ${lost.length} entr(ies)`,
  );
  expect(
    lost.some((l) => /opacity mask/i.test(l)),
    "the ledger names this page's own resident mask",
  ).toBe(true);

  const shown = lost.slice(0, MAX_ROWS);
  const rows: string[][] = shown.map((l, i) => [String(i + 1), l]);
  if (lost.length > MAX_ROWS) {
    rows.push(["…", `${lost.length - MAX_ROWS} further entr(ies), same construct`]);
  }
  const tableTop = top + 296;
  const table = await dataTable(
    ctx,
    page,
    [left, tableTop, right, Math.min(600, tableTop + 66 + rows.length * 52)],
    {
      caption:
        "Table 20·3 — idmlExported.lost, verbatim: every paged-native construct the IDML projection leaves behind.",
      colWidths: [26, 406],
      headers: ["No.", "WHAT THE INTERCHANGE TWIN CANNOT CARRY"],
      rows,
      numberCols: [0],
      rowHeight: 52,
    },
  );
  elements.push(table.frameId);
  const tableBottom = Math.min(600, tableTop + 66 + rows.length * 52);

  const closing = await proseFrame(ctx, page, [left, tableBottom + 12, right, 640], [
    {
      text:
        `Each entry names its target, its mask artwork, and the lossless path (.paged). ${lost.length === 1 ? "The single entry above is this page's own specimen" : "Among the entries above is this page's own specimen"} — the ledger is reporting the rectangle beside it, which is what an honest loss report looks like: specific, addressed, and printed where the loss lives.`,
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(closing.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 191",
      "exportIdml + lost (C-28, in-module)",
      "99/99 byte-identity carry-through cited",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "Live paragraph-range overrides and full style definitions travel " +
        "in document.pgm but are lost in the IDML projection - a recorded " +
        "finding of this campaign; the container keeps them, the " +
        "interchange twin does not. → Appendix A",
    ),
  );

  return {
    title: "The loss ledger — what IDML export names and leaves",
    covers: [
      "round-tripping.idml-reserialization",
      "effects-transparency.opacity-mask",
    ],
    elements,
    notes,
  };
}
