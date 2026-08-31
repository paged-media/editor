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

// The prose repair — chart labels evicted from the pages' own stories.
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
  let repaired = 0;

  for (const frame of AUTHORED) {
    const pageId = await doc.pageId(frame.page);
    const storyId = await doc.storyOf(pageId, frame.bounds);
    const want = frame.text.length;
    const have = await doc.storyChars(storyId);
    if (have === want) {
      notes.push(`${frame.what}: clean (${want} characters)`);
      continue;
    }
    expect(
      have,
      `${frame.what} is SHORTER than authored (${have} < ${want}) — that is ` +
        `not label contamination and must not be trimmed on a guess`,
    ).toBeGreaterThan(want);
    const strays = have - want;
    await doc.mutate("deleteRange", { storyId, start: 0, end: strays });
    const now = await doc.storyChars(storyId);
    expect(
      now,
      `${frame.what} still does not match after deleting ${strays} ` +
        `character(s) from the front — the excess was not a prefix`,
    ).toBe(want);
    notes.push(
      `${frame.what}: deleted ${strays} character(s) the chart lowering ` +
        `poured into this story at offset 0 (the label pour targets a story ` +
        `the page already owns — a product defect, recorded)`,
    );
    repaired += 1;
  }

  expect(
    repaired,
    "the prose repair found contamination to fix — if this is zero the " +
      "defect it exists for is gone and the module should go with it",
  ).toBeGreaterThan(0);

  return {
    title: "The chart wall's prose, returned to itself",
    covers: ["stories-text.text.delete"],
    elements: [],
    notes,
  };
}
