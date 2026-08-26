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

// Bullets & numbering — p31. A bulleted list (style-borne, then two
// lines converted live via paragraphListType + paragraphBulletCharacter),
// a numbered list with a lettered sub-level (paragraphNumberingFormat),
// and the list-resource op triple: createNumberingList mints the
// visible "Annual Steps" list, editNumberingList flips its
// ContinueNumbersAcrossStories flag — a VISIBLE change, the second
// frame's numbers go from restarting at 1 to continuing at 4 — and a
// scratch list exercises deleteNumberingList transiently. The edit's
// effect is measured in pixels, not assumed.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

const LIST_ID = "NumberingList/Annual Steps";

const BULLET_STYLED = [
  "A bulleted paragraph is a style choice, not typed glyphs.",
  "The marker comes from the definition: the default round bullet.",
  "Delete the style and the bullets would vanish with it.",
];
const BULLET_LIVE = [
  "These two lines were plain body text until two range writes made them a list.",
  "Their dash marker is paragraphBulletCharacter, set live.",
];

const STEPS_A = ["Mix the ink.", "Set the line.", "Pull a proof."];
const STEPS_SUB = ["Check the margins.", "Check the colour."];
const STEPS_B = ["Wash the form.", "Distribute the type.", "Note the run."];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(31);

  const head = await proseFrame(ctx, page, [48, 58, 480, 92], [
    { text: "Bullets and numbering", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // ── the list resource: create (visible), edit (visible), delete ──
  await doc.mutate("createNumberingList", {
    spec: {
      selfId: LIST_ID,
      name: "Annual Steps",
      continueAcrossStories: false,
    },
  });
  const scratchList = async () => {
    await doc.mutate("createNumberingList", {
      spec: { selfId: "NumberingList/Scratch List", name: "Scratch List" },
    });
    await doc.mutate("deleteNumberingList", {
      listId: "NumberingList/Scratch List",
    });
  };
  if (doc.ledger) {
    await doc.ledger.transient(scratchList);
  } else {
    await scratchList();
  }

  // ── bullets: style-borne, then converted live ────────────────────
  const bulletParas = [
    ...BULLET_STYLED.map((text) => ({ text, style: STYLE.bulletList })),
    ...BULLET_LIVE.map((text) => ({ text, style: STYLE.body })),
  ];
  const bullets = await proseFrame(ctx, page, [48, 104, 252, 250], bulletParas);
  elements.push(bullets.frameId);
  //

  // Offsets of the two live-converted paragraphs.
  let cursor = 0;
  const spans: Array<[number, number]> = [];
  for (const [i, para] of bulletParas.entries()) {
    spans.push([cursor, cursor + para.text.length]);
    cursor += para.text.length + (i === bulletParas.length - 1 ? 0 : 1);
  }
  for (const [start, end] of spans.slice(BULLET_STYLED.length)) {
    const range = doc.storyRangeId(bullets.storyId, start, end);
    await doc.setProperty("storyRange", range, "paragraphListType", {
      type: "text",
      value: "BulletList",
    });
    await doc.setProperty("storyRange", range, "paragraphBulletCharacter", {
      type: "text",
      value: "-",
    });
  }
  const bulletCap = await proseFrame(ctx, page, [48, 256, 252, 300], [
    {
      text:
        "Bullet List (style) · paragraphListType = BulletList + " +
        "paragraphBulletCharacter (live)",
      style: STYLE.caption,
    },
  ]);
  elements.push(bulletCap.frameId);

  // ── the numbered frames, bound to the Annual Steps list ──────────
  const bindToList = async (
    storyId: string,
    texts: string[],
  ): Promise<void> => {
    let offset = 0;
    for (const [i, text] of texts.entries()) {
      const range = doc.storyRangeId(storyId, offset, offset + text.length);
      await doc.setProperty("storyRange", range, "paragraphAppliedNumberingList", {
        type: "text",
        value: LIST_ID,
      });
      offset += text.length + (i === texts.length - 1 ? 0 : 1);
    }
  };

  const frameA = await proseFrame(
    ctx,
    page,
    [276, 104, 480, 168],
    STEPS_A.map((text) => ({ text, style: STYLE.numbered1 })),
  );
  elements.push(frameA.frameId);
  await bindToList(frameA.storyId, STEPS_A);

  // The lettered sub-level: its own story, so it restarts; the format
  // is a per-range write.
  const sub = await proseFrame(
    ctx,
    page,
    [300, 174, 480, 222],
    STEPS_SUB.map((text) => ({ text, style: STYLE.numbered2 })),
  );
  elements.push(sub.frameId);
  let subOffset = 0;
  for (const [i, text] of STEPS_SUB.entries()) {
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(sub.storyId, subOffset, subOffset + text.length),
      "paragraphNumberingFormat",
      { type: "text", value: "a, b, c, d..." },
    );
    subOffset += text.length + (i === STEPS_SUB.length - 1 ? 0 : 1);
  }
  const capA = await proseFrame(ctx, page, [276, 228, 480, 276], [
    {
      text:
        "Numbered 1 + appliedNumberingList = Annual Steps · sub-level " +
        "Numbered 2, paragraphNumberingFormat = a, b, c",
      style: STYLE.caption,
    },
  ]);
  elements.push(capA.frameId);

  const frameB = await proseFrame(
    ctx,
    page,
    [276, 300, 480, 364],
    STEPS_B.map((text) => ({ text, style: STYLE.numbered1 })),
  );
  elements.push(frameB.frameId);
  await bindToList(frameB.storyId, STEPS_B);

  // ── editNumberingList: measure the flag flip in pixels ───────────
  const before = await doc.renderPage(page);
  await doc.mutate("editNumberingList", {
    listId: LIST_ID,
    spec: {
      selfId: LIST_ID,
      name: "Annual Steps",
      continueAcrossStories: true,
    },
  });
  let editMovedPixels = false;
  for (let attempt = 0; attempt < 6 && !editMovedPixels; attempt += 1) {
    const after = await doc.renderPage(page);
    editMovedPixels = !after.equals(before);
    if (!editMovedPixels) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!editMovedPixels) {
    notes.push(
      "editNumberingList set ContinueNumbersAcrossStories=true but the " +
        "second frame's numbering did not repaint — continuation not " +
        "honoured on this run",
    );
  }
  const capB = await proseFrame(ctx, page, [276, 370, 480, 430], [
    {
      text: editMovedPixels
        ? "The same list in a second story: born restarting at 1, it " +
          "continues at 4 since editNumberingList set " +
          "ContinueNumbersAcrossStories"
        : "The same list in a second story; editNumberingList set " +
          "ContinueNumbersAcrossStories, measured without pixel effect " +
          "on this run",
      style: STYLE.caption,
    },
  ]);
  elements.push(capB.frameId);

  // ── narration ────────────────────────────────────────────────────
  const prose = await proseFrame(ctx, page, [48, 320, 252, 560], [
    {
      text:
        "Three ops govern the list resources. createNumberingList " +
        "minted Annual Steps, the list both numbered frames opposite " +
        "are bound to through paragraphAppliedNumberingList. It was " +
        "born story-scoped, so the lower frame - a separate story - " +
        "restarted at one; editNumberingList then set " +
        "ContinueNumbersAcrossStories and the lower frame carries on " +
        "from the upper. A third list, Scratch List, was created and " +
        "deleted again: demonstrated, not resident.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        "The lettered entries restart because they live in their own " +
        "story. An explicit start-at is not a property path on the " +
        "wire, so a sub-level restarts by story scope here; the margin " +
        "note records the boundary.",
      style: STYLE.body,
    },
  ]);
  elements.push(prose.frameId);

  await marginNote(
    ctx,
    page,
    "NumberingStartAt and per-level restarts are not on the wire; the lettered sub-list restarts by story scope. → Appendix A",
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 34",
      "createNumberingList",
      "editNumberingList",
      "deleteNumberingList",
      "appliedNumberingList",
      "paragraphListType",
      "paragraphBulletCharacter",
      "paragraphNumberingFormat",
    ]),
  );

  return {
    title: "Bullets, numbering, and the list resource",
    covers: ["styles.bullets-numbering"],
    elements,
    notes,
  };
}
