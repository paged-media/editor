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

// The Knuth-Plass demonstration — p24-p25. THE SAME argumentative
// paragraph set twice, facing itself across the gutter: hyphenation on
// with justification (the total-fit path) on the verso, hyphenation off
// and ragged on the recto. Both are range properties on live text —
// paragraphHyphenation and paragraphJustification — so the two columns
// differ by exactly two wire writes. Beneath, the H&J parameter row:
// the same short passage three times under characterTracking -20 / 0 /
// +60, because tracking is the spacing parameter the wire CAN set —
// the word/letter-spacing and glyph-scaling min/desired/max limits
// drive the justified column above (compose_opts resolves them, 100
// desired word space, stretch to the maximum before a hyphen is
// taken), but they are parse-and-render attributes with no property
// path, and the margin note says so.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

/** The specimen paragraph — real prose about line breaking itself. */
const SPECIMEN =
  "A paragraph is not broken one line at a time. The composer reads " +
  "the whole of it first, weighs every place a line could end, and " +
  "charges each candidate for the space it stretches, the word it " +
  "divides, and the shape it leaves behind; then it chooses the " +
  "cheapest complete set of breaks. This is the total-fit method " +
  "Knuth and Plass described in 1981, and it is why a justified " +
  "column can hold an even colour from its first line to its last. " +
  "Forbid the hyphen and refuse the stretch, and the same sentences " +
  "must end wherever the words happen to stop: the right edge frays, " +
  "and the ragged column tells you, plainly, what the algorithm had " +
  "been doing for you all along.";

const TRACKING_TEXT =
  "The measure is narrow on purpose: at this width every extra unit " +
  "of tracking costs a word to the next line, and the breaks move.";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];

  // ── p24 (verso): head + explanation + specimen A (justified) ─────
  const head = await proseFrame(ctx, p(24), [60, 58, 492, 92], [
    { text: "One paragraph, two disciplines", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const explain = await proseFrame(ctx, p(24), [60, 104, 280, 470], [
    {
      text:
        "The paragraph to the right and the paragraph facing it across " +
        "the gutter are the same text in the same measure. They differ " +
        "by two range properties and nothing else.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        "On this page: paragraphHyphenation true, paragraphJustification " +
        "LeftJustified. The composer may divide words at the hyphenation " +
        "points the TeX patterns license, and it flexes the spaces of " +
        "every line between the H&J minimum and maximum so the right " +
        "edge lands flush. Opposite: paragraphHyphenation false, " +
        "paragraphJustification LeftAlign. No division, no flex - each " +
        "break is simply the last word that fits.",
      style: STYLE.body,
    },
    {
      text:
        "Below, the parameter row: the same passage three times under " +
        "characterTracking minus twenty, zero, and plus sixty " +
        "thousandths of an em. Spacing pressure moves the breaks.",
      style: STYLE.body,
    },
  ]);
  elements.push(explain.frameId);

  const specA = await proseFrame(ctx, p(24), [302, 104, 492, 440], [
    { text: SPECIMEN, style: STYLE.body },
  ]);
  elements.push(specA.frameId);
  const rangeA = doc.storyRangeId(specA.storyId, 0, SPECIMEN.length);
  await doc.setProperty("storyRange", rangeA, "paragraphHyphenation", {
    type: "bool",
    value: true,
  });
  await doc.setProperty("storyRange", rangeA, "paragraphJustification", {
    type: "text",
    value: "LeftJustified",
  });
  const capA = await proseFrame(ctx, p(24), [302, 446, 492, 500], [
    {
      text:
        "paragraphJustification = LeftJustified · " +
        "paragraphHyphenation = true",
      style: STYLE.caption,
    },
  ]);
  elements.push(capA.frameId);

  // ── p24 lower band: the H&J parameter row (tracking) ─────────────
  const trackingColumns: Array<{ x0: number; x1: number; value: number }> = [
    { x0: 60, x1: 192, value: -20 },
    { x0: 204, x1: 336, value: 0 },
    { x0: 348, x1: 480, value: 60 },
  ];
  for (const col of trackingColumns) {
    const frame = await proseFrame(ctx, p(24), [col.x0, 516, col.x1, 600], [
      { text: TRACKING_TEXT, style: STYLE.bodySmall },
    ]);
    elements.push(frame.frameId);
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(frame.storyId, 0, TRACKING_TEXT.length),
      "characterTracking",
      { type: "length", value: col.value },
    );
    const cap = await proseFrame(ctx, p(24), [col.x0, 604, col.x1, 634], [
      {
        text: `characterTracking = ${col.value >= 0 ? "+" : ""}${col.value}`,
        style: STYLE.caption,
      },
    ]);
    elements.push(cap.frameId);
  }

  // ── p25 (recto): specimen B (ragged, unhyphenated) + notes ───────
  const specB = await proseFrame(ctx, p(25), [48, 104, 238, 440], [
    { text: SPECIMEN, style: STYLE.body },
  ]);
  elements.push(specB.frameId);
  const rangeB = doc.storyRangeId(specB.storyId, 0, SPECIMEN.length);
  await doc.setProperty("storyRange", rangeB, "paragraphHyphenation", {
    type: "bool",
    value: false,
  });
  await doc.setProperty("storyRange", rangeB, "paragraphJustification", {
    type: "text",
    value: "LeftAlign",
  });
  const capB = await proseFrame(ctx, p(25), [48, 446, 238, 500], [
    {
      text:
        "paragraphJustification = LeftAlign · " +
        "paragraphHyphenation = false",
      style: STYLE.caption,
    },
  ]);
  elements.push(capB.frameId);

  const hj = await proseFrame(ctx, p(25), [260, 104, 480, 470], [
    {
      text: "Reading the comparison",
      style: STYLE.head2,
    },
    {
      text:
        "Count the hyphens in the justified column, then look for the " +
        "lines they rescue: without them the composer would be forced " +
        "to stretch a three-word line across the full measure. The " +
        "ragged column pays the other way - no line is strained, but " +
        "the silhouette gives up its even edge.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        "The flex itself is governed by the H&J limits - minimum, " +
        "desired and maximum word spacing, letter spacing, and glyph " +
        "scaling. The engine parses and honours all three families " +
        "when it composes the justified column above; none of them is " +
        "yet a property path on the wire, so the parameter row beneath " +
        "uses tracking, the spacing control that is.",
      style: STYLE.body,
    },
    {
      text:
        "The fixture's body style also declares a 36 pt hyphenation " +
        "zone. The zone steers ragged hyphenation only - for justified " +
        "text the engine zeroes it, deliberately, to mirror InDesign - " +
        "and it too has no wire path, so the comparison you see is the " +
        "style's declaration at work, not a live write.",
      style: STYLE.body,
    },
  ]);
  elements.push(hj.frameId);

  await marginNote(
    ctx,
    p(25),
    "H&J spacing limits and the hyphenation zone parse and render but have no property path; shown via style declarations + tracking. → Appendix A",
  );

  elements.push(
    await specLabel(ctx, p(24), [
      "Specimen No. 21",
      "paragraphHyphenation",
      "paragraphJustification",
      "characterTracking",
      "total-fit breaking",
    ]),
  );

  return {
    title: "The Knuth-Plass demonstration",
    covers: [
      "typography.knuth-plass",
      "typography.hyphenation",
      "typography.justification-spacing",
      "typography.tracking-kerning",
      "stories-text.style-apply-range",
    ],
    elements,
  };
}
