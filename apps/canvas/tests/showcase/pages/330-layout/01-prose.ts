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

// The prose oracle — the chart wall's stories hold their own text.
// (Formerly the prose REPAIR; see `build` for why the repair is gone.)
//
// The chart wall's heading printed as "Q2Q2The chart wall" and its
// standfirst as "Q3Q3One workbook" — in the heading's own face, size
// and baseline, with no gap. That is not a label frame sitting on top;
// it is the chart lowering's phase-2 label pour inserting into a story
// that already belonged to the page's prose, at offset 0.
//
// The repair is the most ordinary IDML edit there is: delete the
// characters that should not be there. No new construct, no overlay,
// nothing that could survive the container and die in the interchange
// file — a story with four fewer characters is a story with four fewer
// characters in both.
//
// It is self-verifying, which matters because nothing here can READ a
// story's text: `StorySummary` carries a character COUNT and no
// content. So each frame declares the text it was authored with, the
// module measures the story against that length, deletes exactly the
// excess from the front, and then demands the count match. A story
// that is short, or that is long by something other than a prefix,
// fails loudly rather than being trimmed on a guess.

import { expect } from "@playwright/test";

import { p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

/** A frame whose story must contain exactly what it was authored with. */
interface Authored {
  page: number;
  bounds: [number, number, number, number];
  text: string;
  what: string;
}

const AUTHORED: Authored[] = [
  {
    page: p(96),
    bounds: [60, 96, 492, 124],
    text: "The chart wall",
    what: "the chart wall's heading",
  },
  {
    page: p(96),
    bounds: [60, 128, 492, 170],
    text:
      "One workbook, ten charts — the engine's whole kind set, lowered " +
      "one by one. Every bar, wedge, ring and spoke on this spread is a " +
      "native path, and every axis number is a text frame; there is no " +
      "picture of a chart anywhere in this document.",
    what: "the chart wall's standfirst",
  },
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const notes: string[] = [];

  // The oracle: every authored story holds exactly what it was authored
  // with. This module used to REPAIR — the chart lowering's label pours
  // landed in these stories at offset 0 ("Q2Q2The chart wall") and the
  // prefix was cut off. The cause was the engine's story minter:
  // sibling frames minted in one batch on a document with sparse story
  // ids were all named after the same number and BORN on one story, so
  // a label frame and the prose shared a story before any text existed.
  // That is fixed at the minter (core `story_id_floor`), the assembly
  // refuses any two unthreaded frames on one story, and this page now
  // stands where the symptom stood: contamination here is a failure,
  // not something to trim on a guess.
  for (const frame of AUTHORED) {
    const pageId = await doc.pageId(frame.page);
    const storyId = await doc.storyOf(pageId, frame.bounds);
    const want = frame.text.length;
    const have = await doc.storyChars(storyId);
    expect(
      have,
      `${frame.what} holds ${have} characters, authored ${want}` +
        (have > want
          ? ` — ${have - want} stray character(s): the chart-label contamination ` +
            `this page was written for is BACK`
          : " — shorter than authored"),
    ).toBe(want);
    notes.push(`${frame.what}: clean (${want} characters)`);
  }

  // The delete the repair used to make, demonstrated on a scratch frame
  // in the page's foot margin and removed — so the claim below stays
  // honest without a defect to fix. Transient: tallied as demonstrated,
  // never resident.
  const pageId = await doc.pageId(p(96));
  const box: [number, number, number, number] = [60, 664, 300, 700];
  const demo = async (): Promise<void> => {
    const scratch = await doc.textFrame(pageId, box);
    const story = await doc.storyOf(pageId, box);
    await doc.insertText(story, "Q2Q2The chart wall", 0);
    await doc.mutate("deleteRange", { storyId: story, start: 0, end: 4 });
    expect(
      await doc.storyChars(story),
      "deleteRange took exactly the four stray characters off the front",
    ).toBe("The chart wall".length);
    await doc.mutate("deleteFrame", { frameId: scratch });
  };
  if (doc.ledger) await doc.ledger.transient(demo);
  else await demo();
  notes.push(
    "deleteRange demonstrated on a scratch frame (four characters off the " +
      "front) and the frame removed — the repair this page once made, kept " +
      "as a demonstration",
  );

  return {
    title: "The chart wall's prose, verified its own",
    covers: ["stories-text.text.delete"],
    elements: [],
    notes,
  };
}
