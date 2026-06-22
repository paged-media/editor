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

// Problems panel (paged.web W-05) — the host surface that consumes
// `host.diagnostics`. Every loaded bundle's `diagnostics.set/clear`
// fans out (via the injected sink) into `problems-store`; this panel
// lists them — (severity, source, message, location) — in one place,
// closing the "diagnostics only surfaced inline in the plugin's own
// panel" gap.
//
// Click-to-focus: clicking a problem focuses the OWNING bundle's panel
// (resolved from the panel registry by namespace). Document-location
// focus (jump the canvas to the offending frame/line) is a follow-up —
// the `Diagnostic` location type carries `source`/`line`, not a
// document ref, so there is nothing to navigate to yet (noted in
// BREAKAGE_LOG W-05).

import { useSyncExternalStore } from "react";

import { cockpitActions, useRegistries } from "@paged-media/shell";

import {
  getProblemsSnapshot,
  subscribeProblems,
  type ProblemEntry,
} from "./problems-store";

const DOT: Record<ProblemEntry["severity"], string> = {
  error: "var(--status-error)",
  warning: "var(--status-review)",
  info: "var(--status-info)",
};

const kicker: React.CSSProperties = {
  font: "700 10px var(--font-sans, sans-serif)",
  letterSpacing: "var(--tracking-wide, 0.14em)",
  textTransform: "uppercase",
  color: "var(--pg-muted-fg)",
  margin: "0 0 var(--space-2, 8px)",
};

export function ProblemsPanel() {
  const problems = useSyncExternalStore(
    subscribeProblems,
    getProblemsSnapshot,
    getProblemsSnapshot,
  );
  const registries = useRegistries();

  // The bundle's primary panel: first registered panel whose id sits
  // under the bundle namespace (`media.paged.web` → `…web.panel.…`).
  const panelForBundle = (bundleId: string): string | undefined =>
    registries.panels
      .list()
      .find((p) => p.id.startsWith(bundleId + "."))?.id;

  const focus = (entry: ProblemEntry) => {
    const panelId = panelForBundle(entry.bundleId);
    if (panelId) cockpitActions.openPanel?.(panelId);
  };

  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.filter((p) => p.severity === "warning").length;

  return (
    <div
      data-problems-panel
      style={{
        padding: "var(--space-3, 12px)",
        font: "12px var(--font-sans, sans-serif)",
        color: "var(--pg-fg)",
      }}
    >
      <div style={kicker}>Problems</div>
      {problems.length === 0 ? (
        <p
          data-problems-empty
          style={{ margin: 0, color: "var(--pg-muted-fg)" }}
        >
          No problems detected.
        </p>
      ) : (
        <>
          <p
            data-problems-summary
            style={{
              margin: "0 0 var(--space-2, 8px)",
              color: "var(--pg-muted-fg)",
              font: "11px var(--font-mono, monospace)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {errors} error{errors === 1 ? "" : "s"}, {warnings} warning
            {warnings === 1 ? "" : "s"}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {problems.map((p, i) => (
              <li key={i}>
                <button
                  type="button"
                  data-problem
                  data-problem-severity={p.severity}
                  data-problem-bundle={p.bundleId}
                  onClick={() => focus(p)}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "var(--space-2, 8px)",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: "4px 2px",
                    borderRadius: "var(--radius-sm, 4px)",
                    font: "11px/1.5 var(--font-mono, monospace)",
                    color: "var(--pg-fg)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "var(--radius-full, 999px)",
                      background: DOT[p.severity],
                      flex: "none",
                      transform: "translateY(1px)",
                    }}
                  />
                  <span style={{ flex: 1 }}>
                    <span data-problem-message>{p.message}</span>
                    <span
                      data-problem-location
                      style={{ color: "var(--pg-muted-fg)", marginLeft: 6 }}
                    >
                      {p.source ?? p.key}
                      {p.line !== undefined ? `:${p.line}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
