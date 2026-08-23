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


// The app's journal sink (ADR 025) — the ONE shell-side buffer.
//
// A module singleton, deliberately, for the same reason `problems-store.ts` is
// one: the things that feed it (the bundle host's console census, the global
// error handlers, the command tap) are created OUTSIDE the React tree, at
// module init or at `loadBundle` time. A context would force those callers to
// reach into React, which they cannot.
//
// The React side reads it through `useSyncExternalStore` — same pattern, same
// file shape, deliberately boring.
//
// Nothing here transmits anything. See ADR 025: the journal is KEPT, not SENT.

import {
  journal,
  errorIdent,
  siteHash,
  buildJournalBundle,
  serializeJournalBundle,
  journalBundleFilename,
  reduceUserAgent,
  PROTOCOL_VERSION,
  type JournalBundle,
  type BundleCrash,
  type JournalSeverity,
} from "@paged-media/client";
import { downloadBytes } from "./shell-file-saver";
import type {
  JournalDrain,
  BundleDocumentShape,
  BundlePlugin,
} from "@paged-media/client";

// The buffer itself lives in `@paged-media/client` so the React shell can
// reach the SAME ring (the shell may not import this app). Re-exported here
// because this module is where the app's wiring reads most naturally.
export { journal };

/**
 * A `Console`-shaped sink for `CreateBundleHostOptions.console`.
 *
 * This is the census, not a mirror (ADR 025 §5). `host.log` is ~900 free-text
 * call sites that routinely carry document content, font names and paths, so
 * what lands in the journal is `{ level, site }` — an opaque FNV-1a hash that
 * groups repeats of the same message without carrying one character of it.
 *
 * The real console still receives the real text, so a developer with devtools
 * open loses nothing. What they gain is a count: "paged.draw emitted 40 warns
 * in a minute" is a diagnosis that no individual line gives you.
 *
 * The sink is per-bundle so the plugin id is attributed at the source rather
 * than parsed back out of the `[id]` prefix the SDK already adds.
 */
export function createHostConsole(
  pluginId: string,
  real: Console = console,
): Pick<Console, "debug" | "info" | "warn" | "error"> {
  const census =
    (level: JournalSeverity) =>
    (message: unknown, ...rest: unknown[]): void => {
      // Forward verbatim FIRST — instrumentation must never cost the developer
      // the log line they were about to read.
      const fn = real[level === "warn" ? "warn" : level] as
        | ((...args: unknown[]) => void)
        | undefined;
      fn?.call(real, message, ...rest);
      journal.record({
        code: "plugin.log",
        severity: level === "error" ? "error" : "info",
        data: {
          level,
          site: siteHash(typeof message === "string" ? message : typeof message),
          plugin: pluginId,
        },
      });
      journal.addUncaptured({ pluginLogCensus: 1 });
    };
  return {
    debug: census("debug"),
    info: census("info"),
    warn: census("warn"),
    error: census("error"),
  };
}

/**
 * Install the global error handlers.
 *
 * Before this, the editor had exactly ONE React error boundary (at the shell
 * root) and NO `window.onerror` / `unhandledrejection` handler at all — so any
 * throw outside a React render was invisible: no console attribution, no
 * record, nothing to put in a bug report.
 *
 * Returns a disposer so tests can install and remove cleanly.
 */
export function installGlobalErrorCapture(target: Window = window): () => void {
  const onError = (event: ErrorEvent): void => {
    journal.record({
      code: "shell.window.error",
      severity: "error",
      data: { error: errorIdent(event.error ?? event) },
    });
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    journal.record({
      code: "shell.promise.unhandled",
      severity: "error",
      data: { error: errorIdent(event.reason) },
    });
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}

/** Test affordance, mirroring the `__overlaySignals` / `__pagedCrash` pattern
 *  already used in this app: lets an E2E spec assert on what was recorded
 *  without reaching into React. Dev-only — stripped in PROD by the caller. */
export function exposeJournalForTests(): void {
  (globalThis as unknown as { __pagedJournal?: unknown }).__pagedJournal = {
    entries: () => journal.entries(),
    ledger: () => journal.getLedger(),
    counts: () => journal.counts(),
    preview: (options?: JournalExportOptions) => previewBundle(options),
    drain: () => pullWorkerJournal(),
    bundle: (options?: JournalExportOptions) => buildBundleNow(options),
  };
}

/** What the two opt-in, default-OFF sections carry when the user ticks them. */
export interface JournalExportOptions {
  /** Stack traces embed the user's disk paths — OFF unless asked for. */
  crash?: BundleCrash;
  /** Structural counts + font families — OFF unless asked for. */
  documentShape?: BundleDocumentShape;
}

/**
 * Collect the environment facts the bundle header carries.
 *
 * Everything here is either a coarse capability flag or an already-reduced
 * string. The raw user-agent never lands: `reduceUserAgent` keeps browser
 * family + major and platform family, which is what actually helps triage,
 * and discards the build numbers that make a UA a fingerprint.
 */
function collectEnv() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    ua: reduceUserAgent(nav.userAgent),
    cores: nav.hardwareConcurrency,
    sab: typeof SharedArrayBuffer !== "undefined",
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    dpr: Math.round(window.devicePixelRatio * 100) / 100,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}

/** Build the bundle from the live buffer. Pure-ish: reads state, writes none. */
export function buildBundleNow(
  options: JournalExportOptions = {},
): JournalBundle {
  // Flush first so an in-flight aggregate window is not silently missing.
  journal.flush();
  return buildJournalBundle({
    entries: journal.entries(),
    uncaptured: journal.getLedger(),
    app: {
      // No build-stamped version exists in this app yet, so say so rather than
      // inventing one: a bundle that lies about which build produced it is
      // worse than one that admits it does not know.
      editorVersion:
        (import.meta.env.VITE_APP_VERSION as string | undefined) ??
        `dev.${import.meta.env.MODE}`,
      protocol: PROTOCOL_VERSION,
    },
    env: collectEnv(),
    plugins: getLoadedPlugins(),
    clocks: {
      shellEpochMs: journal.epochWallMs,
      ...(workerEpochMs === null
        ? {}
        : {
            workerEpochMs,
            skewNote:
              "worker entries were rebased onto the shell epoch; the two rings " +
              "have independent monotonic clocks, so cross-origin interleaving " +
              "is approximate (origin distinguishes them)",
          }),
    },
    generatedAtMs: Date.now(),
    includeCrash: options.crash,
    includeDocumentShape: options.documentShape,
  });
}

/** The exact text the export writes — and what the dialog previews. One
 *  function, so a preview can never drift from the file. */
export function previewBundle(options: JournalExportOptions = {}): string {
  return serializeJournalBundle(buildBundleNow(options));
}

/**
 * Hand the bundle to the user as a download, through the app's existing
 * blob→anchor door. No network call is made, and none can be: the editor's
 * CSP floor is `connect-src 'self' blob: data:` and this path never touches
 * it. The journal is KEPT, not SENT.
 */
export function exportJournalBundle(options: JournalExportOptions = {}): void {
  const now = Date.now();
  const text = previewBundle(options);
  downloadBytes(
    new TextEncoder().encode(text),
    journalBundleFilename(now, siteHash(String(now))),
    "application/json",
  );
}

// ─────────────────────────────────────────────────────────────────────
// The worker drain
// ─────────────────────────────────────────────────────────────────────
//
// The render worker keeps its OWN ring (different realm, different module
// instance) and hands it over on request. Merging is approximate: two
// `performance.now()` origins cannot be reconciled exactly, so worker entries
// are rebased onto the shell epoch and the export SAYS SO (`clocks.skewNote`)
// rather than presenting an interleaving it cannot actually guarantee.

let workerEpochMs: number | null = null;
let drainer: (() => Promise<JournalDrain | null>) | null = null;

/** Registered once by the app, when it has a client to drain through. */
export function setJournalDrainer(
  fn: (() => Promise<JournalDrain | null>) | null,
): void {
  drainer = fn;
}

/** Fold one drain into the shell ring. Safe to call with `null` — a failed or
 *  timed-out drain is COUNTED, because the alternative is a merged view that
 *  is quietly missing an unknown number of entries. */
export function absorbWorkerDrain(drain: JournalDrain | null): void {
  if (!drain) {
    journal.addUncaptured({ drainFailures: 1 });
    return;
  }
  workerEpochMs = drain.epochWallMs;
  const skewMs = drain.epochWallMs - journal.epochWallMs;
  for (const entry of drain.entries) {
    journal.adopt({ ...entry, t: entry.t + skewMs });
  }
  journal.addUncaptured(drain.ledger);
}

/** Drain the worker (if a drainer is registered) and fold it in. */
export async function pullWorkerJournal(): Promise<void> {
  if (!drainer) return;
  try {
    absorbWorkerDrain(await drainer());
  } catch {
    journal.addUncaptured({ drainFailures: 1 });
  }
}

/** The export path, including a fresh worker drain so the bundle is not
 *  missing the render loop's last second. */
export async function exportJournalBundleAsync(
  options: JournalExportOptions = {},
): Promise<void> {
  await pullWorkerJournal();
  exportJournalBundle(options);
}

// ─────────────────────────────────────────────────────────────────────
// Document shape (the opt-in export section)
// ─────────────────────────────────────────────────────────────────────
//
// Registered by the app, which is where the live document handle is. The
// engine's `DocumentStats` is already a pure-count struct — spreads, pages,
// frames, stories, paragraphs, lines, glyphs — so this section carries
// structure and no content.
//
// It is a PROVIDER rather than a snapshot because the export dialog must show
// the shape of the document open AT EXPORT TIME, not whatever was open when
// the panel mounted.

let documentShapeProvider: (() => BundleDocumentShape | undefined) | null = null;

export function setDocumentShapeProvider(
  fn: (() => BundleDocumentShape | undefined) | null,
): void {
  documentShapeProvider = fn;
}

/** `undefined` when no document is open — the checkbox then adds nothing, and
 *  the dialog's live preview shows exactly that rather than an empty object
 *  pretending to be data. */
export function getDocumentShape(): BundleDocumentShape | undefined {
  return documentShapeProvider?.();
}

// ─────────────────────────────────────────────────────────────────────
// The plugin roster
// ─────────────────────────────────────────────────────────────────────
//
// Which bundles were live, and at what version. Populated by the load guard
// for EVERY bundle it met — including one that threw, which is exactly the
// case where a reader most needs to know the plugin was present at all.

const loadedPlugins = new Map<string, BundlePlugin>();

export function notePluginLoaded(
  id: string,
  version: string,
  active: boolean,
): void {
  loadedPlugins.set(id, { id, version, active });
}

export function getLoadedPlugins(): BundlePlugin[] {
  return [...loadedPlugins.values()].sort((a, b) => a.id.localeCompare(b.id));
}
