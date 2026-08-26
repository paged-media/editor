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

// Live style CRUD — p29. The page creates the paragraph style its own
// prose is set in ("Field Note", born "Field Memo" and renamed in
// front of the reader), dresses it through setStyleProperty, creates
// the character style for its openers, and runs a scratch pair through
// the full create → rename → delete triple, transiently. The narration
// records exactly what happened, in the style that happened to it.
//
// Two honest edges, learned from the engine rather than assumed: the
// wire surfaces no createdId for style CRUD (so the ids here are
// caller-chosen selfIds, the same convention the fixture uses), and
// the style-DEFINITION door carries eight property paths today
// (size, tracking, fill, space before/after, first-line indent,
// justification, next-style) — font family, leading and rules are not
// among them, so the font arrives through basedOn and the vermilion
// rule below is applied to the range. The margin note prints that
// boundary instead of hiding it.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

const PARA_ID = "ParagraphStyle/Annual Field Note";
const CHAR_ID = "CharacterStyle/Annual Field Note Caps";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const page = p(29);

  const bodyId = await doc.paragraphStyle(STYLE.body);
  const slate = await doc.swatch(SWATCH.slate);
  const vermilion = await doc.swatch(SWATCH.vermilion);

  // ── create + dress the paragraph style ───────────────────────────
  await doc.mutate("createParagraphStyle", {
    selfId: PARA_ID,
    name: "Field Memo",
    basedOn: bodyId,
  });
  const paraProps: Array<{ path: string; value: unknown }> = [
    { path: "characterFontSize", value: { type: "length", value: 8.5 } },
    { path: "characterTracking", value: { type: "length", value: 8 } },
    { path: "characterFillColor", value: { type: "colorRef", value: slate } },
    { path: "paragraphSpaceBefore", value: { type: "length", value: 6.5 } },
    { path: "paragraphSpaceAfter", value: { type: "length", value: 6.5 } },
    { path: "paragraphFirstLineIndent", value: { type: "length", value: 0 } },
    { path: "paragraphJustification", value: { type: "text", value: "LeftAlign" } },
    { path: "paragraphStyleNextStyle", value: { type: "text", value: bodyId } },
  ];
  for (const prop of paraProps) {
    await doc.mutate("setStyleProperty", {
      collection: "paragraph",
      styleId: PARA_ID,
      path: prop.path,
      value: prop.value,
    });
  }
  await doc.mutate("renameParagraphStyle", {
    styleId: PARA_ID,
    name: "Field Note",
  });

  // ── create + dress the character style ───────────────────────────
  await doc.mutate("createCharacterStyle", {
    selfId: CHAR_ID,
    name: "Field Note Caps",
  });
  const charProps: Array<{ path: string; value: unknown }> = [
    { path: "characterFontSize", value: { type: "length", value: 8.5 } },
    { path: "characterTracking", value: { type: "length", value: 70 } },
    {
      path: "characterFillColor",
      value: { type: "colorRef", value: vermilion },
    },
  ];
  for (const prop of charProps) {
    await doc.mutate("setStyleProperty", {
      collection: "character",
      styleId: CHAR_ID,
      path: prop.path,
      value: prop.value,
    });
  }

  // ── the scratch pair: create → rename → delete, transiently ──────
  const scratchTriple = async () => {
    await doc.mutate("createParagraphStyle", {
      selfId: "ParagraphStyle/Scratch Note",
      name: "Scratch Note",
      basedOn: bodyId,
    });
    await doc.mutate("renameParagraphStyle", {
      styleId: "ParagraphStyle/Scratch Note",
      name: "Scratch Note Rev B",
    });
    await doc.mutate("deleteParagraphStyle", {
      styleId: "ParagraphStyle/Scratch Note",
    });
    await doc.mutate("createCharacterStyle", {
      selfId: "CharacterStyle/Scratch Caps",
      name: "Scratch Caps",
    });
    await doc.mutate("renameCharacterStyle", {
      styleId: "CharacterStyle/Scratch Caps",
      name: "Scratch Caps Rev B",
    });
    await doc.mutate("deleteCharacterStyle", {
      styleId: "CharacterStyle/Scratch Caps",
    });
  };
  if (doc.ledger) {
    await doc.ledger.transient(scratchTriple);
  } else {
    await scratchTriple();
  }

  // ── the narration, wearing the style it narrates ─────────────────
  const head = await proseFrame(ctx, page, [48, 58, 480, 92], [
    { text: "Live style surgery", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const paras = [
    "This page performed surgery on its own wardrobe. The style these " +
      "words wear, Field Note, did not exist when the chapter began: " +
      "createParagraphStyle minted it, based on Annual Body, and eight " +
      "setStyleProperty writes dressed the definition - 8.5 pt type, " +
      "slate ink, a little tracking, half-rhythm space before and " +
      "after, no first-line indent, flush left, and a next-style " +
      "pointing back at Annual Body.",
    "It was born under the working name Field Memo and renamed in " +
      "front of you; renameParagraphStyle changes only the display " +
      "name, so the reference every one of these paragraphs holds " +
      "survived the change. The letterspaced vermilion openers are " +
      "Field Note Caps, a character style created the same way and " +
      "applied as a range on each paragraph.",
    "A second pair, Scratch Note and Scratch Caps, went through the " +
      "whole triple - created, renamed, deleted - in the same breath. " +
      "The deletions are real wire ops, so those styles are " +
      "demonstrated, not resident: the checkpoint this chapter saves " +
      "carries no trace of them.",
    "The vermilion rule under each paragraph is a range property, not " +
      "part of the definition. The style-definition door carries eight " +
      "paths today; font family, leading and rules are not among " +
      "them - the first two arrive here through the basedOn chain, the " +
      "rule through the range door.",
  ];
  const openerLen = (text: string): number =>
    text.split(" ").slice(0, 2).join(" ").length;
  const prose = await proseFrame(
    ctx,
    page,
    [48, 104, 480, 420],
    paras.map((text) => ({
      text,
      style: "Field Note",
      charRanges: [{ start: 0, end: openerLen(text), style: "Field Note Caps" }],
    })),
  );
  elements.push(prose.frameId);

  const total = paras.reduce((n, t) => n + t.length + 1, 0) - 1;
  await doc.setProperty(
    "storyRange",
    doc.storyRangeId(prose.storyId, 0, total),
    "paragraphRuleBelow",
    {
      type: "paragraphRule",
      value: { on: true, color: vermilion, weight: 0.75, offset: 4 },
    },
  );

  const caption = await proseFrame(ctx, page, [48, 436, 480, 478], [
    {
      text:
        "Field Note, created and dressed on this page · " +
        "setStyleProperty: characterFontSize, characterTracking, " +
        "characterFillColor, paragraphSpaceBefore, paragraphSpaceAfter, " +
        "paragraphFirstLineIndent, paragraphJustification, " +
        "paragraphStyleNextStyle",
      style: STYLE.caption,
    },
  ]);
  elements.push(caption.frameId);

  await marginNote(
    ctx,
    page,
    "The style-definition door carries 8 paths; font, leading and rules are basedOn or range matters. Scratch styles deleted. → Appendix A",
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 32",
      "createParagraphStyle",
      "renameParagraphStyle",
      "deleteParagraphStyle",
      "createCharacterStyle",
      "renameCharacterStyle",
      "deleteCharacterStyle",
      "setStyleProperty x11",
    ]),
  );

  return {
    title: "Live style CRUD",
    covers: [
      "styles.paragraph.crud",
      "styles.character.crud",
      "styles.set-style-property",
    ],
    elements,
  };
}
