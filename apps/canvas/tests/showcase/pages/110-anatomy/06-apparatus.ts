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

// Conditions and variables — the apparatus that decides what a page
// shows. The same three-sentence set is tagged three ways
// (Print-only, Screen-only, Spec-Notes), the screen lane is switched
// off and on again (pixel-proved), and the text-variable inventory is
// read out of the document's own designmap rather than typed — the
// wire has no variables collection, so the export door is the honest
// read (idml-read.ts).
//
// Geometry is page-space (x0, y0, x1, y1) per the driver helpers.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import {
  CONDITION,
  RUNNING_HEAD_VERSO_TEXT,
  STYLE,
  contentBox,
  p,
} from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { textVariables } from "./idml-read";

const LINES = [
  "This sentence is bound for the press run and nowhere else.",
  "This sentence exists only where a screen renders it.",
  "This sentence is production apparatus, visible while the working copy shows its notes.",
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];

  const [x0, y0, x1] = contentBox(p(18));
  const left = x0;
  const right = x1;
  const top = y0;

  const head = await proseFrame(ctx, p(18), [left, top, right, top + 30], [
    { text: "Conditions and variables", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // ── the same sentence set, three ways ───────────────────────────
  const tagged = await proseFrame(
    ctx,
    p(18),
    [left, top + 40, right, top + 148],
    LINES.map((text, i) => ({
      text,
      style: i === 0 ? STYLE.bodyFirst : STYLE.body,
    })),
  );
  elements.push(tagged.frameId);

  const offsetOf = (idx: number): [number, number] => {
    let start = 0;
    for (let i = 0; i < idx; i += 1) start += LINES[i].length + 1;
    return [start, start + LINES[idx].length];
  };
  const printOnly = await doc.condition(CONDITION.printOnly);
  const screenOnly = await doc.condition(CONDITION.screenOnly);
  const specNotes = await doc.condition(CONDITION.specNotes);
  const conditionIds = [printOnly, screenOnly, specNotes];
  for (const [i, conditionId] of conditionIds.entries()) {
    const [start, end] = offsetOf(i);
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(tagged.storyId, start, end),
      "appliedConditions",
      { type: "text", value: conditionId },
    );
  }

  const legend = await proseFrame(ctx, p(18), [left, top + 152, right, top + 180], [
    {
      text: `Line one carries ${CONDITION.printOnly}, line two ${CONDITION.screenOnly}, line three ${CONDITION.specNotes}. While this page was set, ${CONDITION.screenOnly} was switched off and the second line left the render; switched back on, it returned.`,
      style: STYLE.caption,
    },
  ]);
  elements.push(legend.frameId);

  // Filtering, pixel-proved both ways.
  const allVisible = await doc.renderPage(p(18));
  await doc.mutate("setConditionVisible", {
    condition: screenOnly,
    visible: false,
  });
  await doc.expectRenderChanged(p(18), allVisible);
  const filtered = await doc.renderPage(p(18));
  await doc.mutate("setConditionVisible", {
    condition: screenOnly,
    visible: true,
  });
  await doc.expectRenderChanged(p(18), filtered);

  // ── the variable inventory, read from the designmap ─────────────
  const variables = await textVariables(doc);
  if (variables.length === 0) {
    throw new Error(
      "the designmap lists no text variables — the annual fixture defines four",
    );
  }
  const inventoryHead = await proseFrame(
    ctx,
    p(18),
    [left, top + 196, right, top + 222],
    [{ text: "Text variables, read from the document", style: STYLE.head2 }],
  );
  elements.push(inventoryHead.frameId);

  const rows = variables.map((v) => {
    const detail =
      v.contents !== null
        ? `resolves to "${v.contents}"`
        : v.headerStyle !== null
          ? `picks up ${v.headerUse ?? "FirstOnPage"} of its named style`
          : "resolves at composition time";
    return { text: `${v.name} — ${v.variableType} — ${detail}`, style: STYLE.catalogEntry };
  });
  const inventory = await proseFrame(
    ctx,
    p(18),
    [left, top + 228, right, top + 228 + rows.length * 26 + 20],
    rows,
  );
  elements.push(inventory.frameId);

  const prose = await proseFrame(
    ctx,
    p(18),
    [left, top + 370, right, top + 520],
    [
      {
        text: `A variable is a slot the composer fills, and the running heads of this book are the working demonstration. The verso head is plain master text — ${RUNNING_HEAD_VERSO_TEXT} on every body verso. The recto head is a Running Header variable: after layout, it resolves to the first Chapter Title paragraph at or before its page, which is why the rectos of this chapter carry the title set on page 13 without any page carrying that text itself.`,
        style: STYLE.bodyFirst,
      },
      {
        text: "Custom-text and page-count variables resolve from the designmap at emit; date variables format a deterministic clock. Every one of them keeps a baked ResultText as its fallback, and the margin records where the fallback is what you would see.",
        style: STYLE.body,
      },
    ],
  );
  elements.push(prose.frameId);

  elements.push(
    await marginNote(
      ctx,
      p(18),
      "Where no Chapter Title paragraph precedes a page, the Running Header variable prints its baked ResultText — the literal word Chapter in this fixture. The registry row still records renderer support for header/chapter variables as partial → Appendix A.",
    ),
  );

  elements.push(
    await specLabel(ctx, p(18), [
      "Specimen No. 12",
      "appliedConditions",
      "setConditionVisible",
      "designmap variables (live read)",
    ]),
  );

  notes.push(
    "text-variable inventory read from the document's designmap via the export door — no variables collection exists on the wire",
  );

  return {
    title: "Conditions and variables",
    covers: [
      "conditional-text.applied-conditions",
      "conditional-text.condition-ops",
      "conditional-text.visibility-filtering",
      "sections-numbering-variables.text-variables",
    ],
    elements,
    notes,
  };
}
