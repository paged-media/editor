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

// Anchored objects (p40, verso): three anchors ride one paragraph —
// an inline square the height of the type, an above-line band, and a
// custom-position plate standing in the alley beside the column,
// bound to its anchoring line by reference points and offsets. All
// ten anchored* catalog paths are written; one carries spineRelative,
// and the margin says what that means on a verso.
//
// insertAnchoredFrame takes CONTIGUOUS char offsets (the applyStyle
// address space), and every insert shifts later offsets by one — so
// the three anchors land back to front.

import { expect } from "@playwright/test";

import { marginNote, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { caption, pourOne, prose, readEntry } from "./00-support";

const HOST_TEXT =
  "An anchored object is a page item that has surrendered its " +
  "independence: it belongs to a character in the story, travels with " +
  "that character through every edit, and reflows the line that carries " +
  "it. An inline anchor sits in the line as if it were a glyph — one " +
  "rides just here , matching the type it interrupts. An above-line " +
  "anchor claims a band of its own between two baselines; the tinted bar " +
  "above this sentence entered the story that way, as a character " +
  "wearing a rectangle. And a custom anchor may leave the column " +
  "altogether: the plate standing in the alley beside this paragraph is " +
  "positioned from its anchoring line by reference points and offsets, " +
  "and stays bound to it through every reflow. Cut the paragraph and all " +
  "three go with it.";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const page = p(40);
  const elements: string[] = [];

  const head = await prose(ctx, page, [60, 104, 492, 130], [
    { text: "Anchored objects", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // Host column left, explainer right, a 92 pt alley between them for
  // the custom plate to stand in.
  const host = await pourOne(ctx, page, [60, 150, 280, 470], HOST_TEXT, STYLE.body);
  const explainer = await prose(ctx, page, [372, 150, 492, 470], [
    {
      text:
        "Three positions, ten properties. Inline: the object is a glyph " +
        "with a bounding box. Above line: the object owns a band between " +
        "baselines. Custom: anchorPoint, the two reference points, the " +
        "two alignments and the two offsets place it anywhere on the " +
        "page — still tied to its character.",
      style: STYLE.bodySmall,
    },
    {
      text:
        "The plate in the alley is set from the TEXT FRAME edge, right-" +
        "aligned, 26 pt out and 6 pt above its anchoring baseline, and " +
        "its position is locked.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(host.frameId, explainer.frameId);

  // ── the three anchors, inserted back to front ─────────────────────
  const inlineAt = HOST_TEXT.indexOf("just here ") + "just here ".length;
  const aboveAt = HOST_TEXT.indexOf("An above-line anchor");
  const customAt = HOST_TEXT.indexOf("the plate standing");
  expect(inlineAt).toBeGreaterThan("just here ".length - 1);
  expect(aboveAt).toBeGreaterThan(inlineAt);
  expect(customAt).toBeGreaterThan(aboveAt);

  const customRect = await doc.mutateId("insertAnchoredFrame", {
    storyId: host.storyId,
    offset: customAt,
    width: 64,
    height: 64,
  });
  const aboveRect = await doc.mutateId("insertAnchoredFrame", {
    storyId: host.storyId,
    offset: aboveAt,
    width: 150,
    height: 22,
  });
  const inlineRect = await doc.mutateId("insertAnchoredFrame", {
    storyId: host.storyId,
    offset: inlineAt,
    width: 9,
    height: 9,
  });
  elements.push(customRect, aboveRect, inlineRect);

  // ── all ten anchored* paths, in one batch ─────────────────────────
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const vermilionTint = await doc.swatch(SWATCH.vermilionTint);
  const screenBlue = await doc.swatch(SWATCH.screenBlue);
  const set = (id: string, path: string, value: unknown) => ({
    op: "setElementProperty",
    args: { elementId: { kind: "rectangle", id }, path, value },
  });
  const text = (v: string) => ({ type: "text", value: v });
  const len = (v: number) => ({ type: "length", value: v });
  const bool = (v: boolean) => ({ type: "bool", value: v });
  const before = await doc.renderPage(page);
  await doc.batch([
    // inline: the explicit default, plus a fill so it reads as a glyph.
    set(inlineRect, "anchoredPosition", text("InlinePosition")),
    set(inlineRect, "frameFillColor", { type: "colorRef", value: vermilion }),
    // above line: centred band; spine-relative — the verso is the point.
    set(aboveRect, "anchoredPosition", text("AboveLine")),
    set(aboveRect, "anchoredHorizontalAlignment", text("CenterAlign")),
    set(aboveRect, "anchoredSpineRelative", bool(true)),
    set(aboveRect, "frameFillColor", { type: "colorRef", value: vermilionTint }),
    // custom: every remaining dial.
    set(customRect, "anchoredPosition", text("Anchored")),
    set(customRect, "anchorPoint", text("TopLeftAnchor")),
    set(customRect, "anchoredHorizontalReference", text("TextFrame")),
    set(customRect, "anchoredHorizontalAlignment", text("RightAlign")),
    set(customRect, "anchoredXOffset", len(26)),
    set(customRect, "anchoredVerticalReference", text("LineBaseline")),
    set(customRect, "anchoredVerticalAlignment", text("TopAlign")),
    set(customRect, "anchoredYOffset", len(-6)),
    set(customRect, "anchoredLockPosition", bool(true)),
    set(customRect, "frameFillColor", { type: "colorRef", value: screenBlue }),
  ]);
  await doc.expectRenderChanged(page, before);

  // The settings landed on the model, read back through the wire.
  const pos = await readEntry(
    ctx.page,
    { kind: "rectangle", id: aboveRect },
    "anchoredPosition",
  );
  expect(pos?.value).toBe("AboveLine");
  const anchor = await readEntry(
    ctx.page,
    { kind: "rectangle", id: customRect },
    "anchorPoint",
  );
  expect(anchor?.value).toBe("TopLeftAnchor");

  const cap = await caption(
    ctx,
    page,
    [60, 476, 280, 516],
    "Three anchors ride the column above: a vermilion inline square, a " +
      "tinted above-line band, and the blue custom plate standing in the " +
      "alley — all three are characters in the story.",
  );
  elements.push(cap);

  const note = await marginNote(
    ctx,
    page,
    "anchoredSpineRelative is set on the above-line band: on this verso " +
      "its offsets mirror against the spine, and the same object on the " +
      "facing recto would swing the other way at reflow. Behaviour note, " +
      "not a limit. → Appendix A",
  );
  elements.push(note);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 57",
      "insertAnchoredFrame ×3",
      "anchored* paths ×10",
      "spine-relative: see margin",
    ]),
  );

  return {
    title: "Anchored objects",
    covers: [
      "anchored-inline-objects.anchored-frames",
      "anchored-inline-objects.anchor-alignment",
      "anchored-inline-objects.anchored-ops",
    ],
    elements,
  };
}
