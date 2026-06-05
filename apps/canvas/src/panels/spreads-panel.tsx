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
