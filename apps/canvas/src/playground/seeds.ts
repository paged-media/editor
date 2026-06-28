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
  | "a-table"
  // Rich DTP starter documents — realistic prefilled layouts so a snippet's
  // change lands on real content, plus a furniture page for "create" snippets.
  | "flyer"
  | "article-spread"
  | "report-page"
  | "catalog"
  | "starter-page";

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
    summary: "A text frame and a filled graphic frame (selected) — for grouping, threading, and z-order examples.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
paged.insertTextFrame(pid, [72, 72, 300, 320]);
const box = paged.insertFrame(pid, [340, 72, 520, 320]);
paged.set(box, "frameFillColor", "Color/Black");
paged.set(box, "frameFillTint", 20);
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
    summary: "A row of swatch chips drawn from the default palette — for colour/style reference reads.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
const colors = ["Color/Black", "Color/Red", "Color/Black", "Color/Black"];
const tints = [100, 100, 50, 20];
for (let i = 0; i < colors.length; i++) {
  const left = 72 + i * 120;
  const chip = paged.insertFrame(pid, [120, left, 240, left + 96]);
  paged.set(chip, "frameFillColor", colors[i]);
  paged.set(chip, "frameFillTint", tints[i]);
}
`.trim(),
  },

  "image-frame": {
    title: "An image frame",
    summary: "An empty picture frame (selected) under a header band — ready for placeImage in a real layout.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
const head = paged.insertFrame(pid, [54, 96, 96, 480]);
paged.set(head, "frameFillColor", "Color/Black");
paged.set(head, "frameFillTint", 12);
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

  // ── Rich DTP templates ─────────────────────────────────────────────────────
  // Realistic prefilled layouts so a snippet's change lands on real content.
  // The text-bearing ones use addText() to map each new frame to ITS OWN story
  // (story ids are diffed before/after insert), so multi-frame layouts are safe.

  flyer: {
    title: "Event flyer",
    summary: "A poster page — colour banner, headline, subhead and a picture block; the headline is selected.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
const addText = function (bounds, text) {
  const before = JSON.parse(paged.stories()).map(function (s) { return s.selfId; });
  const ref = paged.insertTextFrame(pid, bounds);
  const after = JSON.parse(paged.stories());
  for (let i = 0; i < after.length; i++) {
    if (before.indexOf(after[i].selfId) === -1) {
      paged.insertText(after[i].selfId, 0, text);
      break;
    }
  }
  return ref;
};
const banner = paged.insertFrame(pid, [54, 54, 150, 558]);
paged.set(banner, "frameFillColor", "Color/Red");
const title = addText([170, 54, 280, 558], "Summer Open House");
addText([288, 54, 344, 558], "Saturday 14 June, 10am to 4pm, Studio 7");
const photo = paged.insertFrame(pid, [360, 54, 720, 558]);
paged.set(photo, "frameFillColor", "Color/Black");
paged.set(photo, "frameFillTint", 18);
paged.setElementSelection([title]);
`.trim(),
  },

  "article-spread": {
    title: "Magazine article",
    summary: "A headline over a two-column story, a tinted pull-quote and a picture block; the body is selected.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
const addText = function (bounds, text) {
  const before = JSON.parse(paged.stories()).map(function (s) { return s.selfId; });
  const ref = paged.insertTextFrame(pid, bounds);
  const after = JSON.parse(paged.stories());
  for (let i = 0; i < after.length; i++) {
    if (before.indexOf(after[i].selfId) === -1) {
      paged.insertText(after[i].selfId, 0, text);
      break;
    }
  }
  return ref;
};
addText([54, 54, 108, 558], "The Long Read");
const body = addText([118, 54, 600, 558], "The body copy runs in two balanced columns beneath the headline, flowing from the left column into the right as one continuous story set at a steady reading size.");
paged.set(body, "textFrameColumnCount", 2);
paged.set(body, "textFrameColumnGutter", 16);
const quote = addText([620, 54, 720, 320], "A pull quote lifts a line out of the story.");
paged.set(quote, "frameFillColor", "Color/Black");
paged.set(quote, "frameFillTint", 10);
const photo = paged.insertFrame(pid, [620, 340, 720, 558]);
paged.set(photo, "frameFillColor", "Color/Black");
paged.set(photo, "frameFillTint", 25);
paged.setElementSelection([body]);
`.trim(),
  },

  "report-page": {
    title: "Business report",
    summary: "A header band, a heading and intro, and a figures table — a single content page.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
const band = paged.insertFrame(pid, [48, 54, 96, 558]);
paged.set(band, "frameFillColor", "Color/Black");
paged.set(band, "frameFillTint", 12);
paged.insertTextFrame(pid, [112, 54, 720, 558]);
const sid = JSON.parse(paged.stories())[0].selfId;
paged.insertText(sid, 0, "Quarterly Report\\nThe summary below introduces this quarter's figures.");
if (typeof paged.insertTable === "function") {
  paged.insertTable(sid, { rows: 4, cols: 3, headerRows: 1 });
}
`.trim(),
  },

  catalog: {
    title: "Product catalog",
    summary: "A 3x2 grid of product tiles — for grouping, selection and layout examples.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
const lefts = [54, 222, 390];
const tops = [96, 372];
for (let r = 0; r < tops.length; r++) {
  for (let c = 0; c < lefts.length; c++) {
    const top = tops[r];
    const left = lefts[c];
    const tile = paged.insertFrame(pid, [top, left, top + 220, left + 144]);
    paged.set(tile, "frameFillColor", "Color/Black");
    paged.set(tile, "frameFillTint", 15 + (r * 3 + c) * 12);
  }
}
`.trim(),
  },

  "starter-page": {
    title: "Starter page",
    summary: "Header and footer furniture with an open middle — visible context for elements a script creates. No stories, so a created frame owns the first story.",
    prelude: `
const pid = JSON.parse(paged.pages())[0].selfId;
const head = paged.insertFrame(pid, [40, 54, 92, 558]);
paged.set(head, "frameFillColor", "Color/Black");
paged.set(head, "frameFillTint", 12);
paged.insertLine(pid, [54, 740], [558, 740]);
const foot = paged.insertFrame(pid, [748, 54, 762, 558]);
paged.set(foot, "frameFillColor", "Color/Black");
paged.set(foot, "frameFillTint", 8);
`.trim(),
  },
};

/** Resolve a seed name from the URL to its prelude source (empty if unknown). */
export function seedPrelude(name: string | null | undefined): string {
  if (!name) return "";
  const seed = (SEEDS as Record<string, Seed>)[name];
  return seed ? seed.prelude : "";
}
