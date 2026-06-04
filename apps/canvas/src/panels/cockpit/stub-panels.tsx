// Cockpit — the styled-shell panels for product surfaces whose
// backends don't exist yet. Each is the kit's composition with the
// brand's honest empty-state language — a stub is visibly a stub
// (no fake data, no dead interactive chrome).

import {
  CockpitPanelHeader,
  ComingSoon,
  CockpitSection,
  StatusPill,
  useDocumentStats,
} from "@paged-media/shell";

/** Content mode — per-story list. The engine HAS stories (the live
 * count below is real); the per-story summaries need the `stories`
 * collection accessor on the wire (core follow-up). */
export function StoriesPanel() {
  const stats = useDocumentStats();
  return (
    <div data-stories-panel style={{ overflowY: "auto", height: "100%" }}>
      <CockpitPanelHeader
        title="Stories"
        action={
          stats ? (
            <span className="pg-mono-meta">{stats.stories}</span>
          ) : undefined
        }
      />
      <ComingSoon icon="panel-character" title="Story list coming soon">
        {stats
          ? `This document carries ${stats.stories} stories. The per-story
             list (words, overset, approval state) lands with the engine's
             stories collection.`
          : "Open a document — the per-story list lands with the engine's stories collection."}
      </ComingSoon>
    </div>
  );
}

/** Review mode — threaded comments. Needs the collaboration
 * backend. */
export function CommentsPanel() {
  return (
    <div data-comments-panel style={{ overflowY: "auto", height: "100%" }}>
      <CockpitPanelHeader title="Comments" />
      <ComingSoon icon="ui-comment" title="No comments yet">
        Threaded review comments, approvals and version compare land
        with the collaboration backend.
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
          Connect a structured source (PIM, CSV, API) and map its fields
          to layout slots — repeatable data-driven pages.
        </span>
      </CockpitSection>
      <ComingSoon icon="ui-database" title="Field mapping coming soon">
        Field→slot mapping, record filters and generation rules land
        with the data-publishing engine.
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
        Browse, drag and configure reusable components — slots bound to
        data, variants, and usage rules.
      </ComingSoon>
    </div>
  );
}
