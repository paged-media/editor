// Cockpit — shared last-export preflight findings store (app-local).
//
// W2.12: the worker's `pdfExported` reply now carries structured
// `PreflightFinding[]` (code/severity/message/pageIndex) alongside the
// legacy flat `diagnostics: string[]`. The client's typed `exportPdf`
// helper only surfaces `diagnostics` today (packages/client gap — see
// the note in this PR), but `client.subscribe(...)` fans out EVERY
// worker reply, so we capture the structured findings off that
// broadcast. A module-level store lets the Preflight panel (which runs
// the export) and the Publication-health panel (which reflects the
// last run's counts) read the SAME findings without re-exporting.
//
// One CanvasClient exists per app, so a singleton store is sufficient;
// it resets on `documentLoaded` so stale findings never bleed across
// documents.

import { useSyncExternalStore } from "react";

import type { CanvasClient, PreflightFinding } from "@paged-media/client";

export interface PreflightFindingsState {
  /** `null` until the first export of the current document completes. */
  findings: PreflightFinding[] | null;
  /** Legacy flat diagnostics from the same reply (kept for the
   *  Preflight panel's text cards when no structured findings exist). */
  diagnostics: string[];
  /** Monotonic counter — bumps on every captured export reply so
   *  consumers can tell "ran but found nothing" from "never ran". */
  runCount: number;
}

const EMPTY: PreflightFindingsState = {
  findings: null,
  diagnostics: [],
  runCount: 0,
};

let state: PreflightFindingsState = EMPTY;
const listeners = new Set<() => void>();
const wired = new WeakSet<CanvasClient>();

function emit(next: PreflightFindingsState): void {
  state = next;
  for (const l of listeners) l();
}

/** Subscribe a client's broadcast once so its `pdfExported` /
 *  `documentLoaded` replies feed the store. Idempotent per client. */
function ensureWired(client: CanvasClient): void {
  if (wired.has(client)) return;
  wired.add(client);
  client.subscribe((msg) => {
    if (msg.kind === "pdfExported") {
      emit({
        findings: msg.payload.findings ?? [],
        diagnostics: msg.payload.diagnostics ?? [],
        runCount: state.runCount + 1,
      });
    } else if (msg.kind === "documentLoaded") {
      emit(EMPTY);
    }
  });
}

/** Live last-export findings for the given client. Re-renders the
 *  caller whenever a fresh export reply (or a document load) lands. */
export function usePreflightFindings(
  client: CanvasClient,
): PreflightFindingsState {
  ensureWired(client);
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => state,
    () => state,
  );
}

/** Severity rollup for the health tiles — `error` and `warning`
 *  counts, with everything else folded into `warning` (the engine
 *  emits only those two today, but be forgiving). */
export function severityCounts(findings: PreflightFinding[] | null): {
  errors: number;
  warnings: number;
} {
  if (!findings) return { errors: 0, warnings: 0 };
  let errors = 0;
  let warnings = 0;
  for (const f of findings) {
    if (f.severity === "error") errors++;
    else warnings++;
  }
  return { errors, warnings };
}
