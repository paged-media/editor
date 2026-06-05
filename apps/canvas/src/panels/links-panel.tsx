// SDK Phase 5 / panel-gallery pass — Links panel.
//
// The gallery list shape over `useCollection<LinkSummary>("links")`:
// glyph rows with the filename primary and a mono host line. The
// status dot / missing badge / PPI / colourspace columns and the
// Relink action are engine gaps (LinkSummary carries uri + host
// only — links roadmap items 2–3); the toolbar ships as honest
// disabled seams until relocate/update/break Operations exist.

import {
  ListRows,
  PanelToolbar,
  ToolbarBtn,
  useCollection,
} from "@paged-media/shell";
import type { LinkSummary } from "@paged-media/client";

export function LinksPanel() {
  const links = useCollection<LinkSummary>("links");
  if (links === null) {
    return (
      <div
        className="p-3 text-xs text-muted-foreground"
        data-links-panel="loading"
      >
        Loading links…
      </div>
    );
  }
  return (
    <div data-links-panel="ready">
      <PanelToolbar>
        <ToolbarBtn
          icon="ui-return"
          label="Update link — awaiting engine support"
        />
        <ToolbarBtn
          icon="ui-history"
          label="Relink history — awaiting engine support"
        />
        <ToolbarBtn
          icon="ui-target"
          label="Go to link — awaiting engine support"
        />
      </PanelToolbar>
      {links.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground" data-empty-links>
          No image links in this document.
        </div>
      ) : (
        <div data-link-list>
          <ListRows
            search={links.length > 8}
            searchPlaceholder="Filter links"
            rows={links.map((link) => {
              // The displayed name strips path prefixes for
              // legibility — full URI lives in searchText.
              const filename = link.uri.split("/").pop() ?? link.uri;
              return {
                key: link.hostSelfId,
                icon: "panel-links",
                primary: filename,
                secondary: `${link.hostKind} · ${link.hostSelfId}`,
                searchText: `${filename} ${link.uri}`,
              };
            })}
          />
        </div>
      )}
    </div>
  );
}
