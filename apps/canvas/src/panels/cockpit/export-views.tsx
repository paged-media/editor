// Cockpit — Export mode's split surfaces (kit: left Outputs nav +
// right per-target Export inspector; the Export Center table itself
// is the canvas-area main view, export-center-panel.tsx).
//
// W2.6 (Full-Green) — honest-or-live. Three outputs are LIVE through
// the published client surface: Print PDF (the ExportPdfDialog),
// Page images (PNG via `requestSnapshot`, inline DPI/scope settings),
// and the IDML package (`exportIdml`). Web bundle / Social crops /
// Print package are HONEST concept seams (visible, disabled, "soon").
// The shared selected-target store keeps the three panels in sync.

import { useState } from "react";

import {
  CockpitBtn,
  CockpitPanelHeader,
  CockpitSection,
  Icon,
  StatusPill,
  notifyExportPdfDialog,
  useCanvasClient,
  useDocument,
  useDocumentMeta,
  type PanelProps,
} from "@paged-media/shell";

import {
  EXPORT_TARGETS,
  exportTargetById,
  runIdmlExport,
  runImageExport,
  setImageSettings,
  setSelectedExportTarget,
  useImageSettings,
  useSelectedExportTarget,
  type ExportTarget,
} from "./export-targets";

// Re-export the model so existing importers (export-center-panel,
// the specs) keep their import paths.
export {
  EXPORT_TARGETS,
  setSelectedExportTarget,
  useSelectedExportTarget,
  type ExportTarget,
} from "./export-targets";

/** Per-target readiness pill tone + label. PDF gates on the working
 *  space (X-4 output intent); the other LIVE targets are ready the
 *  moment a document is open; HONEST targets read "Coming soon". */
function readiness(
  target: ExportTarget,
  loaded: boolean,
  profileReady: boolean,
): { tone: "ready" | "warn" | "draft"; label: string } {
  if (!target.live) return { tone: "draft", label: "Coming soon" };
  if (!loaded) return { tone: "draft", label: "No document" };
  if (target.id === "pdf-x4" && !profileReady) {
    return { tone: "warn", label: "PDF 1.7 — no output intent" };
  }
  return {
    tone: "ready",
    label: target.id === "pdf-x4" ? "Ready · X-4" : "Ready",
  };
}

/** Export mode — LEFT panel: outputs navigation (kit ExportNavPanel).
 *  Status dots reflect real per-target readiness. */
export function OutputsPanel(_props: PanelProps) {
  const meta = useDocumentMeta();
  const loaded = meta != null && meta.pageCount > 0;
  const profileReady = meta?.cmykProfileActive ?? false;
  const selected = useSelectedExportTarget();

  return (
    <div
      data-outputs-panel
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "var(--font-sans)",
      }}
    >
      <CockpitPanelHeader title="Outputs" />
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 8px" }}>
        {EXPORT_TARGETS.map((t) => {
          const sel = selected === t.id;
          const r = readiness(t, loaded, profileReady);
          const dot =
            r.tone === "ready"
              ? "var(--status-approved)"
              : r.tone === "warn"
                ? "var(--status-review)"
                : "var(--status-draft)";
          return (
            <div
              key={t.id}
              data-output-nav={t.id}
              data-output-live={t.live ? "" : undefined}
              data-selected={sel || undefined}
              onClick={() => setSelectedExportTarget(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: "var(--radius-lg)",
                cursor: "pointer",
                background: sel ? "var(--selected-bg)" : "transparent",
                marginBottom: 1,
                opacity: t.live ? 1 : 0.6,
              }}
            >
              <Icon
                name={t.icon}
                size={16}
                style={{ color: "var(--pg-muted-fg)", flexShrink: 0 }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 12.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {t.title}
              </span>
              <span
                data-output-dot={r.tone}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: dot,
                  flexShrink: 0,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ImagePhase =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; files: number }
  | { kind: "error"; message: string };

/** Export mode — RIGHT inspector: per-target settings (kit
 *  ExportInspector). LIVE targets carry real inline settings + a real
 *  run action; HONEST targets carry the concept seam. */
export function ExportInspectorPanel(_props: PanelProps) {
  const client = useCanvasClient();
  const meta = useDocumentMeta();
  const { handle } = useDocument();
  const loaded = meta != null && meta.pageCount > 0;
  const profileReady = meta?.cmykProfileActive ?? false;
  const selected = useSelectedExportTarget();
  const target = exportTargetById(selected);
  const image = useImageSettings();
  const [imagePhase, setImagePhase] = useState<ImagePhase>({ kind: "idle" });
  const [idmlPhase, setIdmlPhase] = useState<ImagePhase>({ kind: "idle" });
  const r = readiness(target, loaded, profileReady);

  const onRunImage = async () => {
    if (!handle) return;
    setImagePhase({ kind: "running" });
    try {
      const { files } = await runImageExport(client, {
        pageIds: handle.pageIds,
        pageSizesPt: handle.pageSizesPt,
        settings: image,
        baseName: meta?.documentName,
      });
      setImagePhase({ kind: "done", files });
    } catch (err) {
      setImagePhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onRunIdml = async () => {
    if (!handle) return;
    setIdmlPhase({ kind: "running" });
    try {
      await runIdmlExport(client, meta?.documentName);
      setIdmlPhase({ kind: "done", files: 1 });
    } catch (err) {
      setIdmlPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div data-export-inspector-panel style={{ overflowY: "auto", height: "100%" }}>
      <CockpitPanelHeader title={target.title} />
      <div style={{ padding: "0 14px 12px" }}>
        <StatusPill tone={r.tone} testId="export-inspector-readiness">
          {r.label}
        </StatusPill>
      </div>

      {target.action === "dialog" && (
        <>
          <CockpitSection title="Settings">
            <span className="pg-ui-xs" style={{ lineHeight: 1.45 }}>
              Standard, bleed, marks and image downsampling are set in the
              export dialog — one place, applied per run.
            </span>
          </CockpitSection>
          <div style={{ padding: 14 }}>
            <CockpitBtn
              full
              primary
              disabled={!loaded}
              testId="export-inspector-run"
              onClick={() => notifyExportPdfDialog("open")}
            >
              <Icon name="ui-export" size={15} /> Export {target.title}
            </CockpitBtn>
          </div>
        </>
      )}

      {target.action === "image" && (
        <>
          <CockpitSection title="Settings">
            <div
              data-export-image-settings
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <SettingRow label="Resolution">
                <select
                  data-export-image-dpi
                  value={String(image.dpi)}
                  disabled={!loaded}
                  onChange={(e) =>
                    setImageSettings({
                      dpi: Number(e.target.value) as 72 | 150 | 300,
                    })
                  }
                >
                  <option value="72">72 ppi (screen)</option>
                  <option value="150">150 ppi (proof)</option>
                  <option value="300">300 ppi (print)</option>
                </select>
              </SettingRow>
              <SettingRow label="Pages">
                <select
                  data-export-image-scope
                  value={image.scope}
                  disabled={!loaded}
                  onChange={(e) =>
                    setImageSettings({
                      scope: e.target.value as "all" | "current",
                    })
                  }
                >
                  <option value="all">
                    All ({loaded ? meta.pageCount : 0})
                  </option>
                  <option value="current">Current page</option>
                </select>
              </SettingRow>
            </div>
          </CockpitSection>
          <div style={{ padding: 14 }}>
            <CockpitBtn
              full
              primary
              disabled={!loaded || imagePhase.kind === "running"}
              testId="export-inspector-run-image"
              onClick={() => void onRunImage()}
            >
              <Icon name="ui-export" size={15} />{" "}
              {imagePhase.kind === "running"
                ? "Rendering…"
                : "Export page images"}
            </CockpitBtn>
            {imagePhase.kind === "done" && (
              <div
                data-export-image-done
                className="pg-ui-xs"
                style={{ marginTop: 8, color: "var(--status-approved)" }}
              >
                Exported {imagePhase.files} PNG
                {imagePhase.files === 1 ? "" : "s"}.
              </div>
            )}
            {imagePhase.kind === "error" && (
              <div
                className="pg-ui-xs"
                style={{ marginTop: 8, color: "var(--status-error)" }}
              >
                Export failed: {imagePhase.message}
              </div>
            )}
          </div>
        </>
      )}

      {target.action === "idml" && (
        <>
          <CockpitSection title="Settings">
            <span className="pg-ui-xs" style={{ lineHeight: 1.45 }}>
              The full document serialises back to an `.idml` package —
              re-openable in InDesign and this editor, with every edit
              preserved. No per-run options.
            </span>
          </CockpitSection>
          <div style={{ padding: 14 }}>
            <CockpitBtn
              full
              primary
              disabled={!loaded || idmlPhase.kind === "running"}
              testId="export-inspector-run-idml"
              onClick={() => void onRunIdml()}
            >
              <Icon name="ui-export" size={15} />{" "}
              {idmlPhase.kind === "running" ? "Packaging…" : "Export IDML"}
            </CockpitBtn>
            {idmlPhase.kind === "done" && (
              <div
                data-export-idml-done
                className="pg-ui-xs"
                style={{ marginTop: 8, color: "var(--status-approved)" }}
              >
                IDML package downloaded.
              </div>
            )}
            {idmlPhase.kind === "error" && (
              <div
                className="pg-ui-xs"
                style={{ marginTop: 8, color: "var(--status-error)" }}
              >
                Export failed: {idmlPhase.message}
              </div>
            )}
          </div>
        </>
      )}

      {!target.live && (
        <CockpitSection title="Settings">
          <span className="pg-ui-xs" style={{ lineHeight: 1.45 }}>
            {target.note}. This output lands with the multi-format publishing
            pipeline.
          </span>
        </CockpitSection>
      )}
    </div>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12.5,
        fontFamily: "var(--font-sans)",
      }}
    >
      <span style={{ width: 88, color: "var(--pg-muted-fg)" }}>{label}</span>
      {children}
    </label>
  );
}
