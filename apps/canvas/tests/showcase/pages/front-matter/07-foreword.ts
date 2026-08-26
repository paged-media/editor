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

// The foreword — the control specimen. One measure, one style family,
// no apparatus beyond a single label: the page every other page is
// measured against. Character styles appear exactly twice, so the
// cascade is visible without decoration.

import { proseFrame, specLabel } from "../../annual-support";
import { CHAR, STYLE, contentBox, p } from "../../names-annual";
import type { PageContext, PageReport } from "../../types";

export async function build(ctx: PageContext): Promise<PageReport> {
  const box = contentBox(p(8));
  const t1 =
    "Foreword";
  const t2 =
    "A capability that cannot be demonstrated in a document is a claim, not a capability. This volume exists to close that distance: every op the wire declares, every property the catalog names, every plugin the platform carries, shown in a page a reader can hold.";
  const t3 =
    "The pages that follow are not screenshots and not mockups. They were authored over the same mutation channel the editor's own panels use, against the same engine that renders them, and saved into the same container this file is. Where a limit exists, it is printed. Where a lane is partial, the margin says so.";
  const t4 = "What survives here is what the system can actually do.";

  const prose = await proseFrame(ctx, p(8), [box[0] + 60, box[1] + 60, box[2] - 60, box[3] - 60], [
    { text: t1, style: STYLE.head1 },
    {
      text: t2,
      style: STYLE.bodyFirst,
      charRanges: [{ start: 2, end: 12, style: CHAR.emphasis }],
    },
    { text: t3, style: STYLE.body },
    {
      text: t4,
      style: STYLE.body,
      charRanges: [{ start: 0, end: t4.length, style: CHAR.strong }],
    },
  ]);

  const label = await specLabel(ctx, p(8), [
    "Specimen No. 5",
    "the control page",
    "Annual Body cascade",
  ]);

  return {
    title: "Foreword",
    covers: ["styles.cascade", "styles.based-on-chain"],
    elements: [prose.frameId, label],
  };
}
