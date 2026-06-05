// Cockpit — Export mode's split surfaces (kit: left Outputs nav +
// right per-target Export inspector; the Export Center table itself
// is the canvas-area main view, export-center-panel.tsx).
//
// REAL: the Print PDF/X-4 target (readiness from the bytes-backed
// working-space state; Export… drives the live ExportPdfDialog).
// SEAMS: the other targets are visible, honestly disabled.

import { useSyncExternalStore } from "react";

import {
  CockpitBtn,
  CockpitPanelHeader,
  CockpitSection,
  Icon,
  StatusPill,
  notifyExportPdfDialog,
  useDocumentMeta,
  type PanelProps,
} from "@paged-media/shell";

export interface ExportTarget {
  id: string;
  icon: string;
  title: string;
  note: string;
  real?: boolean;
}

export const EXPORT_TARGETS: ExportTarget[] = [
  {
    id: "pdf-x4",
    icon: "ui-doc",
    title: "Print PDF (PDF/X-4)",
    note: "Text as text · native CMYK + spot plates",
    real: true,
  },
  { id: "web", icon: "ui-web", title: "Web bundle", note: "Responsive HTML" },
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

// ── Tiny cross-panel store: which output target is selected. The
//    Outputs nav (left) writes; the Export inspector (right) and the
//    Export Center (canvas) read. Same pattern as the export-dialog
//    notifier — module-level, no provider plumbing. ────────────────
let selectedTarget = "pdf-x4";
const listeners = new Set<() => void>();
export function setSelectedExportTarget(id: string) {
  selectedTarget = id;
  for (const fn of listeners) fn();
}
export function useSelectedExportTarget(): string {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => selectedTarget,
  );
}

/** Export mode — LEFT panel: outputs navigation (kit ExportNavPanel). */
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
          const dot = !t.real
            ? "var(--status-draft)"
            : !loaded
              ? "var(--status-draft)"
              : profileReady
                ? "var(--status-approved)"
                : "var(--status-review)";
          return (
            <div
              key={t.id}
              data-output-nav={t.id}
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
                opacity: t.real ? 1 : 0.6,
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

/** Export mode — RIGHT inspector: per-target settings (kit
 *  ExportInspector). The PDF/X-4 target's settings live in the real
 *  export dialog; the button opens it. */
export function ExportInspectorPanel(_props: PanelProps) {
  const meta = useDocumentMeta();
  const loaded = meta != null && meta.pageCount > 0;
  const profileReady = meta?.cmykProfileActive ?? false;
  const selected = useSelectedExportTarget();
  const target =
    EXPORT_TARGETS.find((t) => t.id === selected) ?? EXPORT_TARGETS[0];

  return (
    <div
      data-export-inspector-panel
      style={{ overflowY: "auto", height: "100%" }}
    >
      <CockpitPanelHeader title={target.title} />
      <div style={{ padding: "0 14px 12px" }}>
        <StatusPill
          tone={
            !target.real
              ? "draft"
              : !loaded
                ? "draft"
                : profileReady
                  ? "ready"
                  : "warn"
          }
          testId="export-inspector-readiness"
        >
          {!target.real
            ? "Coming soon"
            : !loaded
              ? "No document"
              : profileReady
                ? "Ready · X-4"
                : "PDF 1.7 — no output intent"}
        </StatusPill>
      </div>
      {target.real ? (
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
      ) : (
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
