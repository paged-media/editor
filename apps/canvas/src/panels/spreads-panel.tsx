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

// SDK Phase 5 / panel-gallery pass — Spreads panel.
//
// Gallery list shape over `documentCollection:spreads`. The page-
// membership secondary ("4 pages · 4–7") waits on SpreadSummary
// carrying members (engine gap 7) — today it shows the count.

import { ListRows, useCollection } from "@paged-media/shell";
import type { SpreadSummary } from "@paged-media/client";

export function SpreadsPanel() {
  const items = useCollection<SpreadSummary>("spreads");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-spreads-panel="loading"
      >
        Loading spreads…
      </div>
    );
  }
  return (
    <div data-spreads-panel="ready">
      {items.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground" data-empty-spreads>
          No spreads.
        </div>
      ) : (
        <div data-spread-list>
          <ListRows
            rows={items.map((s) => ({
              key: s.selfId,
              icon: "panel-spreads",
              primary: s.label,
              secondary: `${s.pageCount} page${s.pageCount === 1 ? "" : "s"}`,
            }))}
          />
        </div>
      )}
    </div>
  );
}
