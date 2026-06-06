// Cockpit — the styled-shell panels for product surfaces whose
// backends don't exist yet. Each is the kit's composition with the
// brand's honest empty-state language — a stub is visibly a stub
// (no fake data, no dead interactive chrome).

import {
  CockpitPanelHeader,
  ComingSoon,
  CockpitSection,
  StatusPill,
} from "@paged-media/shell";

// StoriesPanel moved to `./stories-panel` (W2.12 — now a real story
// list off `paged.stories()`).

/** Review mode — threaded comments. Needs the collaboration
 * backend. */
export function CommentsPanel() {
  return (
    <div data-comments-panel style={{ overflowY: "auto", height: "100%" }}>
      <CockpitPanelHeader title="Comments" />
      <ComingSoon icon="ui-comment" title="No comments yet">
        Threaded review comments, approvals and version compare land with the
        collaboration backend.
      </ComingSoon>
    </div>
  );
}

/** Data-layout mode — source connection + field mapping. */
export function DataMappingPanel() {
  return (
    <div data-data-mapping-panel style={{ overflowY: "auto", height: "100%" }}>
      <CockpitPanelHeader title="Data" />
      <CockpitSection
        title="Source"
        right={<StatusPill tone="draft">not connected</StatusPill>}
      >
        <span className="pg-ui-xs">
          Connect a structured source (PIM, CSV, API) and map its fields to
          layout slots — repeatable data-driven pages.
        </span>
      </CockpitSection>
      <ComingSoon icon="ui-database" title="Field mapping coming soon">
        Field→slot mapping, record filters and generation rules land with the
        data-publishing engine.
      </ComingSoon>
    </div>
  );
}

/** Component library — reusable layout components. */
export function ComponentLibraryPanel() {
  return (
    <div
      data-component-library-panel
      style={{ overflowY: "auto", height: "100%" }}
    >
      <CockpitPanelHeader title="Library" />
      <ComingSoon icon="ui-component" title="Component library coming soon">
        Browse, drag and configure reusable components — slots bound to data,
        variants, and usage rules.
      </ComingSoon>
    </div>
  );
}
