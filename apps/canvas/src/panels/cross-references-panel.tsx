// SDK Phase 5 / panel-gallery pass — Cross References panel.
//
// Gallery list shape: source name + mono format secondary. CRUD +
// live update on reflow land with their Operations.

import { ListRows, useCollection } from "@paged-media/shell";
import type { CrossReferenceSummary } from "@paged-media/client";

export function CrossReferencesPanel() {
  const items = useCollection<CrossReferenceSummary>("crossReferences");
  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-cross-references-panel="loading"
      >
        Loading cross-references…
      </div>
    );
  }
  return (
    <div data-cross-references-panel="ready">
      {items.length === 0 ? (
        <div
          className="p-3 text-xs text-muted-foreground"
          data-empty-cross-references
        >
          No cross-references in this document.
        </div>
      ) : (
        <div data-cross-reference-list>
          <ListRows
            rows={items.map((x) => ({
              key: x.selfId,
              icon: "panel-cross-references",
              primary: x.name,
              secondary: x.format ?? undefined,
            }))}
          />
        </div>
      )}
    </div>
  );
}
