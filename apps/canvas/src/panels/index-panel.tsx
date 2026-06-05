// SDK Phase 5 / panel-gallery pass — Index panel.
//
// Gallery list shape over every `<Topic>` (flattened — nested
// `<Topic>` surfaces as one entry per Self for v1) plus the
// "Generate index" affordance as an honest seam (no generate
// Operation yet).

import { ListRows, useCollection } from "@paged-media/shell";
import type { IndexTopicSummary } from "@paged-media/client";

export function IndexPanel() {
  const items = useCollection<IndexTopicSummary>("indexTopics");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-index-panel="loading"
      >
        Loading index…
      </div>
    );
  }
  return (
    <div data-index-panel="ready">
      {items.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground" data-empty-index>
          No index topics in this document.
        </div>
      ) : (
        <div data-index-topic-list>
          <ListRows
            search={items.length > 8}
            searchPlaceholder="Filter topics"
            rows={items.map((t) => ({
              key: t.selfId,
              icon: "panel-index",
              primary: t.name,
              secondary: t.sortOrder ?? undefined,
            }))}
          />
        </div>
      )}
      <div className="px-3 pb-3">
        <button
          type="button"
          disabled
          data-generate-index
          title="Generate index — awaiting engine support"
          className="w-full text-xs h-[30px] rounded-[7px] border border-dashed text-muted-foreground opacity-55"
          style={{ borderColor: "var(--chrome-divider)" }}
        >
          + Generate index
        </button>
      </div>
    </div>
  );
}
