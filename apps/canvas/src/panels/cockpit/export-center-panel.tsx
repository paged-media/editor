// Cockpit — the Export Center (kit canvas.jsx: Export mode's
// CENTRED work-area readiness table).
//
// W2.6 (Full-Green) — honest-or-live. Every row is one or the other:
//   • LIVE rows run a REAL action through the published client surface
//     — Print PDF opens the ExportPdfDialog; Page images run the inline
//     PNG export (`requestSnapshot`); IDML serialises the package
//     (`exportIdml`). Their readiness pill reads the real document/
//     working-space state.
//   • HONEST rows (web / social / package) are visible, disabled "soon"
//     seams until the multi-format publishing pipeline lands.
// Row selection syncs the Outputs nav (left) and the Export inspector
// (right) through the shared selected-target store.

import { useState } from "react";

import {
  CockpitBtn,
  Icon,
  StatusPill,
  notifyExportPdfDialog,
  useCanvasClient,
  useDocument,
  useDocumentMeta,
} from "@paged-media/shell";

import {
  EXPORT_TARGETS,
  exportTargetById,
  runIdmlExport,
  runImageExport,
  setSelectedExportTarget,
  useImageSettings,
  useSelectedExportTarget,
  type ExportTarget,
  type ExportTargetId,
} from "./export-targets";

function rowReadiness(
  t: ExportTarget,
  loaded: boolean,
  profileReady: boolean,
): { tone: "ready" | "warn" | "draft"; label: string } {
  if (!t.live) return { tone: "draft", label: "soon" };
  if (!loaded) return { tone: "draft", label: "No document" };
  if (t.id === "pdf-x4" && !profileReady) {
    return { tone: "warn", label: "PDF 1.7 — no output intent" };
  }
  return { tone: "ready", label: t.id === "pdf-x4" ? "Ready · X-4" : "Ready" };
}

export function ExportCenterPanel() {
  const client = useCanvasClient();
  const meta = useDocumentMeta();
  const { handle } = useDocument();
  const loaded = meta != null && meta.pageCount > 0;
  const profileReady = meta?.cmykProfileActive ?? false;
  const selected = useSelectedExportTarget();
  const image = useImageSettings();
  const [busy, setBusy] = useState<ExportTargetId | null>(null);

  const liveCount = EXPORT_TARGETS.filter((t) => t.live).length;

  // Run the selected (or a given) LIVE target's real action.
  const runTarget = async (id: ExportTargetId) => {
    const t = exportTargetById(id);
    if (!t.live || !loaded || !handle) return;
    if (t.action === "dialog") {
      notifyExportPdfDialog("open");
      return;
    }
    setBusy(id);
    try {
      if (t.action === "image") {
        await runImageExport(client, {
          pageIds: handle.pageIds,
          pageSizesPt: handle.pageSizesPt,
          settings: image,
          baseName: meta?.documentName,
        });
      } else if (t.action === "idml") {
        await runIdmlExport(client, meta?.documentName);
      }
    } catch {
      /* surfaced in the inspector; the center row just clears busy */
    } finally {
      setBusy(null);
    }
  };

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
      <div style={{ width: "min(680px, 92%)", fontFamily: "var(--font-sans)" }}>
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
            {loaded ? `${liveCount} outputs available` : "no document"}
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
            const r = rowReadiness(t, loaded, profileReady);
            const running = busy === t.id;
            return (
              <div
                key={t.id}
                data-export-target={t.id}
                data-export-live={t.live ? "" : undefined}
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
                  opacity: t.live ? 1 : 0.6,
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
                {t.live ? (
                  <>
                    <StatusPill tone={r.tone} testId={`readiness-${t.id}`}>
                      {r.label}
                    </StatusPill>
                    <CockpitBtn
                      sm
                      primary
                      disabled={!loaded || running}
                      testId={`export-center-${t.id}`}
                      onClick={() => void runTarget(t.id)}
                    >
                      {running ? "Working…" : "Export…"}
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
            disabled={!loaded || busy != null || !exportTargetById(selected).live}
            testId="export-selected"
            onClick={() => void runTarget(selected)}
          >
            <Icon name="ui-export" size={15} /> Export selected
          </CockpitBtn>
        </div>
      </div>
    </div>
  );
}
