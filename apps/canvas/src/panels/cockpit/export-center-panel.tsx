// Cockpit — the Export Center (kit canvas.jsx: Export mode's
// CENTRED work-area readiness table). REAL where the product
// delivers: the Print PDF row drives the live Concept-3
// ExportPdfDialog and its readiness reads the bytes-backed
// working-space state. The other targets are visible,
// honestly-disabled seams. Row selection syncs the Outputs nav
// (left) and the Export inspector (right) through the shared
// selected-target store.

import {
  CockpitBtn,
  Icon,
  StatusPill,
  notifyExportPdfDialog,
  useDocumentMeta,
} from "@paged-media/shell";

import {
  EXPORT_TARGETS,
  setSelectedExportTarget,
  useSelectedExportTarget,
} from "./export-views";

export function ExportCenterPanel() {
  const meta = useDocumentMeta();
  const loaded = meta != null && meta.pageCount > 0;
  const profileReady = meta?.cmykProfileActive ?? false;
  const selected = useSelectedExportTarget();

  return (
    <div
      data-export-center
      style={{
        height: "100%",
        overflowY: "auto",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          width: "min(680px, 92%)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display-serif)",
              fontSize: 30,
              fontWeight: 680,
              letterSpacing: "-0.02em",
              color: "var(--pg-fg)",
              margin: 0,
              whiteSpace: "nowrap",
            }}
          >
            Export Center
          </h2>
          <span className="pg-ui-xs">
            {loaded ? "1 output available" : "no document"}
          </span>
        </div>
        <p
          className="pg-ui-sm"
          style={{ color: "var(--pg-muted-fg)", margin: "0 0 20px" }}
        >
          Publish every format from one place. Readiness is checked before
          export.
        </p>

        <div
          style={{
            borderRadius: "var(--radius-xl)",
            border: "1px solid var(--pg-border)",
            overflow: "hidden",
            background: "var(--elevated)",
          }}
        >
          {EXPORT_TARGETS.map((t, i) => {
            const sel = selected === t.id;
            return (
              <div
                key={t.id}
                data-export-target={t.id}
                data-selected={sel || undefined}
                onClick={() => setSelectedExportTarget(t.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  padding: "13px 16px",
                  borderTop: i ? "1px solid var(--pg-border)" : "none",
                  cursor: "pointer",
                  background: sel ? "var(--selected-bg)" : "transparent",
                  opacity: t.real ? 1 : 0.6,
                }}
              >
                <Icon
                  name={t.icon}
                  size={19}
                  style={{ color: "var(--pg-muted-fg)", flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>
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
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 18,
            justifyContent: "flex-end",
          }}
        >
          <CockpitBtn disabled testId="export-fix-issues">
            Fix issues first
          </CockpitBtn>
          <CockpitBtn tone="soft" disabled testId="export-save-preset">
            Save preset
          </CockpitBtn>
          <CockpitBtn
            primary
            disabled={!loaded}
            testId="export-selected"
            onClick={() => notifyExportPdfDialog("open")}
          >
            <Icon name="ui-export" size={15} /> Export selected
          </CockpitBtn>
        </div>
      </div>
    </div>
  );
}
