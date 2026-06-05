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
