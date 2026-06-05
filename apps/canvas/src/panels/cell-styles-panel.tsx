// SDK Phase 5 / panel-gallery pass — Cell Styles panel.
//
// Readonly ApplyList variant: lists every cell style; the
// apply-an-entity path (AppliedCellStyle) is wire-shape only —
// the apply layer raises UnsupportedProperty until the Table
// NodeId surface lands (engine gap 8), so the list renders
// without an apply affordance plus the honest footer note.

import { ApplyList, useCollection } from "@paged-media/shell";
import type { CellStyleSummary } from "@paged-media/client";

export function CellStylesPanel() {
  const items = useCollection<CellStyleSummary>("cellStyles");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-cell-styles-panel="loading"
      >
        Loading cell styles…
      </div>
    );
  }
  return (
    <div data-cell-styles-panel="ready">
      {items.length === 0 ? (
        <div
          className="p-3 text-xs text-muted-foreground"
          data-empty-cell-styles
        >
          No cell styles.
        </div>
      ) : (
        <ApplyList
          appliedId=""
          groups={[
            {
              items: items.map((s) => ({ selfId: s.selfId, name: s.name })),
            },
          ]}
          itemIcon="panel-cell-styles"
          collection="cellStyles"
          readonly
          readonlyNote="Apply available once table selection lands."
          testId="cell-styles"
        />
      )}
    </div>
  );
}
