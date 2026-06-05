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
