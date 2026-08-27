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

// THE INDEX — p131/p132 (A·5/A·6). The apparatus chapter promised
// this page: six fore-edge tabs and the two apparatus exhibits carry
// PageReference markers, ten topics are defined at document level,
// and "Appendix A resolves the whole apparatus into the printed
// index." Resolution here is DERIVED, not typed: the topics list is
// read live from the indexTopics collection, and the folio list per
// topic comes from parsing the document's OWN IDML export — marker →
// story → frame → page through the spreads' transforms — with folios
// computed by the sections math (body folio = physical − 10).
//
// Set two-column in the fixture's Index Entry / Index Sub pair, with
// the entries' folios behind a dot leader — an index page that looks
// like an index page.

import { expect } from "@playwright/test";

import { assignLayer, marginNote, proseFrame, specLabel } from "../../annual-support";
import { INDEX_TOPICS, LAYER, STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { folioOf, resolveIndexRefs } from "./00-support";

interface TopicRow {
  selfId: string;
  name?: string;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];

  // ── the live topics + the derived references ─────────────────────
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
  const idml = await doc.exportIdml();
  const refs = resolveIndexRefs(idml);
  const byName = new Map(refs.map((r) => [r.name, r]));
  const totalMarkers = refs.reduce((n, r) => n + r.physicals.length, 0);
  notes.push(
    `index resolved from the document's own export: ${refs.length} topics ` +
      `referenced, ${totalMarkers} marker page(s); topics collection lists ` +
      `${topics.length}`,
  );
  expect(
    totalMarkers,
    "the fixture's index markers resolved to pages through the export",
  ).toBeGreaterThan(0);

  // ── A·5: the index proper, two columns ───────────────────────────
  const head = await proseFrame(ctx, p(131), [48, 54, 480, 88], [
    { text: "Appendix A — The Index", style: STYLE.head1 },
  ]);
  elements.push(head.frameId);

  const intro = await proseFrame(ctx, p(131), [48, 96, 480, 178], [
    {
      text:
        "An index is apparatus that accumulated. Six slim tabs rode the fore-edge of verso pages through this book, and with the two apparatus exhibits of Chapter 7 they filed PageReference markers under the ten topics the document declares. Here the filing resolves: topic by topic, with the folios the markers earned.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(intro.frameId);

  // Ten topics, alphabetical, split across two columns; each entry is
  // the topic behind a dot leader to its folios, with an Index Sub
  // line naming the carrier stories.
  const names = [...INDEX_TOPICS].sort((a, b) => a.localeCompare(b));
  const half = Math.ceil(names.length / 2);
  const columns: Array<{ box: [number, number, number, number]; names: string[] }> = [
    { box: [48, 196, 258, 600], names: names.slice(0, half) },
    { box: [270, 196, 480, 600], names: names.slice(half) },
  ];
  for (const col of columns) {
    const paras: Array<{ text: string; style: string }> = [];
    for (const name of col.names) {
      const r = byName.get(name);
      const folios =
        r && r.physicals.length > 0
          ? r.physicals.map(folioOf).join(", ")
          : "—";
      paras.push({ text: `${name}\t${folios}`, style: STYLE.indexEntry });
      const carriers =
        r && r.physicals.length > 0
          ? r.physicals
              .map((ph) =>
                ph === 45 || ph === 46
                  ? `exhibit, folio ${folioOf(ph)}`
                  : `fore-edge tab, folio ${folioOf(ph)}`,
              )
              .join(" · ")
          : "no marker resolved";
      paras.push({ text: carriers, style: STYLE.indexSub });
    }
    const pageId = ctx.pageIds[ctx.pageIndexes.indexOf(p(131))];
    const frameId = await doc.textFrame(pageId, col.box);
    const storyId = await doc.storyOf(pageId, col.box);
    // One pour, then per-paragraph styling (two alternating styles).
    const bytes = (t: string): number => new TextEncoder().encode(t).length;
    let byteOffset = 0;
    let contiguous = 0;
    for (const [i, para] of paras.entries()) {
      const text = i === paras.length - 1 ? para.text : `${para.text}\n`;
      await doc.insertText(storyId, text, byteOffset);
      await doc.applyStyle(
        storyId,
        contiguous,
        contiguous + para.text.length,
        await doc.paragraphStyle(para.style),
        "paragraph",
      );
      byteOffset += bytes(text);
      contiguous += para.text.length;
    }
    // The dot-leader tab for the folio column, across the whole range.
    await doc.setProperty(
      "storyRange",
      doc.storyRangeId(storyId, 0, contiguous),
      "paragraphTabStops",
      {
        type: "tabStops",
        value: [
          {
            position: col.box[2] - col.box[0],
            alignment: "RightAlign",
            leader: ".",
          },
        ],
      },
    );
    await assignLayer(ctx, "textFrame", frameId, LAYER.content);
    elements.push(frameId);
  }

  elements.push(
    await specLabel(ctx, p(131), [
      "Specimen No. 194",
      "indexTopics live · markers resolved from the export",
      `${refs.length} topics · ${totalMarkers} marker pages`,
    ]),
  );

  // ── A·6: how it resolved, and the honest boundary ────────────────
  const method = await proseFrame(ctx, p(132), [60, 64, 492, 300], [
    { text: "How the index resolved", style: STYLE.head2 },
    {
      text:
        "Nothing opposite was typed from a plan. The topics are the live indexTopics collection; the folio lists come from the document itself — this module exported its own IDML, found every PageReference marker in the stories, walked each marker's story to its text frame and each frame to its page through the spreads' own transforms, and converted physical pages to folios by the sections math the front matter authored (body folio = physical − 10). The tab pages and the Chapter 7 exhibits are simply where the markers turned out to be.",
      style: STYLE.bodyFirst,
    },
    {
      text:
        `The arithmetic, printed so it can be checked: ${totalMarkers} marker pages across ${refs.length} of the ${topics.length} declared topics, every one carried by a fore-edge tab or an apparatus exhibit. A topic no marker feeds would print an em dash — an index reports its markers, not its wishes.`,
      style: STYLE.body,
    },
  ]);
  elements.push(method.frameId);

  elements.push(
    await marginNote(
      ctx,
      p(132),
      "The index markers are fixture-authored - no wire op mints a " +
        "PageReference, so a live document can read and resolve its index " +
        "apparatus but not grow it. Recorded here, in the ledger it " +
        "belongs to.",
    ),
  );

  return {
    title: "Appendix A — the index, resolved from the document",
    covers: ["cross-references-hyperlinks.index"],
    elements,
    notes,
  };
}
