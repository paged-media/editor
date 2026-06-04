// Cockpit — the Export Center (Export mode's centre/left surface).
// The kit's readiness table, REAL where the product delivers:
// the Print PDF row drives the live Concept-3 ExportPdfDialog and
// its readiness reads the bytes-backed working-space state. The
// other targets are visible, honestly-disabled seams.

import {
  CockpitBtn,
  CockpitPanelHeader,
  CockpitSection,
  ComingSoon,
  StatusPill,
  notifyExportPdfDialog,
  useDocumentMeta,
} from "@paged-media/shell";
import { Icon } from "@paged-media/shell";

interface TargetRow {
  id: string;
  icon: string;
  title: string;
  note: string;
  real?: boolean;
}

const TARGETS: TargetRow[] = [
  {
    id: "pdf-x4",
    icon: "ui-doc",
    title: "Print PDF (PDF/X-4)",
    note: "Text as text · native CMYK + spot plates · live transparency",
    real: true,
  },
  {
    id: "web",
    icon: "ui-web",
    title: "Web bundle",
    note: "Responsive HTML from the same layout",
  },
  {
    id: "social",
    icon: "ui-social",
    title: "Social crops",
    note: "Per-network image crops",
  },
  {
    id: "package",
    icon: "ui-export",
    title: "Print package",
    note: "Document + links + fonts, zipped",
  },
];

export function ExportCenterPanel() {
  const meta = useDocumentMeta();
  const loaded = meta != null && meta.pageCount > 0;
  const profileReady = meta?.cmykProfileActive ?? false;

  return (
    <div data-export-center style={{ overflowY: "auto", height: "100%" }}>
      <CockpitPanelHeader title="Export Center" />
      <CockpitSection title="Outputs">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {TARGETS.map((t) => (
            <div
              key={t.id}
              data-export-target={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1px solid var(--pg-border)",
                borderRadius: "var(--radius-md)",
                padding: "9px 11px",
                opacity: t.real ? 1 : 0.6,
              }}
            >
              <Icon
                name={t.icon}
                size={17}
                style={{ color: "var(--chrome-icon)", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {t.title}
                </div>
                <div className="pg-ui-xs" style={{ marginTop: 1 }}>
                  {t.note}
                </div>
              </div>
              {t.real ? (
                <>
                  <StatusPill
                    tone={!loaded ? "draft" : profileReady ? "ready" : "warn"}
                    testId="pdf-readiness"
                  >
                    {!loaded
                      ? "No document"
                      : profileReady
                        ? "Ready · X-4"
                        : "PDF 1.7 — no output intent"}
                  </StatusPill>
                  <CockpitBtn
                    sm
                    primary
                    disabled={!loaded}
                    testId="export-center-pdf"
                    onClick={() => notifyExportPdfDialog("open")}
                  >
                    Export…
                  </CockpitBtn>
                </>
              ) : (
                <StatusPill tone="draft">soon</StatusPill>
              )}
            </div>
          ))}
        </div>
      </CockpitSection>
      {!loaded && (
        <ComingSoon icon="ui-export" title="Nothing to export yet">
          Open an IDML document — the Print PDF target exports it with
          text as text, native CMYK and spot plates.
        </ComingSoon>
      )}
    </div>
  );
}
