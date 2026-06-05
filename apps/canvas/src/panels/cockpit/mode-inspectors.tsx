// Cockpit — the single RIGHT inspectors for the non-design modes
// (kit right-panels.jsx: StoryInspector, PreflightInspector/Output
// Readiness, ReviewInspector). Kit shape, real data where the wire
// carries it, visible seams elsewhere.

import {
  CockpitPanelHeader,
  CockpitSection,
  ComingSoon,
  Icon,
  StatusPill,
  useDocumentMeta,
  useDocumentStats,
  type PanelProps,
} from "@paged-media/shell";

/** Content mode — story inspector. The live story count is real;
 *  per-story words/risk/approval await the stories collection +
 *  collaboration backend. */
export function StoryInspectorPanel(_props: PanelProps) {
  const stats = useDocumentStats();
  return (
    <div
      data-story-inspector-panel
      style={{ overflowY: "auto", height: "100%" }}
    >
      <CockpitPanelHeader
        title="Story"
        action={
          stats ? (
            <span className="pg-mono-meta">{stats.stories} stories</span>
          ) : undefined
        }
      />
      <ComingSoon icon="panel-paragraph" title="Story status coming soon">
        Words, overset risk, language expansion and approval state land with the
        engine's stories collection and the collaboration backend.
      </ComingSoon>
    </div>
  );
}

/** Prepress mode — output readiness (kit PreflightInspector). The
 *  CMYK working-space check is real; the remaining checklist rows
 *  await the engine's preflight accessors. */
export function OutputReadinessPanel(_props: PanelProps) {
  const meta = useDocumentMeta();
  const loaded = meta != null && meta.pageCount > 0;
  const cmyk = meta?.cmykProfileActive ?? false;

  const seams: string[] = [
    "All fonts embedded",
    "Images ≥ 300 PPI",
    "Links present",
    "Bleed 3 mm",
  ];

  return (
    <div
      data-output-readiness-panel
      style={{ overflowY: "auto", height: "100%" }}
    >
      <CockpitPanelHeader
        title="Output readiness"
        action={
          loaded ? (
            <StatusPill tone={cmyk ? "ready" : "warn"} testId="readiness-x4">
              {cmyk ? "PDF/X-4 ready" : "Not ready"}
            </StatusPill>
          ) : undefined
        }
      />
      <CockpitSection title="PDF/X-4 checklist">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "6px 0",
          }}
        >
          <Icon
            name={cmyk ? "ui-check" : "ui-x"}
            size={14}
            style={{
              color: cmyk ? "var(--status-approved)" : "var(--status-error)",
            }}
          />
          <span style={{ fontSize: 12.5, fontFamily: "var(--font-sans)" }}>
            CMYK working space active
          </span>
        </div>
        {seams.map((label) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "6px 0",
              opacity: 0.55,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--status-draft)",
                marginLeft: 3,
                marginRight: 4,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12.5, fontFamily: "var(--font-sans)" }}>
              {label}
            </span>
            <span className="pg-mono-meta" style={{ marginLeft: "auto" }}>
              soon
            </span>
          </div>
        ))}
      </CockpitSection>
      <CockpitSection title="Colour" defaultOpen={false}>
        <span className="pg-ui-xs" style={{ lineHeight: 1.45 }}>
          Profile, rendering intent and ink limits read from the document's
          colour settings — see the Colour Settings panel.
        </span>
      </CockpitSection>
    </div>
  );
}

/** Review mode — approval inspector. Approvals + version history
 *  await the collaboration backend. */
export function ReviewInspectorPanel(_props: PanelProps) {
  return (
    <div
      data-review-inspector-panel
      style={{ overflowY: "auto", height: "100%" }}
    >
      <CockpitPanelHeader title="Review" />
      <ComingSoon icon="ui-pin" title="Approvals coming soon">
        Approve, request changes and version compare land with the collaboration
        backend.
      </ComingSoon>
    </div>
  );
}
