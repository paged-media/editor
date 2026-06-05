// SDK Phase 5 / panel-gallery pass — Table Styles panel.
//
// Readonly ApplyList companion to Cell Styles with the same
// wire-shape-only caveat for the apply path (AppliedTableStyle
// is reserved until the Table NodeId surface lands — gap 8).
// Backs the Table Composer presets when tables go live.

import { ApplyList, useCollection } from "@paged-media/shell";
import type { TableStyleSummary } from "@paged-media/client";

export function TableStylesPanel() {
  const items = useCollection<TableStyleSummary>("tableStyles");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-table-styles-panel="loading"
      >
        Loading table styles…
      </div>
    );
  }
  return (
    <div data-table-styles-panel="ready">
      {items.length === 0 ? (
        <div
          className="p-3 text-xs text-muted-foreground"
          data-empty-table-styles
        >
          No table styles.
        </div>
      ) : (
        <ApplyList
          appliedId=""
          groups={[
            {
              items: items.map((s) => ({ selfId: s.selfId, name: s.name })),
            },
          ]}
          itemIcon="panel-table-styles"
          collection="tableStyles"
          readonly
          readonlyNote="Apply available once table selection lands."
          testId="table-styles"
        />
      )}
    </div>
  );
}
