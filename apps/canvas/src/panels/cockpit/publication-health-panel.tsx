// Cockpit — Publication health (Design mode's left footer in the
// kit; a standalone panel here). REAL metrics from documentMeta +
// the worker's live DocumentStats + the links collection; the
// overset / comments tiles are seams until those accessors exist.

import {
  CockpitPanelHeader,
  CockpitSection,
  MetricTile,
  StatusPill,
  useCollection,
  useDocumentMeta,
  useDocumentStats,
} from "@paged-media/shell";
import type { LinkSummary } from "@paged-media/client";

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
      <CockpitSection title="Risks" defaultOpen={false}>
        <span className="pg-ui-xs">
          Overset, missing-font and low-resolution tiles land with the
          engine's preflight accessors — run Prepress ▸ Validate output
          for the exporter's findings today.
        </span>
      </CockpitSection>
    </div>
  );
}
