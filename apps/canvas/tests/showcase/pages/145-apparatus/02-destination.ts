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

// The destination side — p46, B-Body verso. The fixture's exhibit here
// (x 60..396, y 104..286) is what the p45 cross-reference RESOLVES TO:
// its story holds the text anchor, a page-flavoured hyperlink source
// pointing back at the first chapter, and a Colophon index marker.
// Around it, this module captions the exhibit, explains the fore-edge
// index-tab system (six tabs across the book feeding ten topics), and
// prints the live indexTopics + crossReferences inventory.
//
// Everything on this page except the caption/prose IS fixture
// apparatus, and that is the finding the margin note keeps: bookmarks,
// cross-references and index markers have no create op on the wire —
// of the whole navigation apparatus only hyperlinks are
// live-authorable (protocol 53).
//
// A second finding, measured here rather than assumed: the wire's
// `crossReferences` collection reads `designmap.cross_references`, a
// model vector NOTHING populates — it answers empty for a document
// that demonstrably carries a cross-reference. The xref actually rides
// the hyperlink machinery (the carrier hyperlink "xref-overleaf" lists
// in the hyperlinks collection), and the source marker survives in the
// document's own IDML export — so this module verifies the xref
// through BOTH of those honest doors and prints the empty collection
// as the boundary it is.

import { readZipText, zipEntries } from "../../../e2e/harness/read-zip";
import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { INDEX_TOPICS, STYLE, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

interface TopicRow {
  selfId: string;
  name?: string;
  sortOrder?: string;
}

interface XrefRow {
  selfId: string;
  name?: string;
  format?: string;
  destination?: string;
}

interface HyperlinkRow {
  selfId: string;
  name?: string;
  source?: string;
  destination?: string;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(46);
  const [left, top, right] = contentBox(page);

  const head = await proseFrame(ctx, page, [left, top, right, top + 32], [
    { text: "The destination and the marks", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  // ── caption for the fixture exhibit — full width below it (narrow
  //    live frames compose at a fraction of their width; see notes) ──
  const caption = await proseFrame(ctx, page, [left, 292, right, 318], [
    {
      text:
        "Exhibit, fixture-authored: the receiving end. This story " +
        "carries the text anchor the p45 cross-reference resolves to, a " +
        "link back to the first chapter, and a Colophon index marker.",
      style: STYLE.caption,
    },
  ]);
  elements.push(caption.frameId);

  // ── the index-tab system, explained where it can be seen ─────────
  const prose = await proseFrame(ctx, page, [left, 324, right, 452], [
    {
      text:
        "An index is apparatus that accumulates. Six slim tabs ride the " +
        "fore-edge of verso pages through this book - a to f, on pages " +
        "20, 34, 48, 66, 78 and 96 - and each tab's story carries one or " +
        "two PageReference markers. A marker files its page under a " +
        "topic; the topic collects pages from wherever its markers " +
        "landed.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        "Ten topics are defined at document level, from Typography to " +
        "Colophon, and the markers scattered here and on the exhibit " +
        "pages feed them. Appendix A resolves the whole apparatus into " +
        "the printed index: topic by topic, with the page lists the " +
        "markers earned.",
      style: STYLE.body,
    },
  ]);
  elements.push(prose.frameId);

  // ── the live inventory ───────────────────────────────────────────
  const topics = (await doc.designer.collection(
    "indexTopics",
  )) as unknown as TopicRow[];
  for (const name of INDEX_TOPICS) {
    if (!topics.some((t) => t.name === name)) {
      throw new Error(
        `indexTopics lists no topic named ${JSON.stringify(name)} — have ` +
          `[${topics.map((t) => t.name ?? "?").join(", ")}]`,
      );
    }
  }
  // The cross-reference, through its three doors: the collection (which
  // answers empty — see the module doc), the carrier hyperlink, and the
  // source marker in the document's own export.
  const xrefs = (await doc.designer.collection(
    "crossReferences",
  )) as unknown as XrefRow[];
  const links = (await doc.designer.collection(
    "hyperlinks",
  )) as unknown as HyperlinkRow[];
  const carrier = links.find((l) => l.source?.startsWith("CrossReferenceSource/"));
  if (!carrier) {
    throw new Error(
      "no hyperlink carries a CrossReferenceSource — the fixture wires " +
        "xref-overleaf through the hyperlink machinery",
    );
  }
  const idml = await doc.exportIdml();
  let sourceMarks = 0;
  for (const entry of zipEntries(idml)) {
    if (!entry.name.startsWith("Stories/")) continue;
    const xml = readZipText(idml, entry.name) ?? "";
    sourceMarks += xml.split("<CrossReferenceSource").length - 1;
  }
  if (sourceMarks === 0) {
    throw new Error(
      "the exported package carries no <CrossReferenceSource> — the p45 " +
        "exhibit's marker did not survive the live document",
    );
  }
  if (xrefs.length > 0) {
    notes.push(
      `SURPRISE: the crossReferences collection now lists ${xrefs.length} ` +
        `entries — the never-populated designmap vector got a writer; the ` +
        `margin note is stale`,
    );
  }

  const inventory = await proseFrame(ctx, page, [left, 460, right, 596], [
    { text: "The apparatus, read live", style: STYLE.head2 },
    {
      text: `Index topics: ${topics.length} — ${topics
        .map((t) => t.name ?? t.selfId)
        .join(", ")}.`,
      style: STYLE.indexEntry,
    },
    {
      text:
        `Cross-references: ${sourceMarks} source marker in the document's ` +
        `own export, carried by the hyperlink ${carrier.name ?? carrier.selfId} ` +
        `(source on the facing page, destination in the exhibit above). The ` +
        `wire's crossReferences collection lists ${xrefs.length}.`,
      style: STYLE.indexEntry,
    },
  ]);
  elements.push(inventory.frameId);

  elements.push(
    await marginNote(
      ctx,
      page,
      "Bookmarks, cross-references and index markers are fixture-authored " +
        "- no wire op creates them; only hyperlinks are live-authorable " +
        "(v53). The crossReferences collection reads a designmap vector " +
        "nothing populates - it answers empty while the xref above " +
        "demonstrably exists. TOC resolution is not demonstrated here " +
        "→ Appendix A.",
    ),
  );

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 64",
      "indexTopics / crossReferences read live",
      "6 fore-edge tabs -> 10 topics",
      "resolved in Appendix A",
    ]),
  );

  notes.push(
    `indexTopics ${topics.length} (collection live); cross-reference ` +
      `verified via export (${sourceMarks} source marker) + carrier ` +
      `hyperlink ${carrier.name ?? carrier.selfId} — the crossReferences ` +
      `collection reads a never-populated designmap vector and lists ` +
      `${xrefs.length}`,
  );

  return {
    title: "The destination side and the index-tab system",
    covers: [
      "cross-references-hyperlinks.cross-references",
      "cross-references-hyperlinks.index",
    ],
    elements,
    notes,
  };
}
