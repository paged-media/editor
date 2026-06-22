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

// SDK Phase 5 / panel-gallery pass — Hyperlinks panel.
//
// Gallery list shape: glyph rows with the destination as the mono
// secondary. CRUD + jump-to land with their Operations.

import { ListRows, useCollection } from "@paged-media/shell";
import type { HyperlinkSummary } from "@paged-media/client";

export function HyperlinksPanel() {
  const items = useCollection<HyperlinkSummary>("hyperlinks");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-hyperlinks-panel="loading"
      >
        Loading hyperlinks…
      </div>
    );
  }
  return (
    <div data-hyperlinks-panel="ready">
      {items.length === 0 ? (
        <div
          className="p-3 text-xs text-muted-foreground"
          data-empty-hyperlinks
        >
          No hyperlinks in this document.
        </div>
      ) : (
        <div data-hyperlink-list>
          <ListRows
            rows={items.map((h) => ({
              key: h.selfId,
              icon: "panel-hyperlinks",
              primary: h.name,
              secondary: h.destination
                ? `→ ${
                    h.destination.length > 40
                      ? `${h.destination.slice(0, 40)}…`
                      : h.destination
                  }`
                : undefined,
              searchText: `${h.name} ${h.destination ?? ""}`,
            }))}
          />
        </div>
      )}
    </div>
  );
}
