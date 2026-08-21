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

// Page 2 — contents.
//
// The page that makes the rest of the document navigable, and the one
// that exercises the two text features a contents page cannot do
// without: a LIVE PAGE NUMBER and a LINK.
//
// Both are text that is not simply text. `insertField` puts an auto
// page-number marker into the folio — a single private-use character
// (U+E018, IDML's `<?ACE 18?>`) that the renderer substitutes at
// composition time against the page's section, so the folio reads "2"
// because the frame is on page two, not because anyone typed a 2.
// `insertHyperlink` makes a span of the closing line a real
// `HyperlinkTextSource` with a URL destination in the designmap, which
// is what survives export to IDML and PDF — as opposed to blue
// underlined text, which survives nothing.
//
// OFFSET SPACES. The engine runs two of them and this page touches
// both. `insertText` addresses BYTES, counting the `\n` that separates
// paragraphs. `applyStyle`, `insertField` and `insertHyperlink` address
// the CONTIGUOUS CHARACTER space, in which a paragraph break is not a
// character at all (the engine consumes it into the split). `poured`
// below returns the text for the first and the per-paragraph starts for
// the second, which is the same shape paged.doc's lowering uses.

import { columnBounds, COLUMN, PAGE, STYLE } from "../names";
import type { PageContext, PageReport } from "../types";

/**
 * The showcase's page list, as it appears to a reader.
 *
 * This deliberately DUPLICATES the order in `plan.ts` rather than
 * importing `PLAN`: `plan.ts` imports every page module, so a page
 * module importing `plan.ts` back would close an import cycle for the
 * sake of fifteen strings. The cost is that adding a spread means
 * editing two lists — stated here so the next person finds out from
 * the comment rather than from a contents page that stops at 15.
 */
const CONTENTS: ReadonlyArray<readonly [number, string]> = [
  [1, "Cover"],
  [2, "Contents"],
  [3, "Editorial — how a page is made"],
  [4, "Editorial, continued"],
  [5, "Raster images"],
  [6, "Vector drawing"],
  [7, "Spreadsheets"],
  [8, "Web content"],
  [9, "Database publishing"],
  [10, "Word documents"],
  [11, "Tables"],
  [12, "Layers"],
  [13, "Conditional text"],
  [14, "Master pages"],
  [15, "Colour and transparency"],
  [16, "Colophon"],
];

const LINK_TEXT = "docs.paged.media";
const LINK_URL = "https://docs.paged.media";
const CLOSING = `The feature registry behind every claim in this document lives at ${LINK_TEXT}.`;

/** The folio's fixed prefix; the page-number field lands after it. */
const FOLIO_PREFIX = "Page ";

/**
 * Join paragraphs for one `insertText` and report where each one starts
 * in the CONTIGUOUS CHARACTER space the styling ops address.
 *
 * The returned `text` carries `\n` separators (they are what makes the
 * engine split paragraphs); the returned `starts` never advance across
 * one, because a break is not a stored character. Lengths count code
 * points — `chars().count()` on the engine side — not UTF-16 units, so
 * an em dash or a curly quote in a title does not silently shift every
 * offset after it.
 */
function poured(paragraphs: readonly string[]): {
  text: string;
  starts: number[];
  length: number;
} {
  const starts: number[] = [];
  let offset = 0;
  for (const p of paragraphs) {
    starts.push(offset);
    offset += [...p].length;
  }
  return { text: paragraphs.join("\n"), starts, length: offset };
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];

  // Two columns' worth of measure for the list — a contents page reads
  // better short of the full 3-column width, and the empty right column
  // is where the eye rests.
  const left = columnBounds(0);
  const right = columnBounds(1);
  const listBounds: [number, number, number, number] = [
    left[0],
    left[1],
    COLUMN.live[2] - 48,
    right[3],
  ];
  const list = await doc.textFrame(pageId, listBounds);
  const listStory = await doc.storyOf(pageId, listBounds);

  const folioBounds: [number, number, number, number] = [
    PAGE.heightPt - 56,
    left[1],
    PAGE.heightPt - 32,
    right[3],
  ];
  const folio = await doc.textFrame(pageId, folioBounds);
  const folioStory = await doc.storyOf(pageId, folioBounds);

  // ── the list ────────────────────────────────────────────────────
  const paragraphs = [
    "Contents",
    ...CONTENTS.map(([n, t]) => `${String(n).padStart(2, "0")}   ${t}`),
    CLOSING,
  ];
  const { text, starts, length } = poured(paragraphs);
  await doc.insertText(listStory, text);

  const body = await doc.paragraphStyle(STYLE.body);
  const heading = await doc.paragraphStyle(STYLE.heading);
  // Body over everything, then the heading over the first line only:
  // last write wins on a paragraph, so the narrow apply has to follow
  // the wide one.
  await doc.applyStyle(listStory, 0, length, body, "paragraph");
  await doc.applyStyle(listStory, starts[0], starts[1], heading, "paragraph");

  // The link, addressed in the contiguous space: the closing paragraph
  // starts at `starts.at(-1)`, and the URL text sits at a known offset
  // inside it. Computed rather than hardcoded so editing CLOSING does
  // not silently move the link onto the wrong words.
  const closingStart = starts[starts.length - 1];
  const inClosing = [...CLOSING.slice(0, CLOSING.indexOf(LINK_TEXT))].length;
  const linkStart = closingStart + inClosing;
  await doc.mutate("insertHyperlink", {
    storyId: listStory,
    start: linkStart,
    end: linkStart + [...LINK_TEXT].length,
    url: LINK_URL,
  });

  // ── the folio, with a live page-number field ────────────────────
  await doc.insertText(folioStory, FOLIO_PREFIX);
  await doc.applyStyle(
    folioStory,
    0,
    [...FOLIO_PREFIX].length,
    await doc.paragraphStyle(STYLE.caption),
    "paragraph",
  );
  // `field` is the FieldKind wire enum, serialised camelCase; the
  // marker inherits the run formatting at the insertion point, which is
  // why the caption style is applied first.
  await doc.mutate("insertField", {
    storyId: folioStory,
    offset: [...FOLIO_PREFIX].length,
    field: "pageNumber",
  });

  // The field occupies exactly one character slot in the story stream.
  const folioChars = await doc.storyChars(folioStory);
  if (folioChars !== [...FOLIO_PREFIX].length + 1) {
    notes.push(
      `the folio story holds ${folioChars} characters, expected ` +
        `${[...FOLIO_PREFIX].length + 1} — the page-number marker did not ` +
        "land as a single character",
    );
  }

  const listChars = await doc.storyChars(listStory);
  if (listChars !== length) {
    notes.push(
      `the contents story holds ${listChars} characters, expected ${length}`,
    );
  }

  return {
    title: "Contents",
    covers: [
      "stories-text.story-model",
      "stories-text.text.insert",
      "stories-text.style-apply-range",
      "stories-text.fields.insert",
      "stories-text.page-number-markers",
      "sections-numbering-variables.page-number-resolution",
      "cross-references-hyperlinks.hyperlinks",
      "frames-paths.page-item-kinds",
    ],
    elements: [list, folio],
    notes: notes.length > 0 ? notes : undefined,
  };
}
