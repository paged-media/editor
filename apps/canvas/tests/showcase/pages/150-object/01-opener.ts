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

// Ch.8 opener — p47, C-Opener recto. The z-order ladder: five mutually
// overlapping tinted plates, inserted A through E and then walked with
// every reorderElement target the wire declares — front, back,
// forward, backward and the absolute { index } form — with a render
// gate after each step so a reorder that painted nothing would fail
// here, not at assembly. The legend beside the ladder prints the final
// paint order so the page can be checked against itself.
//
// Order-of-authorship matters and is deliberate: the five plates are
// inserted LAST before the walk, so during the walk they are the five
// topmost items in the spread's paint order and forward/backward swap
// plate against plate rather than against a caption frame somewhere
// else on the spread. All five ride the Content layer — the renderer
// sorts by layer before painting (stably), so keeping them on one
// layer is what makes their relative order the thing on display.

import { assignLayer, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

const PLATE_W = 180;
const PLATE_H = 110;
const STEP_X = 40;
const STEP_Y = 24;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(47);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];

  // ── the opener block ─────────────────────────────────────────────
  const number = await proseFrame(ctx, page, [left, 96, 150, 174], [
    { text: "8", style: STYLE.chapterNumber },
  ]);
  const title = await proseFrame(ctx, page, [160, 100, right, 170], [
    { text: "The Object", style: STYLE.chapterTitle },
  ]);
  const deck = await proseFrame(ctx, page, [left, 186, right, 300], [
    {
      text:
        "Everything on a page is an object with a stacking order, a " +
        "transform, corners, a stroke and, sometimes, other objects " +
        "inside it. This chapter takes one plain rectangle and asks it " +
        "every question the wire knows how to ask.",
      style: STYLE.deck,
    },
  ]);
  elements.push(number.frameId, title.frameId, deck.frameId);

  const intro = await proseFrame(ctx, page, [left, 312, right, 372], [
    {
      text:
        "Below, five plates were inserted back to front, A first and E " +
        "last, then rearranged live: A to the front, B to the front over " +
        "it, A one step forward and one step backward, E to the back, " +
        "and finally D to absolute index zero. Every overlap you can " +
        "read is the paint order saying so.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(intro.frameId);

  // ── the ladder: five mutually overlapping plates ─────────────────
  const swatches = [
    SWATCH.vermilion,
    SWATCH.labMarigold,
    SWATCH.screenBlue,
    SWATCH.slate,
    SWATCH.vermilionTint,
  ];
  const letters = ["A", "B", "C", "D", "E"];
  const plateIds: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const x = left + i * STEP_X;
    const y = 390 + i * STEP_Y;
    const id = await doc.rectangle(pageId, [x, y, x + PLATE_W, y + PLATE_H]);
    await doc.setProperty("rectangle", id, "frameFillColor", {
      type: "colorRef",
      value: await doc.swatch(swatches[i]),
    });
    await assignLayer(ctx, "rectangle", id, LAYER.content);
    plateIds.push(id);
    elements.push(id);
  }

  // ── the walk: every ZOrderTarget the wire declares ───────────────
  const step = async (
    plate: number,
    to: unknown,
    what: string,
  ): Promise<void> => {
    const before = await doc.renderPage(page);
    await doc.mutate("reorderElement", {
      elementId: { kind: "rectangle", id: plateIds[plate] },
      to,
    });
    // Each target must visibly change an overlap — a reorder that
    // repaints nothing is a wrong ladder, not a passed step.
    await doc.expectRenderChanged(page, before);
    notes.push(`reorderElement ${letters[plate]} -> ${what}: repainted`);
  };
  // The sequence is chosen so each step's changed overlap is not
  // occluded by a plate above it (a swap two layers under the frontmost
  // plate repaints nothing visible and would time the gate out — the
  // first draft of this ladder had exactly that bug on paper):
  // forward/backward act on the two FRONTMOST plates, and the two
  // send-to-back steps flip the ladder's uncovered lower-right reach.
  await step(0, "front", "front");
  await step(1, "front", "front (over A)");
  await step(0, "forward", "forward (back over B)");
  await step(0, "backward", "backward (under B again)");
  await step(4, "back", "back");
  await step(3, { index: 0 }, "index 0 (absolute back)");

  // Final paint order, back to front: D, E, C, A, B — the legend
  // states it rather than asserting it, because the spread also holds
  // fixture items; what IS asserted is that every single step changed
  // the render. (Full-width caption, not a narrow side column — live
  // frames under ~140 pt compose at a fraction of their width; see the
  // chapter notes.)
  const caption = await proseFrame(ctx, page, [left, 604, right, 639], [
    {
      text:
        "A vermilion, B marigold, C screen blue, D slate, E vermilion " +
        "20%. reorderElement walked all five targets - front, back, " +
        "forward, backward, absolute index - six steps, six gated " +
        "repaints. Final order, back to front: D, E, C, A, B.",
      style: STYLE.caption,
    },
  ]);
  elements.push(caption.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 65",
      "reorderElement x6 (all ZOrderTargets)",
      "5-plate ladder, per-step render gate",
      "C-Opener",
    ]),
  );

  return {
    title: "Ch.8 opener — the z-order ladder",
    covers: ["layers.z-ordering", "frames-paths.frame.insert"],
    elements,
    notes,
  };
}
