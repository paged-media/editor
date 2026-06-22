/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// Cockpit — Preflight (Prepress mode's left panel). REAL where the
// engine delivers today: the links inventory comes from the live
// `links` collection, and "Validate output" runs an actual PDF
// export (bytes discarded) to surface the exporter's diagnostics.
//
// W2.12 — the export reply now carries STRUCTURED findings
// (`PreflightFinding{code,severity,message,pageIndex}`) alongside the
// legacy flat strings. We group them into Errors / Warnings and make
// each finding a jump target: clicking navigates the canvas to the
// finding's `pageIndex` via the same `navigateToPages` hand-off the
// Document Map and filmstrip use. PPI / bleed checks remain visible
// seams until the engine grows dedicated preflight accessors.

import { useState } from "react";
import {
  CockpitPanelHeader,
  CockpitSection,
  CockpitBtn,
  StatusPill,
  navigateToPages,
  useCanvasClient,
  useCollection,
  useDocumentMeta,
} from "@paged-media/shell";
import type { LinkSummary, PreflightFinding } from "@paged-media/client";

import { recordFindings, usePreflightFindings } from "./preflight-findings";

type RunState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done" }
  | { state: "error"; message: string };

export function PreflightPanel() {
  const client = useCanvasClient();
  const meta = useDocumentMeta();
  const links = useCollection<LinkSummary>("links");
  const { findings, diagnostics, runCount } = usePreflightFindings(client);
  const [run, setRun] = useState<RunState>({ state: "idle" });
  const loaded = meta != null && meta.pageCount > 0;

  const validate = async () => {
    setRun({ state: "running" });
    try {
      // A REAL dry export: same session wire the dialog drives; the
      // bytes are discarded, the findings are the point. W3.A2 — the
      // typed export return now carries the structured findings, so we
      // feed the shared store directly (no broadcast capture).
      const result = await client.exportPdf({ standard: "pdf17" });
      recordFindings(result);
      setRun({ state: "done" });
    } catch (err) {
      setRun({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Structured findings win; fall back to the legacy flat strings only
  // when the engine returned none (older wasm / no structured data).
  const structured = findings ?? [];
  const errors = structured.filter((f) => f.severity === "error");
  const warnings = structured.filter((f) => f.severity !== "error");
  const total = structured.length || diagnostics.length;
  const hasRun = run.state === "done" || runCount > 0;

  return (
    <div data-preflight-panel style={{ overflowY: "auto", height: "100%" }}>
      <CockpitPanelHeader title="Preflight" />

      <CockpitSection
        title="Output check"
        right={
          hasRun && run.state !== "error" ? (
            <StatusPill
              tone={total === 0 ? "ok" : errors.length > 0 ? "error" : "warn"}
              testId="validation-state"
            >
              {total === 0 ? "No findings" : `${total} finding(s)`}
            </StatusPill>
          ) : undefined
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <CockpitBtn
            sm
            primary
            full
            disabled={!loaded || run.state === "running"}
            testId="run-validation"
            onClick={() => void validate()}
          >
            {run.state === "running" ? "Validating…" : "Validate output"}
          </CockpitBtn>
          <span className="pg-ui-xs">
            Runs the real PDF pipeline and reports its findings — the same
            checks the export performs.
          </span>
          {run.state === "error" && (
            <StatusPill tone="error">{run.message}</StatusPill>
          )}

          {hasRun && structured.length > 0 && (
            <>
              {errors.length > 0 && (
                <FindingGroup
                  groupKey="errors"
                  label="Errors"
                  tone="var(--status-error)"
                  findings={errors}
                />
              )}
              {warnings.length > 0 && (
                <FindingGroup
                  groupKey="warnings"
                  label="Warnings"
                  tone="var(--status-review)"
                  findings={warnings}
                />
              )}
            </>
          )}

          {/* Older wasm with no structured findings: keep the honest
              flat-string cards under one Warnings group. */}
          {hasRun && structured.length === 0 && diagnostics.length > 0 && (
            <>
              <GroupKicker
                groupKey="warnings"
                label="Warnings"
                count={diagnostics.length}
                tone="var(--status-review)"
              />
              {diagnostics.map((d, i) => (
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

          {hasRun && total === 0 && run.state !== "error" && (
            <span className="pg-ui-xs" data-preflight-clean>
              No findings — the document exports cleanly.
            </span>
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

function GroupKicker({
  groupKey,
  label,
  count,
  tone,
}: {
  groupKey: string;
  label: string;
  count: number;
  tone: string;
}) {
  return (
    <div
      className="pg-label"
      data-preflight-group={groupKey}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        color: tone,
        marginTop: 2,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: tone,
        }}
      />
      {label} · {count}
    </div>
  );
}

/** A severity group with its kicker + jump-on-click finding cards. */
function FindingGroup({
  groupKey,
  label,
  tone,
  findings,
}: {
  groupKey: string;
  label: string;
  tone: string;
  findings: PreflightFinding[];
}) {
  return (
    <>
      <GroupKicker
        groupKey={groupKey}
        label={label}
        count={findings.length}
        tone={tone}
      />
      {findings.map((f, i) => {
        const hasPage = f.pageIndex != null;
        return (
          <button
            key={`${f.code}-${i}`}
            type="button"
            data-preflight-finding
            data-finding-code={f.code}
            data-finding-page={hasPage ? f.pageIndex : undefined}
            disabled={!hasPage}
            title={hasPage ? `Go to page ${f.pageIndex! + 1}` : f.code}
            onClick={
              hasPage ? () => navigateToPages([f.pageIndex!]) : undefined
            }
            className="pg-ui-xs"
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              border: "1px solid var(--pg-border)",
              borderLeft: `3px solid ${tone}`,
              borderRadius: "var(--radius-sm)",
              padding: "6px 8px",
              lineHeight: 1.35,
              background: "transparent",
              color: "var(--pg-fg)",
              cursor: hasPage ? "pointer" : "default",
              font: "inherit",
            }}
          >
            <span style={{ display: "block" }}>{f.message}</span>
            <span
              className="pg-mono-meta"
              style={{ display: "flex", gap: 6, marginTop: 2 }}
            >
              <span>{f.code}</span>
              {hasPage && <span>· page {f.pageIndex! + 1}</span>}
            </span>
          </button>
        );
      })}
    </>
  );
}
