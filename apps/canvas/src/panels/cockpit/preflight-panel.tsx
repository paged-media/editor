// Cockpit — Preflight (Prepress mode's left panel). REAL where the
// engine delivers today: the links inventory comes from the live
// `links` collection, and "Validate output" runs an actual PDF
// export (bytes discarded) to surface the exporter's diagnostics —
// restricted fonts, images with missing bytes. PPI / bleed checks
// are visible seams until the engine grows preflight accessors.

import { useState } from "react";
import {
  CockpitPanelHeader,
  CockpitSection,
  CockpitBtn,
  StatusPill,
  useCanvasClient,
  useCollection,
  useDocumentMeta,
} from "@paged-media/shell";
import type { LinkSummary } from "@paged-media/client";

type Validation =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; diagnostics: string[] }
  | { state: "error"; message: string };

export function PreflightPanel() {
  const client = useCanvasClient();
  const meta = useDocumentMeta();
  const links = useCollection<LinkSummary>("links");
  const [validation, setValidation] = useState<Validation>({ state: "idle" });
  const loaded = meta != null && meta.pageCount > 0;

  const validate = async () => {
    setValidation({ state: "running" });
    try {
      // A REAL dry export: same session wire the dialog drives;
      // the bytes are discarded, the diagnostics are the point.
      const { diagnostics } = await client.exportPdf({ standard: "pdf17" });
      setValidation({ state: "done", diagnostics });
    } catch (err) {
      setValidation({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div data-preflight-panel style={{ overflowY: "auto", height: "100%" }}>
      <CockpitPanelHeader title="Preflight" />

      <CockpitSection
        title="Output check"
        right={
          validation.state === "done" ? (
            <StatusPill
              tone={validation.diagnostics.length === 0 ? "ok" : "warn"}
              testId="validation-state"
            >
              {validation.diagnostics.length === 0
                ? "No findings"
                : `${validation.diagnostics.length} finding(s)`}
            </StatusPill>
          ) : undefined
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <CockpitBtn
            sm
            primary
            full
            disabled={!loaded || validation.state === "running"}
            testId="run-validation"
            onClick={() => void validate()}
          >
            {validation.state === "running" ? "Validating…" : "Validate output"}
          </CockpitBtn>
          <span className="pg-ui-xs">
            Runs the real PDF pipeline and reports its findings — the same
            checks the export performs.
          </span>
          {validation.state === "error" && (
            <StatusPill tone="error">{validation.message}</StatusPill>
          )}
          {validation.state === "done" && validation.diagnostics.length > 0 && (
            <>
              {/* The gallery's grouped findings header. The
                  exporter's diagnostics are flat strings today —
                  the CRITICAL/WARNINGS split lands when the engine
                  ships structured preflight findings (severity +
                  page refs); until then one honest WARNINGS group. */}
              <div
                className="pg-label"
                data-preflight-group="warnings"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--status-review)",
                  marginTop: 2,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--status-review)",
                  }}
                />
                Warnings · {validation.diagnostics.length}
              </div>
              {validation.diagnostics.map((d, i) => (
                <div
                  key={i}
                  data-preflight-finding
                  className="pg-ui-xs"
                  style={{
                    border: "1px solid var(--pg-border)",
                    borderLeft: "3px solid var(--status-review)",
                    borderRadius: "var(--radius-sm)",
                    padding: "6px 8px",
                    lineHeight: 1.35,
                  }}
                >
                  {d}
                </div>
              ))}
            </>
          )}
        </div>
      </CockpitSection>

      <CockpitSection
        title="Links"
        right={
          <span className="pg-mono-meta">{links ? links.length : "—"}</span>
        }
      >
        {links && links.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {links.map((l, i) => (
              <div
                key={`${l.hostSelfId}-${i}`}
                data-preflight-link
                className="pg-ui-xs"
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "baseline",
                  minWidth: 0,
                }}
              >
                <span className="pg-mono-meta" style={{ flexShrink: 0 }}>
                  {l.hostKind}
                </span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {l.uri.split("/").pop() ?? l.uri}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className="pg-ui-xs">
            {loaded ? "No placed links." : "Open a document to inspect links."}
          </span>
        )}
      </CockpitSection>

      <CockpitSection title="Images & bleed" defaultOpen={false}>
        <span className="pg-ui-xs">
          Effective-PPI and bleed-coverage checks land with the engine's
          preflight accessors.
        </span>
      </CockpitSection>
    </div>
  );
}
