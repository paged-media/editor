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

// Keeps & breaks — p26. Two column-pair demonstrations (a paragraph
// positioned to break badly, with keep-lines-together off then on; a
// heading that would orphan without keep-with-next), then the drop cap
// with its Lead-In range, and the spacing/indent battery.
//
// The keep flags are MEASURED, not assumed: the page renders once with
// the flags off and once with them on, and compares pixels. The wire
// accepts and stores paragraphKeepLinesTogether / paragraphKeepWithNext
// (W0.2 range paths, prior-capturing, undoable) — whether the composer
// CONSULTS them when it fragments a story across linked frames is
// exactly what the comparison shows, and the margin note reports the
// measured answer rather than the hoped-for one.

import {
  assignLayer,
  marginNote,
  proseFrame,
  specLabel,
} from "../../annual-support";
import { CHAR, LAYER, STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

const LEAD = "A short lead paragraph occupies the top of the measure.";

const DEMO =
  "This paragraph was set at the foot of its column on purpose. Where " +
  "it may break freely, the column boundary cuts it mid-thought and " +
  "strands its final lines in the next frame. With keep-lines-together " +
  "set, the composer is asked to move the whole paragraph across the " +
  "boundary instead, trading an early gap in the first column for an " +
  "unbroken argument in the second. The flag rides the wire either " +
  "way; the pixels report what the composer does with it.";

const KWN_FILLER =
  "Body text fills this column so that the heading below arrives at " +
  "its very foot, the classic place for a heading to be orphaned.";

const KWN_HEAD = "A heading that must stay with its text";

const KWN_BODY =
  "The paragraph the heading announces. Keep-with-next asks the " +
  "composer to carry the heading over to this side of the boundary " +
  "rather than leave it stranded at the foot of the first column.";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(26);

  const head = await proseFrame(ctx, page, [60, 58, 492, 92], [
    { text: "Keeps and breaks", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  /** A linked column pair pouring `paras`; returns the story id and
   *  the [start, end) offsets of each paragraph. */
  const columnPair = async (
    y0: number,
    y1: number,
    paras: Array<{ text: string; style?: string }>,
  ): Promise<{ storyId: string; spans: Array<[number, number]> }> => {
    const pageId = ctx.pageIds[0];
    const left: [number, number, number, number] = [60, y0, 266, y1];
    const right: [number, number, number, number] = [286, y0, 492, y1];
    const f1 = await doc.textFrame(pageId, left);
    const f2 = await doc.textFrame(pageId, right);
    const storyId = await doc.storyOf(pageId, left);
    await doc.linkFrames(f1, f2);
    elements.push(f1, f2);
    await assignLayer(ctx, "textFrame", f1, LAYER.content);
    await assignLayer(ctx, "textFrame", f2, LAYER.content);
    const spans: Array<[number, number]> = [];
    let offset = 0;
    for (const [i, para] of paras.entries()) {
      const text = i === paras.length - 1 ? para.text : `${para.text}\n`;
      await doc.insertText(storyId, text, offset);
      spans.push([offset, offset + para.text.length]);
      if (para.style) {
        await doc.applyStyle(
          storyId,
          offset,
          offset + para.text.length,
          await doc.paragraphStyle(para.style),
          "paragraph",
        );
      }
      offset += text.length;
    }
    return { storyId, spans };
  };

  // ── pair A: keep-lines-together OFF (the control) ────────────────
  await columnPair(104, 209, [
    { text: LEAD, style: STYLE.bodyFirst },
    { text: DEMO, style: STYLE.body },
  ]);
  const capA = await proseFrame(ctx, page, [60, 213, 492, 241], [
    {
      text:
        "paragraphKeepLinesTogether = false · the boundary cuts the " +
        "paragraph where the first column ends",
      style: STYLE.caption,
    },
  ]);
  elements.push(capA.frameId);

  // ── pair B: the same text, keep-lines-together ON ────────────────
  const pairB = await columnPair(255, 360, [
    { text: LEAD, style: STYLE.bodyFirst },
    { text: DEMO, style: STYLE.body },
  ]);
  const capB = await proseFrame(ctx, page, [60, 364, 492, 392], [
    {
      text:
        "paragraphKeepLinesTogether = true · the same text, asked to " +
        "cross the boundary whole",
      style: STYLE.caption,
    },
  ]);
  elements.push(capB.frameId);

  // ── pair C: keep-with-next on a foot-of-column heading ───────────
  const pairC = await columnPair(406, 496, [
    { text: KWN_FILLER, style: STYLE.body },
    { text: KWN_HEAD, style: STYLE.head2 },
    { text: KWN_BODY, style: STYLE.body },
  ]);
  const capC = await proseFrame(ctx, page, [60, 500, 492, 528], [
    {
      text: "paragraphKeepWithNext = 1 on the heading",
      style: STYLE.caption,
    },
  ]);
  elements.push(capC.frameId);

  // Measure: render with the keep flags still off…
  const before = await doc.renderPage(page);
  // …then set them and render again.
  await doc.setProperty(
    "storyRange",
    doc.storyRangeId(pairB.storyId, pairB.spans[1][0], pairB.spans[1][1]),
    "paragraphKeepLinesTogether",
    { type: "bool", value: true },
  );
  await doc.setProperty(
    "storyRange",
    doc.storyRangeId(pairC.storyId, pairC.spans[1][0], pairC.spans[1][1]),
    "paragraphKeepWithNext",
    { type: "length", value: 1 },
  );
  let keepsMovedPixels = false;
  for (let attempt = 0; attempt < 5 && !keepsMovedPixels; attempt += 1) {
    const after = await doc.renderPage(page);
    keepsMovedPixels = !after.equals(before);
    if (!keepsMovedPixels) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!keepsMovedPixels) {
    notes.push(
      "keep flags measured inert: paragraphKeepLinesTogether and " +
        "paragraphKeepWithNext are accepted, stored, and round-trip on " +
        "the wire, but setting them moved no pixels — the composer does " +
        "not yet consult them when fragmenting across linked frames",
    );
    await marginNote(
      ctx,
      page,
      "Keep flags ride the wire and persist, but the composer does not yet consult them when it fragments; measured, pixels unchanged. → Appendix A",
    );
  }

  // ── drop cap, with a Lead-In character range ─────────────────────
  const DROP =
    "Drop caps announce a beginning. The first character of this " +
    "paragraph is set three lines deep, and the opening words carry " +
    "the Lead-In character style in small capitals, the classic " +
    "pairing of a cap and its runway.";
  const drop = await proseFrame(ctx, page, [60, 540, 266, 636], [
    { text: DROP, style: STYLE.body },
  ]);
  elements.push(drop.frameId);
  const dropRange = doc.storyRangeId(drop.storyId, 0, DROP.length);
  await doc.setProperty("storyRange", dropRange, "paragraphDropCapCharacters", {
    type: "length",
    value: 1,
  });
  await doc.setProperty("storyRange", dropRange, "paragraphDropCapLines", {
    type: "length",
    value: 3,
  });
  await doc.applyStyle(
    drop.storyId,
    0,
    "Drop caps".length,
    await doc.characterStyle(CHAR.leadIn),
    "character",
  );

  // ── the spacing / indent battery (each line says what it carries) ─
  const battery = [
    { text: "Space before, 13 pt, opens this line.", path: "paragraphSpaceBefore", value: 13 },
    { text: "Space after, 13 pt, follows this line.", path: "paragraphSpaceAfter", value: 13 },
    {
      text:
        "First-line indent, 26 pt: only the opening line of this " +
        "paragraph steps in.",
      path: "paragraphFirstLineIndent",
      value: 26,
    },
    {
      text:
        "Left and right indents, 18 pt each, narrow this whole " +
        "paragraph from both sides.",
      path: "paragraphLeftIndent",
      value: 18,
    },
  ];
  const batteryFrame = await proseFrame(
    ctx,
    page,
    [286, 540, 492, 636],
    battery.map((b) => ({ text: b.text, style: STYLE.bodySmall })),
  );
  elements.push(batteryFrame.frameId);
  let offset = 0;
  for (const [i, b] of battery.entries()) {
    const start = offset;
    const end = offset + b.text.length;
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(batteryFrame.storyId, start, end),
      b.path,
      { type: "length", value: b.value },
    );
    if (b.path === "paragraphLeftIndent") {
      await doc.setProperty(
        "storyRange",
        doc.storyRangeId(batteryFrame.storyId, start, end),
        "paragraphRightIndent",
        { type: "length", value: 18 },
      );
    }
    offset = end + (i === battery.length - 1 ? 0 : 1);
  }

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 22",
      "paragraphKeepLinesTogether",
      "paragraphKeepWithNext",
      "paragraphDropCapCharacters",
      "paragraphDropCapLines",
      "indents + spacing",
    ]),
  );

  return {
    title: "Keeps, breaks, drop caps and indents",
    covers: ["typography.drop-caps", "stories-text.style-apply-range"],
    elements,
    notes,
  };
}
