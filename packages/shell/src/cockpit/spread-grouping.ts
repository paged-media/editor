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

// Cockpit — group page indices into spreads by walking the engine's
// `spreads` collection in document order (SpreadSummary carries
// pageCount but not page membership yet — consumption order stands
// in until the wire exposes it). Shared by the Document Map and the
// thumbnail filmstrip.

import type { PageId, SpreadSummary } from "@paged-media/client";

export interface SpreadEntry {
  key: string;
  /** "Cover" for a 1-page first spread, else the spread label. */
  name: string;
  /** En-dash page range — `2–3`, `1`. */
  range: string;
  pageIndices: number[];
}

/** IDML selfIds (`u196ae7`) make poor display names — fall back to
 *  the page range when the spread label is just its id. */
function isIdLikeLabel(label: string): boolean {
  return /^u[0-9a-f]{3,}$/i.test(label.trim());
}

export function groupSpreads(
  pageIds: ReadonlyArray<PageId>,
  spreads: ReadonlyArray<SpreadSummary> | null,
): SpreadEntry[] {
  const entries: SpreadEntry[] = [];
  let cursor = 0;
  if (spreads && spreads.length > 0) {
    for (const s of spreads) {
      const count = Math.max(1, s.pageCount);
      const pageIndices: number[] = [];
      for (let i = 0; i < count && cursor < pageIds.length; i++) {
        pageIndices.push(cursor++);
      }
      if (pageIndices.length === 0) break;
      const first = pageIndices[0] + 1;
      const last = pageIndices[pageIndices.length - 1] + 1;
      const range = first === last ? String(first) : `${first}–${last}`;
      const labelUsable = s.label && !isIdLikeLabel(s.label);
      entries.push({
        key: s.selfId,
        name:
          entries.length === 0 && pageIndices.length === 1
            ? "Cover"
            : labelUsable
              ? s.label
              : pageIndices.length === 1
                ? `Page ${range}`
                : `Pages ${range}`,
        range,
        pageIndices,
      });
    }
  }
  while (cursor < pageIds.length) {
    const n = cursor + 1;
    entries.push({
      key: `page-${pageIds[cursor]}`,
      name: cursor === 0 ? "Cover" : `Page ${n}`,
      range: String(n),
      pageIndices: [cursor],
    });
    cursor++;
  }
  return entries;
}
