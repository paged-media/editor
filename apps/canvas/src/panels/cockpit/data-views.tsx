// Cockpit — Data-layout mode's surfaces (kit: left Data Source nav,
// canvas-area generated grid). Both are honest seams until the
// data-publishing engine lands; the existing DataMappingPanel
// (stub-panels.tsx) stays the right inspector.

import {
  CockpitPanelHeader,
  CockpitSection,
  ComingSoon,
  StatusPill,
  type PanelProps,
} from "@paged-media/shell";

/** Data mode — LEFT panel: source + records + fields (kit
 *  DataSourcePanel). */
export function DataSourcePanel(_props: PanelProps) {
  return (
    <div
      data-data-source-panel
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "var(--font-sans)",
      }}
    >
      <CockpitPanelHeader title="Data Source" />
      <CockpitSection
        title="Source"
        right={<StatusPill tone="draft">not connected</StatusPill>}
      >
        <span className="pg-ui-xs" style={{ lineHeight: 1.45 }}>
          Connect a structured source (PIM, CSV, API). Records and their fields
          list here, ready to map onto layout slots.
        </span>
      </CockpitSection>
      <ComingSoon icon="ui-database" title="Records & fields coming soon">
        The record list and field chips land with the data-publishing engine.
      </ComingSoon>
    </div>
  );
}

/** Data mode — CANVAS main: the generated product-card grid (kit
 *  DataGrid). */
export function DataGridPanel(_props: PanelProps) {
  return (
    <div
      data-data-grid-panel
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        overflowY: "auto",
      }}
    >
      <ComingSoon icon="ui-bolt" title="Generated layout preview coming soon">
        Connect a source and map fields — generated, repeatable pages preview
        here with per-record status.
      </ComingSoon>
    </div>
  );
}
