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

// Ch.7 opener — p45, C-Opener recto. Navigation as a first-class
// document structure, with the fixture's exhibit frame (x 48..384,
// y 104..286) carrying the born-navigable story: a URL hyperlink
// source, the cross-reference source that resolves overleaf, and two
// index markers. This module authors around it: the chapter opener
// below the exhibit, a caption in the narrow outer column, and — the
// live part — two insertHyperlink calls (protocol 53) on prose of its
// own, followed by a hyperlinks/bookmarks inventory read from the
// live collections and printed as text.
//
// The one honest edge, learned from the d.ts and the apply layer
// rather than assumed: `insertHyperlink { storyId, start, end, url }`
// mints a URL destination, always. The fixture's page and text-anchor
// destinations (DestinationPage / DestinationText) have no create op,
// so the "page-flavoured" link below is a page:// URL by naming
// convention only. The margin note prints that boundary.
//
// Offsets: insertHyperlink walks the same CONTIGUOUS character space
// as applyStyle (paragraph separators not counted) — the annual's
// three-offset-spaces lesson applies here too.

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { BOOKMARKS, CHAR, STYLE, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

interface HyperlinkRow {
  selfId: string;
  name?: string;
  source?: string;
  destination?: string;
}

interface BookmarkRow {
  selfId: string;
  name?: string;
  destination?: string;
}

const REGISTRY_URL = "https://paged.media";
const PAGE_URL = "page://annual/13";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(45);
  const [left, , right] = contentBox(page);

  const readLinks = async (): Promise<HyperlinkRow[]> =>
    (await doc.designer.collection("hyperlinks")) as unknown as HyperlinkRow[];
  const readBookmarks = async (): Promise<BookmarkRow[]> =>
    (await doc.designer.collection("bookmarks")) as unknown as BookmarkRow[];

  const linksBefore = await readLinks();

  // ── caption for the fixture exhibit — full width, directly below
  //    it. (A narrow outer-column caption was the first draft; live-
  //    inserted text frames under ~140 pt compose at a fraction of
  //    their width — see this chapter's notes — so captions here stay
  //    wide.) ─────────────────────────────────────────────────────────
  const caption = await proseFrame(ctx, page, [left, 292, right, 320], [
    {
      text:
        "Exhibit, fixture-authored: this story was born navigable - a " +
        "hyperlink text source on paged.media, the cross-reference " +
        "source that resolves overleaf, and two index markers filed " +
        "under Typography and Baskerville.",
      style: STYLE.caption,
    },
  ]);
  elements.push(caption.frameId);

  // ── the chapter opener, beneath the exhibit. Number and title sit
  //    side by side so the deck and the live demonstration both fit
  //    above the apparatus band. ──────────────────────────────────────
  const number = await proseFrame(ctx, page, [left, 326, 150, 404], [
    { text: "7", style: STYLE.chapterNumber },
  ]);
  elements.push(number.frameId);
  const title = await proseFrame(ctx, page, [160, 330, right, 400], [
    { text: "The Apparatus", style: STYLE.chapterTitle },
  ]);
  elements.push(title.frameId);
  const deck = await proseFrame(ctx, page, [left, 414, right, 500], [
    {
      text:
        "A book is not only its pages; it is the machinery a reader " +
        "moves by. Links, bookmarks, references and index marks - shown " +
        "live where a door exists, named honestly where none does.",
      style: STYLE.deck,
    },
  ]);
  elements.push(deck.frameId);

  // ── the live demonstration: two links authored in front of you ───
  const paraA =
    "The exhibit above was born linked; the two spans below were not. " +
    "Each became a link while this page was set, one insertHyperlink " +
    "call apiece.";
  const paraB =
    "Consult the living registry for the current capability record.";
  const paraC =
    "Or turn to the first chapter opener and compare this furniture " +
    "with its plainer ancestors.";
  const linkTextB = "the living registry";
  const linkTextC = "the first chapter opener";

  const demo = await proseFrame(ctx, page, [left, 506, right, 572], [
    { text: paraA, style: STYLE.bodyFirst },
    { text: paraB, style: STYLE.body },
    { text: paraC, style: STYLE.body },
  ]);
  elements.push(demo.frameId);

  // Contiguous char offsets (applyStyle's space — separators uncounted).
  const startB = paraA.length + paraB.indexOf(linkTextB);
  const startC = paraA.length + paraB.length + paraC.indexOf(linkTextC);
  await doc.mutate("insertHyperlink", {
    storyId: demo.storyId,
    start: startB,
    end: startB + linkTextB.length,
    url: REGISTRY_URL,
  });
  await doc.mutate("insertHyperlink", {
    storyId: demo.storyId,
    start: startC,
    end: startC + linkTextC.length,
    url: PAGE_URL,
  });
  // Dress both spans in the fixture's URL character style so the links
  // read as links on paper too.
  const urlStyle = await doc.characterStyle(CHAR.url);
  for (const [start, len] of [
    [startB, linkTextB.length],
    [startC, linkTextC.length],
  ] as const) {
    await doc.applyStyle(demo.storyId, start, start + len, urlStyle, "character");
  }

  // ── read the collections back and print the inventory ────────────
  const linksAfter = await readLinks();
  const born = linksAfter.filter(
    (a) => !linksBefore.some((b) => b.selfId === a.selfId),
  );
  if (born.length !== 2) {
    throw new Error(
      `insertHyperlink x2 should have grown the hyperlinks collection by ` +
        `2 (${linksBefore.length} -> ${linksAfter.length}, ${born.length} new)`,
    );
  }
  // Engine finding, verified rather than smoothed over: the wire mints
  // hyperlink ids from the PAGE-ITEM max-id scan, and a hyperlink adds
  // no page item — so two successive inserts mint IDENTICAL
  // source/dest/hyperlink ids. Both links resolve and render, but the
  // designmap now carries two resources under one self id.
  const collided = born[0].selfId === born[1].selfId;
  if (collided) {
    notes.push(
      `ENGINE FINDING: both live insertHyperlink calls minted the same ` +
        `id (${born[0].selfId}) — the wire's mint scans page items only ` +
        `and a hyperlink adds none, so successive inserts collide`,
    );
  }
  const bookmarks = await readBookmarks();
  for (const name of BOOKMARKS) {
    if (!bookmarks.some((b) => b.name === name)) {
      throw new Error(
        `the bookmarks collection lists no entry named ${JSON.stringify(name)} — ` +
          `have [${bookmarks.map((b) => b.name ?? "?").join(", ")}]`,
      );
    }
  }
  const fixtureNames = linksBefore.map((l) => l.name ?? l.selfId);
  const inventory = await proseFrame(ctx, page, [left, 578, right, 639], [
    {
      text: `Hyperlinks, read live: ${linksAfter.length} — ${fixtureNames.join(
        ", ",
      )}, plus ${born.length} authored on this page moments ago${
        collided
          ? " (which the wire, honestly recorded, minted under a single shared id)"
          : ""
      }.`,
      style: STYLE.bodySmall,
    },
    {
      text: `Bookmarks, read live: ${bookmarks.length} — ${bookmarks
        .map((b) => b.name ?? b.selfId)
        .join(", ")}. No wire op minted these; the fixture did.`,
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(inventory.frameId);

  elements.push(
    await marginNote(
      ctx,
      page,
      "insertHyperlink is the apparatus's one live door and it mints URL " +
        "destinations only — the page-flavoured link above is a page:// " +
        "URL by convention, not a DestinationPage; true page and " +
        "text-anchor destinations exist here only fixture-authored " +
        "→ Appendix A.",
    ),
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 63",
      "insertHyperlink x2 (v53)",
      "hyperlinks / bookmarks read live",
      "C-Opener",
    ]),
  );

  notes.push(
    `hyperlinks ${linksBefore.length} -> ${linksAfter.length} (2 authored ` +
      `live, both URL destinations); bookmarks ${bookmarks.length}, all ` +
      `fixture-authored`,
  );

  return {
    title: "Ch.7 opener — navigation, live where a door exists",
    covers: [
      "cross-references-hyperlinks.hyperlinks",
      "cross-references-hyperlinks.bookmarks",
    ],
    elements,
    notes,
  };
}
