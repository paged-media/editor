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

// Overset, honestly (p36): a frame deliberately two sizes too small
// for its story, asserted through the engine's own diagnostic — the
// model holds every character, the render clips, and the stories
// read-out says so. Plus the jump line: pageNumber and nextPageNumber
// fields inserted as live markers.

import { expect } from "@playwright/test";

import { marginNote, plate, specLabel } from "../../annual-support";
import { STYLE, SWATCH, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";
import { pourOne, prose, storySummaries } from "./00-support";

const OVERSET_TEXT =
  "An overset is not a loss; it is a fact about fit, recorded rather than " +
  "hidden. The story you are reading was poured, whole, into a frame two " +
  "sizes too small for it, and the engine did what an honest compositor " +
  "must: it set what fits, clipped the remainder from the render, and " +
  "reported the difference as a diagnostic instead of quietly discarding " +
  "it. Every character of this paragraph is still in the model — the " +
  "container saves it, the exports carry it, and the stories read-out " +
  "counts every one of them — but the page shows only what the frame can " +
  "hold. This is editor state, not page state: give the frame another " +
  "hundred points of depth, or thread it onward to a second stand, and the " +
  "hidden text returns without being retyped, because it never left. The " +
  "red badge a designer sees on an overset frame is this same diagnostic " +
  "wearing its working clothes. Everything below this line that you cannot " +
  "read is the point of the specimen: the count says one thing, the clip " +
  "says less, and the difference is the overset.";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const page = p(36);

  const head = await prose(ctx, page, [60, 104, 492, 130], [
    { text: "Overset, honestly", style: STYLE.head1 },
  ]);
  const intro = await prose(ctx, page, [60, 134, 492, 200], [
    {
      text:
        "The tinted frame below holds more text than it can show. Overset " +
        "text is editor state: retained by the model, saved by the " +
        "container, clipped by the render, and reported by the engine as a " +
        "diagnostic — the assertion under this page reads that diagnostic, " +
        "not the pixels.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // The exhibit: a plate marks the too-small frame's true extent, so
  // the clip boundary is visible against the tint.
  const backing = await plate(ctx, page, [60, 216, 312, 320], SWATCH.vermilionTint);
  const exhibit = await pourOne(
    ctx,
    page,
    [64, 220, 308, 316],
    OVERSET_TEXT,
    STYLE.body,
  );
  elements.push(backing, exhibit.frameId);

  // The oracle: every character is IN the model, and the engine's own
  // story summary flags the overflow. (The flag derives from build
  // diagnostics, so compose the page before reading it.)
  expect(await doc.storyChars(exhibit.storyId)).toBe(OVERSET_TEXT.length);
  await doc.renderPage(page);
  const summary = (await storySummaries(ctx.page)).find(
    (s) => s.selfId === exhibit.storyId,
  );
  expect(summary, "the poured story is missing from paged.stories()").toBeTruthy();
  expect(
    summary?.overset,
    "a frame holding more text than fits must report overset",
  ).toBe(true);

  // ── the jump line: live page-number markers ───────────────────────
  // insertField puts a one-character marker (U+E018/E019) into the
  // run; the composer resolves it per page at build time. These two
  // are NOT setFieldValue targets — that op drives plugin placeholder
  // fields; the page-number markers resolve on their own.
  const t1 = "Continued on page ";
  const t2 = " — said every jump line ever printed; this one is set on page ";
  const t3 = ".";
  const line = await pourOne(
    ctx,
    page,
    [60, 332, 400, 362],
    t1 + t2 + t3,
    STYLE.bodySmall,
  );
  elements.push(line.frameId);
  // Later slot first, so the earlier char offset stays valid.
  await doc.mutate("insertField", {
    storyId: line.storyId,
    offset: t1.length + t2.length,
    field: "pageNumber",
  });
  await doc.mutate("insertField", {
    storyId: line.storyId,
    offset: t1.length,
    field: "nextPageNumber",
  });
  expect(await doc.storyChars(line.storyId)).toBe(
    t1.length + t2.length + t3.length + 2,
  );

  const note = await marginNote(
    ctx,
    page,
    "setFieldValue does not drive these two markers — they resolve at " +
      "compose time; the op exists for plugin placeholder fields. " +
      "→ Appendix A",
  );
  elements.push(note);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 53",
      "stories: overset flag",
      "insertField: pageNumber",
      "insertField: nextPageNumber",
    ]),
  );

  return {
    title: "Overset + page-number fields",
    covers: [
      "stories-text.overset",
      "stories-text.fields.insert",
      "stories-text.page-number-markers",
    ],
    elements,
  };
}
