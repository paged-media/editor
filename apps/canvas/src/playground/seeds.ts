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

// Named seed documents for the docs scripting playground (?embed=script&seed=).
//
// Each seed is PURE `paged.*` source — the SAME surface the editable snippet
// uses — so a seed dogfoods the authoring API and can also be validated
// headlessly by `paged-run` from the docs CI gate (identical bytes ship and
// test). The bridge runs the seed against a freshly-blanked document before
// handing control to the user's snippet, so read/style/text examples start
// from real, addressable content with a frame already selected.
//
// Authoring relies on the engine returning created ids: `paged.insertTextFrame`
// /`insertFrame` return the new `kind:id` address and auto-select it;
// `paged.pages()` yields page ids; `paged.stories()` yields the minted story.
// Keep seeds DETERMINISTIC (fixed bounds/text) so reseed + CI are repeatable.

export type SeedId =
  | "blank"
  | "one-text-frame-selected"
  | "two-frames"
  | "styled-story"
  | "swatches-and-styles"
  | "image-frame"
  | "a-table";

/** A seed: a short human label + the pure-`paged.*` prelude that builds it. */
export interface Seed {
  readonly title: string;
  readonly summary: string;
  readonly prelude: string;
}

// A page is US Letter (612×792 pt); bounds are page-local [top, left, bottom,
// right] in points. The helpers below keep the seeds readable.
const PARA =
  "Paged is a programmable page-layout engine. This frame and its text were " +
  "created by a paged.* seed script — the same API you are about to drive.";

export const SEEDS: Record<SeedId, Seed> = {
  blank: {
    title: "Blank document",
    summary: "An empty US-Letter page — nothing placed.",
    prelude: "",
  },

  "one-text-frame-selected": {
    title: "One text frame (selected)",
    summary: "A single text frame with a paragraph of body text, already selected.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
paged.insertTextFrame(pid, [144, 72, 360, 540]);
const stories = JSON.parse(paged.stories());
if (stories.length) {
  paged.insertText(stories[0].selfId, 0, ${JSON.stringify(PARA)});
}
`.trim(),
  },

  "two-frames": {
    title: "Two frames",
    summary: "A text frame and a graphic frame — for grouping, threading, and z-order examples.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
paged.insertTextFrame(pid, [72, 72, 300, 320]);
paged.insertFrame(pid, [340, 72, 520, 320]);
`.trim(),
  },

  "styled-story": {
    title: "A styled story",
    summary: "A multi-paragraph story with a paragraph style applied — for applyStyle/get examples.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
paged.insertTextFrame(pid, [108, 72, 540, 540]);
const sid = JSON.parse(paged.stories())[0].selfId;
paged.insertText(sid, 0, "Heading\\nThe body follows the heading. Each newline starts a new paragraph in the same story.");
const ps = JSON.parse(paged.paragraphStyles());
if (ps.length) {
  // Apply the first paragraph style to the heading line.
  paged.applyStyle(sid, 0, 7, ps[0].selfId);
}
`.trim(),
  },

  "swatches-and-styles": {
    title: "Swatches & styles",
    summary: "The default palette plus a couple of named styles — for color/style reference reads.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
paged.insertFrame(pid, [120, 120, 320, 420]);
`.trim(),
  },

  "image-frame": {
    title: "An image frame",
    summary: "A graphic frame ready for placeImage, selected.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
paged.insertFrame(pid, [120, 96, 420, 480]);
`.trim(),
  },

  "a-table": {
    title: "A small table",
    summary: "A text frame whose story holds a small table — for cell-property examples.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
paged.insertTextFrame(pid, [108, 72, 420, 540]);
const sid = JSON.parse(paged.stories())[0].selfId;
if (typeof paged.insertTable === "function") {
  paged.insertTable(sid, { rows: 3, cols: 3 });
}
`.trim(),
  },
};

/** Resolve a seed name from the URL to its prelude source (empty if unknown). */
export function seedPrelude(name: string | null | undefined): string {
  if (!name) return "";
  const seed = (SEEDS as Record<string, Seed>)[name];
  return seed ? seed.prelude : "";
}
