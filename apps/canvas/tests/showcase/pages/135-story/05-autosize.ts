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

// Auto-sizing (p38): five identical too-small boxes holding the same
// paragraph, one per AutoSizingType. The oracle is the render delta
// around the property batch alone: the pours and captions land first,
// a baseline is taken, and then ONLY the auto-sizing modes are set —
// the pixels that move are the frames growing.

import { marginNote, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { Bounds } from "../../driver";
import type { PageContext, PageReport } from "../../types";
import { caption, pourOne, prose } from "./00-support";

const GROW_TEXT =
  "Auto-sizing lets the box answer to the text instead of the text to the " +
  "box: pour more and the frame grows in the directions its mode allows, " +
  "holding whichever edges the mode pins in place.";

// mode → where its starting box sits. `Off` is the control: same text,
// same box, no growth — it clips exactly like the overset page.
const EXHIBITS: Array<{ mode: string; box: Bounds; label: string }> = [
  {
    mode: "Off",
    box: [60, 210, 190, 252],
    label: "Off — the control: no growth, the box clips.",
  },
  {
    mode: "HeightOnly",
    box: [222, 210, 352, 252],
    label: "HeightOnly — the bottom edge gives way.",
  },
  {
    mode: "HeightAndWidth",
    box: [384, 210, 492, 252],
    label: "HeightAndWidth — both edges give.",
  },
  {
    mode: "WidthOnly",
    box: [60, 400, 190, 442],
    label: "WidthOnly — the right edge gives way.",
  },
  {
    mode: "HeightAndWidthProportionally",
    box: [260, 400, 390, 442],
    label: "HeightAndWidthProportionally — the box keeps its shape.",
  },
];

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const page = p(38);
  const elements: string[] = [];

  const head = await prose(ctx, page, [60, 104, 492, 130], [
    { text: "The box that answers to the text", style: STYLE.head1 },
  ]);
  const intro = await prose(ctx, page, [60, 134, 492, 186], [
    {
      text:
        "Five identical boxes, the same paragraph poured into each, and " +
        "five auto-sizing modes: the control stays put and clips; the rest " +
        "grow in the directions their mode allows. The page's own proof is " +
        "a render taken before and after the five property writes — only " +
        "the growth lies between.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  const slate = await doc.swatch(SWATCH.slate);
  const cellIds: string[] = [];
  const ops: Array<{ op: string; args: unknown }> = [];
  for (const ex of EXHIBITS) {
    // Caption ABOVE the box: growth runs down and to the right, so the
    // label keeps clear of it.
    const capTop = ex.box[1] - 22;
    elements.push(
      await caption(ctx, page, [ex.box[0], capTop, ex.box[0] + 160, capTop + 20], ex.label),
    );
    const cell = await pourOne(ctx, page, ex.box, GROW_TEXT, STYLE.bodySmall);
    cellIds.push(cell.frameId);
    elements.push(cell.frameId);
    ops.push(
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "textFrame", id: cell.frameId },
          path: "frameStrokeColor",
          value: { type: "colorRef", value: slate },
        },
      },
      {
        op: "setElementProperty",
        args: {
          elementId: { kind: "textFrame", id: cell.frameId },
          path: "frameStrokeWeight",
          value: { type: "length", value: 0.5 },
        },
      },
    );
  }
  // Strokes land BEFORE the baseline so the delta isolates the modes.
  await doc.batch(ops);

  const before = await doc.renderPage(page);
  await doc.batch(
    EXHIBITS.map((ex, i) => ({
      op: "setElementProperty",
      args: {
        elementId: { kind: "textFrame", id: cellIds[i] },
        path: "textFrameAutoSizing",
        value: { type: "text", value: ex.mode },
      },
    })),
  );
  await doc.expectRenderChanged(page, before);

  const note = await marginNote(
    ctx,
    page,
    "The wire sets the auto-sizing MODE only: AutoSizingReferencePoint — " +
      "the anchor the growth holds — is parse- and render-side, with no " +
      "catalog path to write it, so every box here grows from the " +
      "parser-default anchor. → Appendix A",
  );
  elements.push(note);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 55",
      "textFrameAutoSizing ×5",
      "mode-only; anchor: see margin",
      "oracle: render delta",
    ]),
  );

  return {
    title: "Auto-sizing — five modes",
    covers: ["layout-model.frame-autosizing"],
    elements,
  };
}
