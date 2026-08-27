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

// Text-frame preferences (p37): columns with a gutter, balanced
// columns, vertical justification with an inset — and a strip showing
// every FirstBaselineOffset mode side by side in identical boxes, so
// the six first-baseline policies read as six different drops against
// the same frame edge.

import { specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { Bounds } from "../../driver";
import type { PageContext, PageReport } from "../../types";
import { caption, pourOne, prose } from "./00-support";

const COLUMNS_TEXT =
  "A column is a promise about line length: split the box in two and " +
  "every line stays short enough to read without effort. The gutter is " +
  "the fence between them — ten points of it here.";

const BALANCE_TEXT =
  "Balancing splits the text so both columns of this box end within a " +
  "line of each other.";

// The six FirstBaselineOffset policies, in catalog order.
const FIRST_BASELINE_MODES = [
  "AscentOffset",
  "CapHeight",
  "XHeight",
  "EmBoxHeight",
  "LeadingOffset",
  "FixedHeight",
] as const;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const page = p(37);
  const elements: string[] = [];

  const head = await prose(ctx, page, [48, 104, 480, 130], [
    { text: "Columns, balance, depth, and the first baseline", style: STYLE.head1 },
  ]);
  const intro = await prose(ctx, page, [48, 134, 480, 186], [
    {
      text:
        "Three frames, three text-frame preferences: a two-column split " +
        "with a ten-point gutter, the same split balanced so the columns " +
        "end even, and a vertically justified box whose inset holds the " +
        "text off its own stroke. Below them, the six first-baseline " +
        "policies in identical boxes.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  const slate = await doc.swatch(SWATCH.slate);

  // ── frame 1: two columns + gutter ─────────────────────────────────
  const f1 = await pourOne(ctx, page, [48, 200, 182, 344], COLUMNS_TEXT, STYLE.bodySmall);
  // ── frame 2: balanced columns ─────────────────────────────────────
  const f2 = await pourOne(ctx, page, [196, 200, 330, 344], BALANCE_TEXT, STYLE.bodySmall);
  // ── frame 3: vertical justify + inset, stroked so both read ───────
  const f3 = await prose(ctx, page, [344, 200, 480, 344], [
    { text: "The top of the box.", style: STYLE.bodySmall },
    { text: "The middle holds its ground.", style: STYLE.bodySmall },
    { text: "The bottom of the box.", style: STYLE.bodySmall },
  ]);
  elements.push(f1.frameId, f2.frameId, f3.frameId);

  const set = (id: string, path: string, value: unknown) => ({
    op: "setElementProperty",
    args: { elementId: { kind: "textFrame", id }, path, value },
  });
  await doc.batch([
    set(f1.frameId, "textFrameColumnCount", { type: "length", value: 2 }),
    set(f1.frameId, "textFrameColumnGutter", { type: "length", value: 10 }),
    set(f2.frameId, "textFrameColumnCount", { type: "length", value: 2 }),
    set(f2.frameId, "textFrameColumnGutter", { type: "length", value: 10 }),
    set(f2.frameId, "textFrameColumnBalance", { type: "bool", value: true }),
    set(f3.frameId, "textFrameVerticalJustification", {
      type: "text",
      value: "JustifyAlign",
    }),
    set(f3.frameId, "frameInsetSpacing", { type: "bounds", value: [10, 10, 10, 10] }),
    set(f3.frameId, "frameStrokeColor", { type: "colorRef", value: slate }),
    set(f3.frameId, "frameStrokeWeight", { type: "length", value: 0.5 }),
  ]);

  elements.push(
    await caption(ctx, page, [48, 348, 182, 380], "Two columns, 10 pt gutter."),
    await caption(
      ctx,
      page,
      [196, 348, 330, 380],
      "Balanced — both columns end even.",
    ),
    await caption(
      ctx,
      page,
      [344, 348, 480, 380],
      "Vertical justify, 10 pt inset off the stroke.",
    ),
  );

  // ── the first-baseline strip: six identical boxes, six policies ───
  const stripTitle = await caption(
    ctx,
    page,
    [48, 392, 480, 410],
    "FirstBaselineOffset — the same two words in the same 44 pt box, six ways:",
  );
  elements.push(stripTitle);

  const stripOps: Array<{ op: string; args: unknown }> = [];
  for (const [i, mode] of FIRST_BASELINE_MODES.entries()) {
    const left = 48 + i * 72;
    const box: Bounds = [left, 414, left + 64, 458];
    const cell = await pourOne(ctx, page, box, "First line", STYLE.bodySmall);
    elements.push(cell.frameId);
    stripOps.push(
      set(cell.frameId, "textFrameFirstBaseline", { type: "text", value: mode }),
      set(cell.frameId, "frameStrokeColor", { type: "colorRef", value: slate }),
      set(cell.frameId, "frameStrokeWeight", { type: "length", value: 0.5 }),
    );
    elements.push(await caption(ctx, page, [left, 462, left + 70, 480], mode));
  }
  const beforeStrip = await doc.renderPage(page);
  await doc.batch(stripOps);
  // The six policies must actually MOVE the first line: if the batch
  // changed nothing on the page, the modes did not land.
  await doc.expectRenderChanged(page, beforeStrip);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 54",
      "textFrameColumnCount/Gutter",
      "textFrameColumnBalance",
      "textFrameVerticalJustification",
      "frameInsetSpacing",
      "textFrameFirstBaseline ×6",
    ]),
  );

  return {
    title: "Text-frame preferences",
    covers: [
      "layout-model.vertical-justification",
      "layout-model.first-baseline-offset",
    ],
    elements,
  };
}
