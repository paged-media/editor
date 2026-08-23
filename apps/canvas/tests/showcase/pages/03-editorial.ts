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

// Pages 3–4 — the editorial spread, and the flagship of the showcase.
//
// WHY A SPREAD AND NOT A PAGE. Every other page here can be satisfied
// by one frame doing one thing. A threaded article cannot: ONE story
// runs through FIVE frames across TWO pages, so the composer has to
// break lines against five different column geometries, carry the
// paragraph state across a page boundary, and put the overflow of
// frame N into frame N+1 in document order. That is the single most
// load-bearing behaviour in a page-layout engine and the one a
// per-frame unit test cannot see at all — a chain is only correct as a
// chain.
//
// WHAT ELSE THE PAGE PROVES. The style cascade resolves three ways over
// the same run of text: `Showcase Body` as the paragraph style over the
// whole story, `Showcase Heading` narrowing to the opening line, and
// `Showcase Emphasis` as a CHARACTER style over one phrase inside a
// body paragraph. Direct beats character beats paragraph, and the
// pullquote — its own frame, its own story, its own style — sits beside
// the flow rather than in it, the way a real magazine page is built.
//
// THE PROSE IS REAL. It is about the engine that is setting it, which
// makes the page a document AND its own documentation; a greeked page
// would prove the same plumbing and tell a reader nothing. It also
// means the line breaker meets ordinary English — long words, em
// dashes, a hyphenated compound — rather than the uniform syllables
// lorem ipsum hands it.

import { expect } from "@playwright/test";

import { CHAR_STYLE, columnBounds, COLUMN, STYLE } from "../names";
import type { PageContext, PageReport } from "../types";

/** The article, one string per paragraph. The first is the headline. */
const ARTICLE: readonly string[] = [
  "How a page is made",

  "Every page in this document was produced the way the engine produces " +
    "any page. An IDML package is parsed into a document model; the model " +
    "resolves into a scene; the scene's text is composed line by line into " +
    "positioned glyph runs; the composed page is flattened into a display " +
    "list; and the display list is rasterised. Five stages, one direction, " +
    "and no state passed sideways between them.",

  "The parser is the part that has to be humble. InDesign's format is two " +
    "decades of accumulated decisions, and a renderer that handles only the " +
    "tidy half of it is a demo rather than a tool. So the parser reads what " +
    "is on the page instead of what it wishes were there: attributes it " +
    "does not model survive a round trip untouched, an unfamiliar DOMVersion " +
    "is not fatal, and every element it cannot interpret is carried through " +
    "to export unchanged. Fidelity is measured, not asserted — the gate " +
    "renders each page and compares it against InDesign's own PDF with a " +
    "colour-difference metric and a structural-similarity score, so a " +
    "regression arrives as a number rather than as an opinion.",

  "Text is where a layout engine earns its keep. Lines are broken by the " +
    "Knuth–Plass algorithm over a whole paragraph rather than greedily, one " +
    "line at a time, which is why justified columns look settled instead of " +
    "blotchy; hyphenation, tracking, kerning and the word- and letter-space " +
    "limits all feed the same badness calculation. What leaves this stage is " +
    "a set of positioned runs, and nothing downstream needs to know how they " +
    "came to be positioned.",

  "Composition flattens that scene into a versioned display list: a few " +
    "dozen command kinds, paths interned once and referred to by index, and " +
    "no pointers back into the model. The list is the contract between the " +
    "half of the engine that decides where things go and the half that draws " +
    "them. Two backends consume it — a WebGPU path that keeps the editor's " +
    "canvas live under a moving cursor, and a CPU rasteriser that exists so " +
    "a machine with no graphics adapter can render the same page and be " +
    "checked against the same reference.",

  "The last stage is the one that keeps the project honest. Everything " +
    "above is a renderer for one interchange format; the plugin platform is " +
    "what makes it an editor. A bundle declares the content types it owns, " +
    "receives a frame and a host handle, and writes its own part into the " +
    "container alongside the core model — a spreadsheet, a vector drawing, " +
    "a raster image, a database query, a word-processor document. On export " +
    "those frames bake down into native page items, so a file opened by " +
    "somebody who has none of the plugins installed still opens, still " +
    "prints, and still looks like itself.",
];

/** The phrase carrying the character style — a claim worth marking. */
const EMPHASIS = "measured, not asserted";

const PULLQUOTE =
  "A file opened by somebody who has none of the plugins installed still " +
  "opens, still prints, and still looks like itself.";

/**
 * Join paragraphs for one `insertText` and report where each one starts
 * in the CONTIGUOUS CHARACTER space that `applyStyle` addresses.
 *
 * The two spaces differ and the difference is not cosmetic: the text
 * handed to `insertText` carries the `\n` separators that MAKE the
 * paragraphs, but the engine consumes each break into the split rather
 * than storing it, so a style offset never advances across one. Getting
 * this backwards shifts every style range by the number of preceding
 * paragraphs — which on this page would be a heading that ends five
 * characters early and an emphasis that starts inside a different word.
 * Lengths count CODE POINTS (the engine's `chars().count()`), not
 * UTF-16 units, so the em dashes in the copy do not skew them.
 */
function poured(paragraphs: readonly string[]): {
  text: string;
  starts: number[];
  length: number;
} {
  const starts: number[] = [];
  let offset = 0;
  for (const p of paragraphs) {
    starts.push(offset);
    offset += [...p].length;
  }
  return { text: paragraphs.join("\n"), starts, length: offset };
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const [leftPage, rightPage] = ctx.pageIds;
  const notes: string[] = [];

  // Three columns on the left page, two on the right; the right page's
  // third column is left to the pullquote, so the flow and the aside
  // never overlap and a hit test at either centre is unambiguous.
  const chain: string[] = [];
  const frameBounds: Array<[string, [number, number, number, number]]> = [
    [leftPage, columnBounds(0)],
    [leftPage, columnBounds(1)],
    [leftPage, columnBounds(2)],
    [rightPage, columnBounds(0)],
    [rightPage, columnBounds(1)],
  ];

  // The FIRST frame's story is the story of the whole chain, and it is
  // resolved immediately — while that frame is the only thing on its
  // page — because `storyOf` answers with the topmost item at the point
  // it probes.
  const first = await doc.textFrame(frameBounds[0][0], frameBounds[0][1]);
  const storyId = await doc.storyOf(frameBounds[0][0], frameBounds[0][1]);
  chain.push(first);
  for (const [pageId, bounds] of frameBounds.slice(1)) {
    chain.push(await doc.textFrame(pageId, bounds));
  }

  // Thread them in document order. `linkFrames` sets frame N's
  // NextTextFrame to N+1; the composer then pours the single story
  // across the chain and the pages, and reports overset only if it runs
  // out of the LAST frame.
  for (let i = 0; i + 1 < chain.length; i += 1) {
    await doc.linkFrames(chain[i], chain[i + 1]);
  }

  // ── the article ─────────────────────────────────────────────────
  const { text, starts, length } = poured(ARTICLE);
  await doc.insertText(storyId, text);

  // Wide apply first, narrow apply second: the heading has to overwrite
  // the body style on the opening paragraph, not the other way round.
  await doc.applyStyle(
    storyId,
    0,
    length,
    await doc.paragraphStyle(STYLE.body),
    "paragraph",
  );
  await doc.applyStyle(
    storyId,
    starts[0],
    starts[1],
    await doc.paragraphStyle(STYLE.heading),
    "paragraph",
  );

  // The character style over one phrase, located in the copy rather
  // than hardcoded — an edit to the paragraph moves the range with it
  // instead of quietly restyling the wrong words.
  const emphasisPara = ARTICLE.findIndex((p) => p.includes(EMPHASIS));
  if (emphasisPara < 0) {
    notes.push(
      `the emphasis phrase ${JSON.stringify(EMPHASIS)} is no longer in the ` +
        "article copy, so no character style was applied",
    );
  } else {
    const within = [
      ...ARTICLE[emphasisPara].slice(
        0,
        ARTICLE[emphasisPara].indexOf(EMPHASIS),
      ),
    ].length;
    const emphasisStart = starts[emphasisPara] + within;
    await doc.applyStyle(
      storyId,
      emphasisStart,
      emphasisStart + [...EMPHASIS].length,
      await doc.characterStyle(CHAR_STYLE.emphasis),
      "character",
    );
  }

  // ── the pullquote ───────────────────────────────────────────────
  // Its own frame and its own story: a pullquote is an aside, not a
  // fragment of the flow, and threading it in would make the article
  // read it twice.
  const quoteBounds = columnBounds(2, {
    top: COLUMN.live[0] + 120,
    bottom: COLUMN.live[0] + 420,
  });
  const quoteFrame = await doc.textFrame(rightPage, quoteBounds);
  const quoteStory = await doc.storyOf(rightPage, quoteBounds);
  await doc.insertText(quoteStory, PULLQUOTE);
  await doc.applyStyle(
    quoteStory,
    0,
    [...PULLQUOTE].length,
    await doc.paragraphStyle(STYLE.pullquote),
    "paragraph",
  );

  // ── the oracle ──────────────────────────────────────────────────
  // `characterCount` sums the text of every run in every paragraph, so
  // it is expressed in the same contiguous space the style ranges use.
  // An exact match is the assertion that the whole pour landed — a
  // short count means text was dropped, a long one means a separator
  // was stored as a character.
  expect(
    await doc.storyChars(storyId),
    "the threaded article holds exactly the poured text",
  ).toBe(length);
  expect(
    await doc.storyChars(quoteStory),
    "the pullquote holds exactly its text",
  ).toBe([...PULLQUOTE].length);

  // Did the thread actually thread? `linkFrames` used to set the
  // source's forward pointer and leave the TARGET on its own empty
  // story, so the chain existed in the model and the composer never
  // reached past frame one — an engine that applied the op, changed
  // the model and moved no pixels. Fixed at protocol 62, but the
  // editor pins the PUBLISHED engine, so ask rather than assume.
  //
  // The oracle is the story each frame carries, not the frame-chain
  // read: `client.frameChain` answers a narrower question than its
  // name suggests (it reported 1 for a chain that had genuinely
  // joined), and an assertion is only as good as the thing it looks
  // at. Sharing one story IS the fix, and it is what core's own
  // `linking_frames_puts_the_target_on_the_source_story` asserts.
  const joined = await Promise.all(
    frameBounds.map(async ([pid, bounds]) => {
      try {
        return await doc.storyOf(pid, bounds);
      } catch {
        return null;
      }
    }),
  );
  const onStory = joined.filter((s) => s === storyId).length;
  const threaded = onStory === chain.length;
  if (!threaded) {
    notes.push(
      `${onStory} of ${chain.length} frames carry the article's story — this ` +
        "engine's linkFrames sets the forward pointer without moving the " +
        "target onto the source's story, so the article stops at the first " +
        "column. Fixed at protocol 62; the editor pins the published engine " +
        "until 0.62.x is on npm (~/paged/sync-wasm.sh builds it locally).",
    );
  }

  return {
    title: "How a page is made",
    covers: [
      ...(threaded ? ["layout-model.text-frame-chain"] : []),
      "layout-model.spreads-pages",
      "stories-text.story-model",
      "stories-text.text.insert",
      "stories-text.style-apply-range",
      "styles.cascade",
      "typography.knuth-plass",
      "the-renderer.pipeline",
    ],
    elements: [...chain, quoteFrame],
    notes: notes.length > 0 ? notes : undefined,
  };
}
