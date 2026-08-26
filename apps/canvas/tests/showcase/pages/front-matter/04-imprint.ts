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

// The imprint — and the first conditions demonstration. The ISBN line
// carries Print-only, the URL line Screen-only; activating the
// Working Copy set turns everything on for the working proof, and the
// spec label records both ops. This is the page that proves
// conditional text works by SHOWING both states' machinery, not by
// hiding one.

import { proseFrame, specLabel } from "../../annual-support";
import { CONDITION, CONDITION_SET, STYLE, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];

  const lines = [
    "The Paged Annual, Volume One. Set in Source Serif 4, Fraunces, Space Grotesk, EB Garamond, and JetBrains Mono.",
    "Published by the engine that composed it. First edition, MMXXVI.",
    "ISBN 978-0-000000-00-0 (print edition)",
    "Read this document online at paged.media/annual",
    "Every specimen in this volume was authored over the mutation wire against protocol 62.",
  ];
  const prose = await proseFrame(
    ctx,
    p(4),
    [96, 200, 444, 460],
    lines.map((text) => ({ text, style: STYLE.bodySmall })),
  );
  elements.push(prose.frameId);

  // Tag line 3 Print-only and line 4 Screen-only. Offsets are computed
  // from the poured text (each paragraph ends with one \n).
  // storyRange offsets ride the applyStyle convention: CONTIGUOUS
  // characters, paragraph separators not counted.
  const offsetOf = (idx: number): [number, number] => {
    let start = 0;
    for (let i = 0; i < idx; i += 1) start += lines[i].length;
    return [start, start + lines[idx].length];
  };
  const printOnly = await doc.condition(CONDITION.printOnly);
  const screenOnly = await doc.condition(CONDITION.screenOnly);
  const [isbnStart, isbnEnd] = offsetOf(2);
  await doc.setProperty(
    "storyRange",
    doc.storyRangeId(prose.storyId, isbnStart, isbnEnd),
    "appliedConditions",
    { type: "text", value: printOnly },
  );
  const [urlStart, urlEnd] = offsetOf(3);
  await doc.setProperty(
    "storyRange",
    doc.storyRangeId(prose.storyId, urlStart, urlEnd),
    "appliedConditions",
    { type: "text", value: screenOnly },
  );

  // Both wire ops, on the REAL definitions: hide the print lane, show
  // it again, then activate the working-copy set (everything visible —
  // the state the finished proof ships in).
  await doc.mutate("setConditionVisible", {
    condition: printOnly,
    visible: false,
  });
  await doc.mutate("setConditionVisible", {
    condition: printOnly,
    visible: true,
  });
  await doc.mutate("activateConditionSet", {
    set: await doc.conditionSet(CONDITION_SET.workingCopy),
  });

  elements.push(
    await specLabel(ctx, p(4), [
      "Specimen No. 2",
      "appliedConditions",
      "setConditionVisible",
      "activateConditionSet",
    ]),
  );

  return {
    title: "Imprint — conditional text",
    covers: [
      "conditional-text.applied-conditions",
      "conditional-text.condition-ops",
      "conditional-text.visibility-filtering",
    ],
    elements,
  };
}
