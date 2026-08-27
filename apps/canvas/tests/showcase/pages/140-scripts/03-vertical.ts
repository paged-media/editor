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

// CJK vertical writing (p43–44, F-Vertical spread): the fixture
// carries a tall vertical Japanese story on each page — StoryDirection
// vertical, Noto Sans JP, one GroupRuby run, one kenten run — because
// no wire op writes a story's direction. This module authors AROUND
// them: captions naming what each run shows, small English prose at
// the foot on vertical composition, and margin notes for the recorded
// MVP limits. Ruby and kenten rows are NOT claimed: their renderer
// stages are partial, and the margins say so instead.

import { expect } from "@playwright/test";

import { marginNote, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { caption, prose } from "../135-story/00-support";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pg43 = ctx.pageIds[0];
  const pg44 = ctx.pageIds[1];
  const elements: string[] = [];

  // The fixture exhibits are already on the pages; find their stories
  // through the same hit-test door everything else uses, and prove
  // they carry text. (p43 recto: x 144..384; p44 verso: x 156..396;
  // both y 104..584.)
  const story43 = await doc.storyOf(pg43, [200, 130, 330, 180]);
  const story44 = await doc.storyOf(pg44, [210, 130, 340, 180]);
  expect(await doc.storyChars(story43)).toBeGreaterThan(0);
  expect(await doc.storyChars(story44)).toBeGreaterThan(0);
  expect(story43).not.toBe(story44);

  // ── p43: name what the exhibit shows ──────────────────────────────
  elements.push(
    await caption(
      ctx,
      p(43),
      [48, 104, 136, 280],
      "Right: the fixture's vertical exhibit. Columns run top to " +
        "bottom, lines advance right to left; the face is Noto Sans JP " +
        "at thirteen points.",
    ),
    await caption(
      ctx,
      p(43),
      [48, 300, 136, 476],
      "Inside the column: the second run carries a GroupRuby reading " +
        "over its base characters; the final run carries kenten emphasis " +
        "marks beside each glyph.",
    ),
    await caption(
      ctx,
      p(43),
      [392, 104, 480, 280],
      "No wire op writes StoryDirection — the two vertical stories ship " +
        "in the base document; everything around them is set live.",
    ),
  );
  const foot43 = await prose(ctx, p(43), [48, 592, 480, 636], [
    {
      text:
        "Vertical composition turns the writing frame on its side: glyphs " +
        "stack down the column and columns advance toward the spine. " +
        "Kinsoku keeps forbidden characters off line starts and ends; " +
        "mojikumi tightens the full-width punctuation between them.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(foot43.frameId);

  const note43 = await marginNote(
    ctx,
    p(43),
    "Kinsoku is enforced as a hard rule keyed on the type's presence — " +
      "the push-in/push-out flavours are deferred; mojikumi is a uniform " +
      "half-width tightening, not the per-adjacency table. → Appendix A",
  );
  elements.push(note43);

  // ── p44: the verso exhibit ────────────────────────────────────────
  elements.push(
    await caption(
      ctx,
      p(44),
      [60, 104, 148, 280],
      "Right: the same vertical story form on the verso — the columns " +
        "advance toward the spine on both pages of the spread.",
    ),
  );
  const foot44 = await prose(ctx, p(44), [60, 592, 492, 636], [
    {
      text:
        "Ruby sets a reading above its base text — in vertical writing, " +
        "to the right of the column. Kenten sets an emphasis mark beside " +
        "each glyph it covers; both ride the run, not the frame, and " +
        "reflow with the story.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(foot44.frameId);

  const note44 = await marginNote(
    ctx,
    p(44),
    "Ruby renders as a centred group reading: a PerCharacter request " +
      "collapses to the group form. Kenten renders a filled circle " +
      "whatever kind is asked for — this fixture asks for sesame dots. " +
      "→ Appendix A",
  );
  elements.push(note44);

  elements.push(
    await specLabel(ctx, p(43), [
      "Specimen No. 62",
      "F-Vertical master",
      "StoryDirection: fixture",
      "ruby/kenten: see margins",
    ]),
  );

  return {
    title: "CJK vertical writing",
    covers: ["typography.cjk-vertical-writing"],
    elements,
    notes: [
      "ruby + kenten rows deliberately unclaimed (renderer stages partial); " +
        "limits recorded as margin notes on p43/p44",
    ],
  };
}
