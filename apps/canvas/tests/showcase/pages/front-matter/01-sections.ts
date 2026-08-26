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

// Sections — the FIRST module of the whole build, because a section
// edit re-bakes every derived page label: the fixture leaves pages
// unnamed-descriptive, and these three inserts turn the folios into
// the book's real numbering (front matter i–x, body 1–116, appendix
// A·1–A·8). A scratch section exercises the full op triple without
// disturbing the plan.

import { p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const pages = await doc.pages();

  await doc.mutate("insertSection", {
    atPage: pages[p(1)].selfId,
    numberingStyle: "LowerRoman",
    startAt: 1,
  });
  await doc.mutate("insertSection", {
    atPage: pages[p(11)].selfId,
    numberingStyle: "Arabic",
    startAt: 1,
  });
  await doc.mutate("insertSection", {
    atPage: pages[p(127)].selfId,
    numberingStyle: "Arabic",
    prefix: "A·",
    startAt: 1,
  });

  // The scratch triple: insert → edit → delete, restoring the plan.
  // insertSection surfaces no createdId on the wire, so the minted
  // section is re-discovered through the sections COLLECTION by its
  // start page — the same ask-don't-assume discipline the plugin
  // modules use for their output.
  await doc.mutate("insertSection", {
    atPage: pages[p(5)].selfId,
    numberingStyle: "UpperRoman",
    startAt: 5,
  });
  const sections = (await doc.designer.collection("sections")) as Array<{
    selfId: string;
    startPageIndex?: number | null;
  }>;
  const scratchId = sections.find(
    (s) => s.startPageIndex === p(5),
  )?.selfId;
  if (!scratchId) {
    throw new Error(
      "the scratch section did not appear in the sections collection",
    );
  }
  await doc.mutate("editSection", {
    sectionId: scratchId,
    prefix: "x·",
  });
  await doc.mutate("deleteSection", { sectionId: scratchId });

  return {
    title: "Sections — the folios become real",
    covers: [
      "sections-numbering-variables.sections",
      "sections-numbering-variables.section-ops",
      "sections-numbering-variables.page-number-resolution",
    ],
    // No page item is created: the pixel evidence is the folio on the
    // title page re-baking from the descriptive fixture label to "iii".
    elements: [],
  };
}
