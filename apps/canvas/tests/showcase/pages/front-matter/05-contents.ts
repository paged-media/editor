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

// Contents. Every entry is a real tab-stop demonstration: right-
// aligned folio behind a dot leader, set through paragraphTabStops on
// the range — the wire carries TabStopSpec {position, alignment,
// leader}. The folios are the plan's real folios.
//
// ◪ There is no generate-TOC wire op: the fixture declares the
// "Annual Contents" TOC STYLE, but the entry list here is set live
// from the chapter plan. The margin note records the gap honestly.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { ANNUAL_PLAN, STYLE, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

/** 1-based physical page → the folio label the sections produce. */
function folioOf(physical: number): string {
  if (physical <= 10) {
    const roman = ["i","ii","iii","iv","v","vi","vii","viii","ix","x"];
    return roman[physical - 1];
  }
  if (physical <= 126) return String(physical - 10);
  return `A·${physical - 126}`;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];

  const half = Math.ceil(ANNUAL_PLAN.length / 2);
  const columns: Array<{ page: number; entries: typeof ANNUAL_PLAN }> = [
    { page: p(5), entries: ANNUAL_PLAN.slice(0, half) },
    { page: p(6), entries: ANNUAL_PLAN.slice(half) },
  ];

  for (const col of columns) {
    const box = contentBox(col.page);
    const heading = await proseFrame(ctx, col.page, [box[0], box[1], box[2], box[1] + 52], [
      { text: col.page === p(5) ? "Contents" : "Contents, continued", style: STYLE.head1 },
    ]);
    elements.push(heading.frameId);

    const paras = col.entries.map((ch) => ({
      text: `${ch.title}\t${folioOf(ch.pages[0])}`,
      style: STYLE.tocChapter,
    }));
    const list = await proseFrame(
      ctx,
      col.page,
      [box[0], box[1] + 65, box[2], box[3]],
      paras,
    );
    elements.push(list.frameId);

    // The dot-leader tab: one stop at the right edge of the measure,
    // right-aligned, leader ".". Applied to the whole poured range.
    const total = paras.reduce((n, para) => n + para.text.length + 1, 0) - 1;
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(list.storyId, 0, total),
      "paragraphTabStops",
      {
        type: "tabStops",
        value: [
          { position: box[2] - box[0], alignment: "RightAlign", leader: "." },
        ],
      },
    );
  }

  elements.push(
    await specLabel(ctx, p(5), [
      "Specimen No. 3",
      "paragraphTabStops",
      "leader: dot",
    ]),
  );
  await marginNote(
    ctx,
    p(5),
    "No generate-TOC op exists on the wire; the fixture's TOC style is declared, the entries here are set live from the plan. → Appendix A",
  );

  return {
    title: "Contents — tab stops with leaders",
    covers: ["typography.tab-stops"],
    elements,
  };
}
