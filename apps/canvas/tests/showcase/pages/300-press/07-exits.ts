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

// The exit paths — p126, B-Body verso, the chapter close. Prose only,
// and deliberately so: every claim on this page points at an artifact
// another page (or another chapter, or the assembly) actually made.
// Nothing here demonstrates; it enumerates, and it says which lane
// each proof lives in.

import { proseFrame, specLabel } from "../../annual-support";
import { STYLE, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const elements: string[] = [];
  const page = p(126);
  const [left, top, right] = contentBox(page);

  const head = await proseFrame(ctx, page, [left, top, right, top + 32], [
    { text: "The exit paths", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const prose = await proseFrame(ctx, page, [left, top + 42, right, 630], [
    {
      text:
        "A document that cannot leave is a terrarium. This book leaves by several doors, and the chapter closes by walking them in order of ceremony.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        "The press door is PDF/X-4. The export dialog's options ride the wire as one structure: standard pdfx4, an output-intent profile with its human-readable output condition, the colour policy — preserve numbers, or ConvertToDestination through the registered CMM — and the apparatus the marks plate depicted: cropMarks, registrationMarks, colorBars, pageInfo, and a bleed override in points. That pass is performed at assembly, on the finished book, where a proof belongs; this chapter ran the preflight for it three pages ago and printed what the door reported.",
      style: STYLE.body,
    },
    {
      text:
        "The interchange door is IDML. The same bytes InDesign opens, written by the carry-through writer whose discipline the loss ledger opposite just showed: byte-identical where nothing changed, honest about the little that cannot travel. And beneath both sits the container itself — the .paged file each chapter checkpoint already proves, which reopens with every plugin's parts intact.",
      style: STYLE.body,
    },
    {
      text:
        "Then the side doors, already used. The studios of Part II did not only import; they exported, and their artifacts left this build as real files: the darkroom's layered .psd, the ledger's .xlsx workbook re-encoded from the live grid, the manuscript's .docx save-back spliced byte-conservatively into the original, and the colour chapter's .ase swatch library, captured from the editor's own save door and re-imported to prove the loop. Each of those files opens in the application it was made for — that is what a sibling artifact is.",
      style: STYLE.body,
    },
    {
      text:
        "Two doors remain, and the honest line about them closed the opener: paged.pdf opens PDFs and paged.publish opens IDML, and both REPLACE the document they are invoked over. Their import lanes are proven by their own journey specs, not by this document — which prefers to remain open to its last page.",
      style: STYLE.body,
    },
  ]);
  elements.push(prose.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 192",
      "the exit inventory — every claim points at an artifact",
      "PDF/X-4 at assembly",
    ]),
  );

  return {
    title: "The exit paths — the chapter close",
    covers: [],
    elements,
  };
}
