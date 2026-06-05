// SDK Phase 5 / panel-gallery pass — Pages list panel.
//
// Gallery list shape over `documentCollection:pages`, now with the
// LIVE toolbar: New rides `insertPage` (after the selected page or
// the document end) and Delete rides `deletePage` against the
// selected row. Duplicate stays an honest seam (no duplicatePage
// Operation yet); the master column waits on per-page master reads.

import { useState } from "react";

import {
  ListRows,
  PanelToolbar,
  ToolbarBtn,
  useCanvasClient,
  useCollection,
} from "@paged-media/shell";
import type { PageSummary } from "@paged-media/client";

export function PagesListPanel() {
  const client = useCanvasClient();
  const items = useCollection<PageSummary>("pages");
  const [selected, setSelected] = useState<string | null>(null);

  if (items === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-pages-list-panel="loading"
      >
        Loading pages…
      </div>
    );
  }

  const selectedPage = items.find((p) => p.selfId === selected) ?? null;

  const onNew = () => {
    const after = selectedPage ?? items[items.length - 1] ?? null;
    void client
      .mutate({
        op: "insertPage",
        args: { afterPageId: after?.selfId ?? null, masterId: null },
      })
      .catch(() => {});
  };

  const onDelete = selectedPage
    ? () => {
        void client
          .mutate({ op: "deletePage", args: { pageId: selectedPage.selfId } })
          .catch(() => {});
        setSelected(null);
      }
    : undefined;

  return (
    <div data-pages-list-panel="ready">
      <PanelToolbar>
        <ToolbarBtn icon="ui-plus" label="New page" onClick={onNew} />
        <ToolbarBtn
          icon="ui-x"
          label={
            selectedPage ? "Delete page" : "Delete page (select one first)"
          }
          onClick={onDelete}
        />
        <ToolbarBtn
          icon="ui-component"
          label="Duplicate page — awaiting engine support"
        />
      </PanelToolbar>
      {items.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground" data-empty-pages>
          No pages.
        </div>
      ) : (
        <div data-page-list>
          <ListRows
            rows={items.map((p) => ({
              key: p.selfId,
              icon: "panel-pages-list",
              primary: `Page ${p.index}`,
              secondary: `${p.sizePt[0].toFixed(0)} × ${p.sizePt[1].toFixed(0)} pt`,
              selected: p.selfId === selected,
              onClick: () =>
                setSelected((cur) => (cur === p.selfId ? null : p.selfId)),
            }))}
          />
        </div>
      )}
    </div>
  );
}
