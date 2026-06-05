// SDK Phase 5 / panel-gallery pass — Articles panel.
//
// Gallery list shape over every `<Article>`: order number + name +
// member count. Reorder/visibility stay honest seams until their
// Operations land; the footer states the panel's role as the
// accessible-PDF reading-order source.

import { ListRows, useCollection } from "@paged-media/shell";
import type { ArticleSummary } from "@paged-media/client";

export function ArticlesPanel() {
  const items = useCollection<ArticleSummary>("articles");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-articles-panel="loading"
      >
        Loading articles…
      </div>
    );
  }
  return (
    <div data-articles-panel="ready">
      {items.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground" data-empty-articles>
          No articles in this document.
        </div>
      ) : (
        <div data-article-list>
          <ListRows
            rows={items.map((a, i) => ({
              key: a.selfId,
              icon: "ui-dots",
              primary: a.name,
              secondary: `${i + 1} · ${a.members.length} member${
                a.members.length === 1 ? "" : "s"
              }`,
            }))}
          />
        </div>
      )}
      <div className="px-3 pb-3 text-[10.5px] italic text-muted-foreground">
        Order drives accessible-PDF reading order.
      </div>
    </div>
  );
}
