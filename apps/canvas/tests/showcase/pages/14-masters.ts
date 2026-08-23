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

// Page 14 — masters and sections.
//
// Two mechanisms that only make sense in a document long enough to
// need them, which is why the single-concern fixtures cannot really
// show them and a sixteen-page report can.
//
// A MASTER stamps furniture onto every page that applies it, and a
// local OVERRIDE lets one page disagree without detaching from the
// master. A SECTION restarts or re-prefixes page numbering partway
// through, so the page-number markers the master carries resolve
// differently on either side of the boundary. Both are authored here
// over the wire — `applyMasterToPage` and `insertSection` — against
// the two masters the base fixture declares.

import type { PageContext, PageReport } from "../types";
import { STYLE } from "../names";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pageId = ctx.pageIds[0];
  const elements: string[] = [];
  const notes: string[] = [];

  const headBounds: [number, number, number, number] = [72, 72, 108, 540];
  const head = await doc.textFrame(pageId, headBounds);
  const headStory = await doc.storyOf(pageId, headBounds);
  await doc.insertText(headStory, "Masters and sections");
  await doc.applyStyle(
    headStory,
    0,
    "Masters and sections".length,
    await doc.paragraphStyle(STYLE.heading),
    "paragraph",
  );
  elements.push(head);

  // Re-apply this page's master explicitly. It is already applied by
  // the fixture, so this is not what puts the furniture on the page —
  // it is the op being exercised, and re-applying is the honest way to
  // exercise it without leaving the page looking different from its
  // neighbours.
  const masters = (await doc.designer.collection("masterPages")) as Array<{
    selfId: string;
    name?: string;
  }>;
  if (masters.length > 0) {
    await doc.mutate("applyMasterToPage", {
      page: pageId,
      master: masters[0].selfId,
    });
  } else {
    notes.push(
      "document declares no master spreads — applyMasterToPage skipped",
    );
  }

  // A section starting at this page: numbering restarts at 1 with a
  // prefix, so the master's page-number marker resolves to "B-1" here
  // and the pages before it keep their original numbering. That split
  // is the visible proof a section did anything.
  let sectioned = false;
  try {
    await doc.mutate("insertSection", {
      atPage: pageId,
      prefix: "B-",
      startAt: 1,
    });
    sectioned = true;
  } catch (err) {
    notes.push(
      `insertSection refused: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const bodyBounds: [number, number, number, number] = [130, 72, 430, 540];
  const body = await doc.textFrame(pageId, bodyBounds);
  const bodyStory = await doc.storyOf(pageId, bodyBounds);
  const prose =
    "A master spread stamps running heads, folios and rules onto every " +
    "page that applies it, and a page can override one stamped item " +
    "locally without detaching from the master — the override suppresses " +
    "just that item, and everything else keeps tracking the master. " +
    (sectioned
      ? "This page also opens a section: numbering restarts at 1 with the " +
        "prefix B-, so the folio the master carries resolves differently " +
        "here than on the page before it. The marker is not text the page " +
        "stores; it is resolved at composition time against the section " +
        "that contains it."
      : "The section this page meant to open was refused, so the folio " +
        "still resolves against the document's original numbering.");
  await doc.insertText(bodyStory, prose);
  await doc.applyStyle(
    bodyStory,
    0,
    prose.length,
    await doc.paragraphStyle(STYLE.body),
    "paragraph",
  );
  elements.push(body);

  const covers = ["master-spreads-overrides.master-stamping"];
  if (masters.length > 0)
    covers.push("master-spreads-overrides.apply-master-op");
  if (sectioned) {
    covers.push(
      "sections-numbering-variables.sections",
      "sections-numbering-variables.section-ops",
      "sections-numbering-variables.page-number-resolution",
    );
  }

  return { title: "Masters and sections", covers, elements, notes };
}
