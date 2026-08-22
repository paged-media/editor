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


// The Journal panel (ADR 025) — the local flight recorder's surface.
//
// Two halves, and the SECOND one is the point:
//
//   1. What was recorded — a bounded ring of program events (commands,
//      plugin activation, worker frames, crashes), newest first.
//   2. WHAT THIS CANNOT SEE — the uncaptured ledger and the declared blind
//      spots, rendered PERMANENTLY and NOT behind a disclosure triangle.
//
// The second half exists because the failure mode of any diagnostic surface is
// a reader mistaking absence of evidence for evidence of absence. The action
// recorder already established the rule this generalises (`shell/actions/
// model.ts`): a silent drop produces a false picture; a counted drop is a fact
// on screen.
//
// Nothing here transmits anything. Export is a Blob download through the app's
// existing door, and the dialog shows the EXACT bytes that will be written —
// "explicit export" only means something if the user can see what leaves.

import { useMemo, useState, useSyncExternalStore } from "react";

import {
  journal,
  textFor,
  ledgerIsClean,
  KNOWN_BLIND_SPOTS,
  type JournalEntry,
  type JournalSeverity,
} from "@paged-media/client";

import {
  buildBundleNow,
  exportJournalBundleAsync,
  getDocumentShape,
  previewBundle,
  pullWorkerJournal,
} from "../journal-sink";

const DOT: Record<JournalSeverity, string> = {
  error: "var(--status-error)",
  warn: "var(--status-review)",
  info: "var(--status-info)",
  debug: "var(--pg-muted-fg)",
};

const kicker: React.CSSProperties = {
  font: "700 10px var(--font-sans, sans-serif)",
  letterSpacing: "var(--tracking-wide, 0.14em)",
  textTransform: "uppercase",
  color: "var(--pg-muted-fg)",
  margin: "0 0 var(--space-2, 8px)",
};

const mono: React.CSSProperties = {
  font: "11px/1.5 var(--font-mono, monospace)",
  fontVariantNumeric: "tabular-nums",
};

// Module-scope so the identities are stable across renders (a new function
// every render makes useSyncExternalStore resubscribe on every commit).
const subscribe = (cb: () => void) => journal.subscribe(cb);
const getVersion = () => journal.version();

export function JournalPanel() {
  // Subscribe to the buffer's REVISION, not to `entries()`: a ledger-only
  // change (an eviction, a counted SAB write) leaves the entry array identical
  // and would otherwise never reach the screen.
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const [minSeverity, setMinSeverity] = useState<JournalSeverity | "all">("all");
  const [exporting, setExporting] = useState(false);

  const { entries, ledger, counts } = useMemo(() => {
    void version;
    return {
      entries: journal.entries(),
      ledger: journal.getLedger(),
      counts: journal.counts(),
    };
  }, [version]);

  const shown = useMemo(() => {
    const rank = { debug: 0, info: 1, warn: 2, error: 3 } as const;
    const floor = minSeverity === "all" ? -1 : rank[minSeverity];
    // Newest first: when something just went wrong, it is at the top.
    return entries.filter((e) => rank[e.severity] >= floor).slice().reverse();
  }, [entries, minSeverity]);

  return (
    <div
      data-journal-panel
      style={{
        padding: "var(--space-3, 12px)",
        font: "12px var(--font-sans, sans-serif)",
        color: "var(--pg-fg)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          // The panel docks into a resizable column and shares the console
          // group with Problems, so the header is allowed to wrap rather than
          // overflow when the user drags the dock narrow.
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={kicker}>Journal</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 1 auto", minWidth: 0 }}>
          <select
            data-journal-filter
            aria-label="Minimum severity"
            value={minSeverity}
            onChange={(e) =>
              setMinSeverity(e.target.value as JournalSeverity | "all")
            }
            style={{
              ...mono,
              background: "transparent",
              color: "var(--pg-fg)",
              border: "1px solid var(--border, #2a2a2a)",
              borderRadius: "var(--radius-sm, 4px)",
              padding: "2px 4px",
            }}
          >
            <option value="all">all</option>
            <option value="info">info+</option>
            <option value="warn">warn+</option>
            <option value="error">errors</option>
          </select>
          <button
            type="button"
            data-journal-export
            onClick={() => {
              // Drain the worker first so the preview is not missing the
              // render loop's last second.
              void pullWorkerJournal().then(() => setExporting(true));
            }}
            style={{
              ...mono,
              cursor: "pointer",
              background: "transparent",
              color: "var(--pg-fg)",
              border: "1px solid var(--border, #2a2a2a)",
              borderRadius: "var(--radius-sm, 4px)",
              padding: "2px 8px",
            }}
          >
            Export…
          </button>
        </div>
      </div>

      <p data-journal-summary style={{ ...mono, margin: "0 0 8px", color: "var(--pg-muted-fg)" }}>
        {entries.length} entr{entries.length === 1 ? "y" : "ies"} · {counts.error}{" "}
        error{counts.error === 1 ? "" : "s"} · {counts.warn} warning
        {counts.warn === 1 ? "" : "s"}
      </p>

      {shown.length === 0 ? (
        <p data-journal-empty style={{ margin: 0, color: "var(--pg-muted-fg)" }}>
          Nothing recorded at this severity yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {shown.map((e) => (
            <JournalRow key={`${e.origin}:${e.seq}`} entry={e} />
          ))}
        </ul>
      )}

      <UncapturedSection ledger={ledger} />

      {exporting && (
        <ExportDialog onClose={() => setExporting(false)} />
      )}
    </div>
  );
}

function JournalRow({ entry }: { entry: JournalEntry }) {
  const data = entry.data ?? {};
  const keys = Object.keys(data);
  return (
    <li
      data-journal-entry
      data-journal-code={entry.code}
      data-journal-severity={entry.severity}
      data-journal-origin={entry.origin}
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "var(--space-2, 8px)",
        padding: "3px 2px",
        ...mono,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "var(--radius-full, 999px)",
          background: DOT[entry.severity],
          flex: "none",
          transform: "translateY(1px)",
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span title={textFor(entry.code)}>{entry.code}</span>
        {entry.durMs !== undefined && (
          <span style={{ color: "var(--pg-muted-fg)", marginLeft: 6 }}>
            {entry.durMs}ms
          </span>
        )}
        {keys.length > 0 && (
          <span style={{ color: "var(--pg-muted-fg)", marginLeft: 6 }}>
            {keys.map((k) => `${k}=${String(data[k])}`).join(" ")}
          </span>
        )}
      </span>
      <span style={{ color: "var(--pg-muted-fg)", flex: "none" }}>
        {entry.origin}
      </span>
    </li>
  );
}

/**
 * "What this cannot see" — permanently visible, never collapsed.
 *
 * Collapsing this would defeat its purpose: a reader skimming an exported
 * bundle needs to know what is structurally missing BEFORE they conclude
 * anything from what is present.
 */
function UncapturedSection({
  ledger,
}: {
  ledger: ReturnType<typeof journal.getLedger>;
}) {
  const clean = ledgerIsClean(ledger);
  const rows: [string, number, string][] = [
    ["evicted", ledger.evicted, "recorded, then overwritten by the ring"],
    ["collapsed", ledger.collapsed, "folded into another entry by a rate policy (the count survives on it)"],
    ["rejected data", ledger.rejectedData, "values dropped for failing the identifier rule — THIS IS A BUG IN THE EMITTING CODE"],
    ["gesture SAB writes", ledger.sabGestureUpdates, "deliberately not journaled individually"],
    ["camera SAB writes", ledger.sabCameraWrites, "deliberately not journaled individually"],
    ["worker entries dropped", ledger.workerDropped, "lost to the worker ring before a drain reached them"],
    ["drain failures", ledger.drainFailures, "an UNKNOWN number of worker entries are missing"],
    ["plugin log lines", ledger.pluginLogCensus, "censused (severity + site hash); the text is withheld by design"],
  ];
  const tracing = ledger.engineTracing;
  const tracingTotal =
    tracing.debug + tracing.info + tracing.warn + tracing.error;

  return (
    <section
      data-journal-uncaptured
      style={{
        marginTop: "var(--space-4, 16px)",
        paddingTop: "var(--space-3, 12px)",
        borderTop: "1px solid var(--border, #2a2a2a)",
      }}
    >
      <div style={kicker}>What this cannot see</div>

      {clean && tracingTotal === 0 ? (
        <p style={{ ...mono, margin: "0 0 8px", color: "var(--pg-muted-fg)" }}>
          Nothing uncaptured so far this session.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0 }}>
          {rows
            .filter(([, n]) => n > 0)
            .map(([label, n, why]) => (
              <li
                key={label}
                data-journal-uncaptured-row={label}
                style={{ ...mono, color: "var(--pg-muted-fg)", padding: "1px 0" }}
              >
                <strong style={{ color: "var(--pg-fg)" }}>{n}</strong> {label}
                <span style={{ marginLeft: 6 }}>— {why}</span>
              </li>
            ))}
          {tracingTotal > 0 && (
            <li style={{ ...mono, color: "var(--pg-muted-fg)", padding: "1px 0" }}>
              <strong style={{ color: "var(--pg-fg)" }}>{tracingTotal}</strong>{" "}
              engine tracing events — fired and dropped; no shipped subscriber
              carries their text
            </li>
          )}
        </ul>
      )}

      <details data-journal-blindspots>
        <summary style={{ ...mono, cursor: "pointer", color: "var(--pg-muted-fg)" }}>
          {KNOWN_BLIND_SPOTS.length} structural blind spots (always present, by design)
        </summary>
        <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 8 }}>
          {KNOWN_BLIND_SPOTS.map((spot) => (
            <li key={spot.id} data-journal-blindspot={spot.id} style={{ ...mono }}>
              <div style={{ color: "var(--pg-fg)" }}>{spot.what}</div>
              <div style={{ color: "var(--pg-muted-fg)" }}>{spot.why}</div>
              <div style={{ color: "var(--pg-muted-fg)", fontStyle: "italic" }}>
                Cost to fix: {spot.wouldCost}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/**
 * The export dialog.
 *
 * The live preview is not a nicety — it IS the privacy claim made checkable.
 * `previewBundle` and the download path call the same serializer, so what is
 * shown cannot drift from what is written.
 */
function ExportDialog({ onClose }: { onClose: () => void }) {
  const [includeCrash, setIncludeCrash] = useState(false);
  const [includeShape, setIncludeShape] = useState(false);

  const options = useMemo(
    () => ({
      // Both sections are OPT-IN and default OFF. Stack traces embed the
      // user's disk paths; document shape carries font families.
      crash: includeCrash
        ? { stacks: readCrashStacks() }
        : undefined,
      documentShape: includeShape ? getDocumentShape() : undefined,
    }),
    [includeCrash, includeShape],
  );

  const text = useMemo(() => previewBundle(options), [options]);
  const bundle = useMemo(() => buildBundleNow(options), [options]);

  return (
    <div
      data-journal-export-backdrop
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.6)",
        font: "13px/1.5 var(--font-sans, system-ui, sans-serif)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-export-title"
        data-journal-export-dialog
        style={{
          width: "min(720px, 94vw)",
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          padding: 20,
          borderRadius: "var(--radius-lg, 10px)",
          border: "1px solid var(--border, #2a2a2a)",
          background: "var(--elevated, var(--background, #161616))",
          color: "var(--fg, #e7e7e7)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
      >
        <h2 id="journal-export-title" style={{ margin: "0 0 4px", fontSize: 15 }}>
          Export journal bundle
        </h2>
        <p style={{ margin: "0 0 12px", color: "var(--muted-fg, #9a9a9a)" }}>
          {bundle.counters.recorded} entries. Nothing has been sent anywhere —
          this writes a file to your machine. Below is exactly what it will
          contain.
        </p>

        <div style={{ display: "grid", gap: 6, margin: "0 0 12px" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              data-journal-include-crash
              checked={includeCrash}
              onChange={(e) => setIncludeCrash(e.target.checked)}
            />
            <span>
              Include crash stack traces
              <span style={{ color: "var(--muted-fg, #9a9a9a)" }}>
                {" "}— stack traces usually contain file paths from your disk.
              </span>
            </span>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input
              type="checkbox"
              data-journal-include-shape
              checked={includeShape}
              onChange={(e) => setIncludeShape(e.target.checked)}
            />
            <span>
              Include document shape
              <span style={{ color: "var(--muted-fg, #9a9a9a)" }}>
                {" "}— page/story counts and font names. No document text.
              </span>
            </span>
          </label>
        </div>

        <pre
          data-journal-preview
          style={{
            ...mono,
            flex: 1,
            minHeight: 160,
            overflow: "auto",
            margin: "0 0 12px",
            padding: 10,
            background: "var(--background, #0f0f0f)",
            border: "1px solid var(--border, #2a2a2a)",
            borderRadius: "var(--radius-sm, 4px)",
            whiteSpace: "pre",
          }}
        >
          {text}
        </pre>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            data-journal-export-cancel
            onClick={onClose}
            style={buttonStyle}
          >
            Cancel
          </button>
          <button
            type="button"
            data-journal-export-confirm
            onClick={() => {
              void exportJournalBundleAsync(options).then(onClose);
            }}
            style={{ ...buttonStyle, borderColor: "var(--accent, #6f9)" }}
          >
            Save file
          </button>
        </div>
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  font: "12px var(--font-sans, sans-serif)",
  cursor: "pointer",
  background: "transparent",
  color: "var(--fg, #e7e7e7)",
  border: "1px solid var(--border, #2a2a2a)",
  borderRadius: "var(--radius-sm, 4px)",
  padding: "5px 12px",
};

/** The shell's error boundary stashes the last crash on a global (the
 *  `__pagedCrash` affordance). That is the only stack the app retains, and it
 *  is read ONLY when the user ticks the box. */
function readCrashStacks(): string[] {
  const stash = (globalThis as { __pagedCrash?: string }).__pagedCrash;
  return stash ? [stash] : [];
}
