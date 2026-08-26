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

// Rules, shading, borders, tabs — p32. Paragraph rules above and below
// as whole ParagraphRule structs; the tab-stop menu, one line per
// alignment (left, centre, right, decimal-on-the-point) with dot
// leaders, plus a figure stack aligned on the decimal; and the honest
// margin: paragraph SHADING and paragraph BORDER parse and render from
// IDML, but neither has a property path on the wire, so they cannot be
// authored live and are not faked here.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const page = p(32);

  const vermilion = await doc.swatch(SWATCH.vermilion);
  const slate = await doc.swatch(SWATCH.slate);

  const head = await proseFrame(ctx, page, [60, 58, 492, 92], [
    { text: "Rules, shading, borders, tabs", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // ── rules above and below, whole structs ─────────────────────────
  const RULED =
    "Ruled matter: this paragraph carries a vermilion rule above and " +
    "a slate rule below, each a whole ParagraphRule struct - on, " +
    "colour, weight, offset - set on the range in a single write.";
  const ruled = await proseFrame(ctx, page, [60, 112, 492, 172], [
    { text: RULED, style: STYLE.body },
  ]);
  elements.push(ruled.frameId);
  const ruledRange = doc.storyRangeId(ruled.storyId, 0, RULED.length);
  await doc.setProperty("storyRange", ruledRange, "paragraphRuleAbove", {
    type: "paragraphRule",
    value: { on: true, color: vermilion, weight: 1, offset: 3 },
  });
  await doc.setProperty("storyRange", ruledRange, "paragraphRuleBelow", {
    type: "paragraphRule",
    value: { on: true, color: slate, weight: 0.5, offset: 3 },
  });
  const ruleCap = await proseFrame(ctx, page, [60, 180, 492, 208], [
    {
      text:
        "paragraphRuleAbove: Vermilion, 1 pt · paragraphRuleBelow: " +
        "Slate, 0.5 pt",
      style: STYLE.caption,
    },
  ]);
  elements.push(ruleCap.frameId);

  // ── the tab-stop menu: one line per alignment, dot leaders ───────
  const menu: Array<{
    text: string;
    stop: {
      position: number;
      alignment: string;
      alignmentCharacter?: string;
      leader?: string;
    };
  }> = [
    {
      text: "Left stop, 132 pt\tflush left after the leader",
      stop: { position: 132, alignment: "LeftAlign", leader: "." },
    },
    {
      text: "Centre stop, 240 pt\tcentred on the stop",
      stop: { position: 240, alignment: "CenterAlign", leader: "." },
    },
    {
      text: "Right stop, 420 pt\tflush right",
      stop: { position: 420, alignment: "RightAlign", leader: "." },
    },
    {
      text: "Decimal stop, 300 pt\t1,204.75",
      stop: {
        position: 300,
        alignment: "CharacterAlign",
        alignmentCharacter: ".",
        leader: ".",
      },
    },
  ];
  const menuFrame = await proseFrame(
    ctx,
    page,
    [60, 220, 492, 296],
    menu.map((m) => ({ text: m.text, style: STYLE.body })),
  );
  elements.push(menuFrame.frameId);
  let offset = 0;
  for (const [i, m] of menu.entries()) {
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(menuFrame.storyId, offset, offset + m.text.length),
      "paragraphTabStops",
      { type: "tabStops", value: [m.stop] },
    );
    offset += m.text.length + (i === menu.length - 1 ? 0 : 1);
  }
  const menuCap = await proseFrame(ctx, page, [60, 300, 492, 328], [
    {
      text:
        "paragraphTabStops · LeftAlign / CenterAlign / RightAlign / " +
        "CharacterAlign with alignmentCharacter = period, leader = dot",
      style: STYLE.caption,
    },
  ]);
  elements.push(menuCap.frameId);

  // ── the figure stack: three sums aligned on the point ────────────
  const figures = ["ink\t12.5", "paper\t1,204.75", "thread\t0.9"];
  const stack = await proseFrame(
    ctx,
    page,
    [60, 344, 262, 404],
    figures.map((text) => ({ text, style: STYLE.body })),
  );
  elements.push(stack.frameId);
  const stackTotal = figures.reduce((n, t) => n + t.length + 1, 0) - 1;
  await doc.setProperty(
    "storyRange",
    doc.storyRangeId(stack.storyId, 0, stackTotal),
    "paragraphTabStops",
    {
      type: "tabStops",
      value: [
        { position: 150, alignment: "CharacterAlign", alignmentCharacter: "." },
      ],
    },
  );
  const stackCap = await proseFrame(ctx, page, [60, 410, 262, 452], [
    {
      text: "One CharacterAlign stop shared by three lines: the points sit plumb",
      style: STYLE.caption,
    },
  ]);
  elements.push(stackCap.frameId);

  // ── prose + the honest margin ────────────────────────────────────
  const prose = await proseFrame(ctx, page, [286, 344, 492, 560], [
    {
      text:
        "A paragraph rule is not an underline: it belongs to the " +
        "paragraph, spans the measure less its indents, and rides the " +
        "wire as one struct, so a single write replaces colour, " +
        "weight and offset together. Tab stops travel the same way - " +
        "the whole TabList replaced per write, which is why each menu " +
        "line above carries its own private stop.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        "Paragraph shading and paragraph borders are the missing " +
        "guests at this table: the engine parses both from IDML and " +
        "renders both faithfully, but neither has a property path, so " +
        "a live page cannot yet author them. They appear in this book " +
        "only where a fixture declared them - and honestly, in the " +
        "margin, where they do not.",
      style: STYLE.body,
    },
  ]);
  elements.push(prose.frameId);

  await marginNote(
    ctx,
    page,
    "Paragraph shading and border parse + render but have no property path on the wire; not authorable live, not faked. → Appendix A",
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 35",
      "paragraphRuleAbove",
      "paragraphRuleBelow",
      "paragraphTabStops",
      "CharacterAlign + leader",
    ]),
  );

  return {
    title: "Rules, tabs, and the honest margin",
    covers: ["styles.paragraph-rules", "typography.tab-stops"],
    elements,
  };
}
