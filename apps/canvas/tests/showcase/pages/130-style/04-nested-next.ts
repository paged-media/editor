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

// Nested styles + the next style — p30. The fixture's Catalog Entry
// paragraph style carries a real <NestedStyle>: apply the paragraph
// style and the leading run through the first period restyles itself
// in Specimen Number, no range op involved — that firing is the
// demonstration. The next-style chain is read LIVE off the
// paragraphStyles collection (Chapter Title onwards, plus the Field
// Note chain p29 set through paragraphStyleNextStyle) and printed;
// the margin note records honestly that NextStyle acts at interactive
// typing time, never on wire pours, so the chain is shown as data,
// not pantomime.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

interface StyleRow {
  selfId: string;
  name?: string;
  nextStyle?: string | null;
}

const ENTRIES = [
  "NO-114. Field notebook, gridded, ninety leaves - 4.50",
  "NO-201. Composing stick, brass, adjustable - 18.00",
  "NO-350. Pica ruler, steel, twelve inch - 6.25",
  "NO-512. Type-high gauge, calibrated - 11.40",
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const page = p(30);

  const head = await proseFrame(ctx, page, [60, 58, 492, 92], [
    { text: "Nested styles and the next style", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // ── the catalog entries: the NestedStyle fires by itself ─────────
  const catalog = await proseFrame(
    ctx,
    page,
    [60, 104, 492, 192],
    ENTRIES.map((text) => ({ text, style: STYLE.catalogEntry })),
  );
  elements.push(catalog.frameId);

  const nestedProse = await proseFrame(ctx, page, [60, 204, 492, 360], [
    {
      text:
        "No range op touched the stock numbers above. Catalog Entry " +
        "carries a nested style in its definition: through one " +
        "occurrence of the delimiter, a period, inclusive, the run " +
        "wears Specimen Number - the mono slate hand you see on each " +
        "SKU. Apply the paragraph style and the restyling happens on " +
        "its own, at compose time, wherever the delimiter lands.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        "The model names twelve delimiter kinds a nested style can " +
        "count: characters, words, sentences, any digit, any letter, " +
        "double quotes, single quotes, a tab, a forced line break, the " +
        "end-nested-style marker, a literal character, and an unknown " +
        "fallback that fires at the start. This page demonstrates the " +
        "literal character; the front matter's tab-led contents would " +
        "suit the tab kind just as well.",
      style: STYLE.body,
    },
  ]);
  elements.push(nestedProse.frameId);

  // ── the next-style chain, read live ──────────────────────────────
  const rows = (await doc.designer.collection(
    "paragraphStyles",
  )) as unknown as StyleRow[];
  const byId = new Map(rows.map((r) => [r.selfId, r]));
  const chainFrom = (name: string): string => {
    let current = rows.find((r) => r.name === name);
    if (!current) throw new Error(`paragraphStyles has no entry named ${name}`);
    const seen = new Set<string>();
    const names: string[] = [];
    while (current && !seen.has(current.selfId)) {
      seen.add(current.selfId);
      names.push(current.name ?? current.selfId);
      current = current.nextStyle ? byId.get(current.nextStyle) : undefined;
    }
    return names.join(" -> ");
  };

  const chainHead = await proseFrame(ctx, page, [60, 372, 492, 404], [
    { text: "The next style, as declared", style: STYLE.head2 },
  ]);
  elements.push(chainHead.frameId);
  const chains = await proseFrame(ctx, page, [60, 410, 492, 470], [
    { text: chainFrom(STYLE.chapterTitle), style: STYLE.codeBlock },
    { text: chainFrom("Field Note"), style: STYLE.codeBlock },
  ]);
  elements.push(chains.frameId);

  const nextProse = await proseFrame(ctx, page, [60, 482, 492, 610], [
    {
      text:
        "Both chains above are read live from the paragraphStyles " +
        "collection - the first is the fixture's opener chain, the " +
        "second was forged two pages ago when setStyleProperty gave " +
        "Field Note a next-style of Annual Body. NextStyle answers one " +
        "question: when a writer ends a paragraph at the keyboard, " +
        "what style should the next one wear? A chapter title hands " +
        "off to its deck, the deck to the first body paragraph, and " +
        "the writer never touches a style menu. This book, poured over " +
        "the wire, applies every style explicitly - which is why the " +
        "chain is printed here as evidence rather than performed.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(nextProse.frameId);

  await marginNote(
    ctx,
    page,
    "NextStyle fires on interactive typing, not on wire pours; the chains are shown as live-read data. → Appendix A",
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 33",
      "NestedStyle",
      "delimiter: period",
      "nextStyle (live read)",
    ]),
  );

  return {
    title: "Nested styles and the next style",
    covers: ["stories-text.nested-styles", "styles.next-style-overrides"],
    elements,
  };
}
