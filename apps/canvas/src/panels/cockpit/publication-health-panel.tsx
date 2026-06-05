// Cockpit — Publication health (Design mode's left footer in the
// kit; a standalone panel here). REAL metrics from documentMeta +
// the worker's live DocumentStats + the links collection; the
// overset / comments tiles are seams until those accessors exist.

import {
  CockpitPanelHeader,
  CockpitSection,
  Icon,
  MetricTile,
  StatusPill,
  useCollection,
  useDocumentMeta,
  useDocumentStats,
} from "@paged-media/shell";
import type { LinkSummary } from "@paged-media/client";

/** The kit's risk rows. Every count is an engine gap today
 *  (overset / link status / PPI / font flags) — the rows ship in
 *  the gallery shape with em-dash counts and inert chevrons, never
 *  invented numbers. */
const RISK_ROWS = [
  { key: "overset", label: "Overset frames" },
  { key: "missing-links", label: "Missing links" },
  { key: "low-res", label: "Low-res images" },
  { key: "fonts", label: "Font warnings" },
];

export function PublicationHealthPanel() {
  const meta = useDocumentMeta();
  const stats = useDocumentStats();
  const links = useCollection<LinkSummary>("links");
  const loaded = meta != null && meta.pageCount > 0;

  return (
    <div data-publication-health style={{ overflowY: "auto", height: "100%" }}>
      <CockpitPanelHeader
        title="Publication health"
        action={
          loaded ? (
            <StatusPill
              tone={meta.cmykProfileActive ? "ready" : "warn"}
              testId="x4-readiness"
            >
              {meta.cmykProfileActive ? "PDF/X-4 ready" : "No output intent"}
            </StatusPill>
          ) : undefined
        }
      />
      <CockpitSection title="Document">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
          }}
        >
          <MetricTile
            label="Pages"
            value={loaded ? String(meta.pageCount) : "—"}
          />
          <MetricTile
            label="Stories"
            value={stats ? String(stats.stories) : "—"}
          />
          <MetricTile
            label="Frames"
            value={stats ? String(stats.frames) : "—"}
          />
          <MetricTile
            label="Glyphs"
            value={stats ? String(stats.glyphs) : "—"}
          />
          <MetricTile
            label="Placed links"
            value={links ? String(links.length) : "—"}
          />
          <MetricTile
            label="Colour mode"
            value={meta?.colorMode ? meta.colorMode.toUpperCase() : "—"}
          />
        </div>
      </CockpitSection>
      <CockpitSection title="Risks">
        <div style={{ display: "flex", flexDirection: "column" }}>
          {RISK_ROWS.map((r) => (
            <div
              key={r.key}
              data-risk-row={r.key}
              data-seam
              title="Risk counts land with the engine's preflight accessors"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                borderBottom: "1px solid var(--pg-border)",
                opacity: 0.55,
              }}
            >
              <span
                className="pg-value"
                style={{ width: 18, textAlign: "right", flexShrink: 0 }}
              >
                —
              </span>
              <span style={{ flex: 1, fontSize: 12.5 }}>{r.label}</span>
              <Icon
                name="ui-chevron-right"
                size={13}
                style={{ color: "var(--pg-muted-fg)", flexShrink: 0 }}
              />
            </div>
          ))}
          <span
            className="pg-ui-xs"
            style={{ paddingTop: 8, lineHeight: 1.45 }}
          >
            Counts land with the engine's preflight accessors — run Prepress ▸
            Validate output for the exporter's findings today.
          </span>
        </div>
      </CockpitSection>
    </div>
  );
}
