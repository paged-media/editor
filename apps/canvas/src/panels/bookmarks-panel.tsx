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

// SDK Phase 5 / panel-gallery pass — Bookmarks panel.
//
// Gallery list shape: glyph rows; destinations as mono secondary.
// CRUD + reorder + PDF-bookmark export land with their Operations.

import { ListRows, useCollection } from "@paged-media/shell";
import type { BookmarkSummary } from "@paged-media/client";

export function BookmarksPanel() {
  const items = useCollection<BookmarkSummary>("bookmarks");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-bookmarks-panel="loading"
      >
        Loading bookmarks…
      </div>
    );
  }
  return (
    <div data-bookmarks-panel="ready">
      {items.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground" data-empty-bookmarks>
          No bookmarks in this document.
        </div>
      ) : (
        <div data-bookmark-list>
          <ListRows
            rows={items.map((b) => ({
              key: b.selfId,
              icon: "panel-bookmarks",
              primary: b.name,
              secondary: b.destination ? `→ ${b.destination}` : undefined,
            }))}
          />
        </div>
      )}
    </div>
  );
}
