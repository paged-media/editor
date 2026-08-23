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


// The journal code registry (ADR 025 §1).
//
// Every code the workspace may emit is declared here, with the `data` keys it
// carries and its rate policy. Two properties this file must keep:
//
//   1. APPEND-ONLY. A code is never renamed or repurposed, only added —
//      exactly the contract the engine's `DiagnosticCode` keeps (ADR 007).
//      An exported bundle from an older build must stay readable.
//   2. COMPLETE. `codes.spec.ts` greps the tree for emitted code literals and
//      fails on any that is missing here, the way `state`'s completeness
//      check guards the capability catalog.
//
// Shape: `<area>.<thing>.<outcome>`. Areas are the origins plus `journal`
// itself (the subsystem reporting on its own blindness).

import type { JournalSeverity } from "./entry";

export type CodePolicy =
  | { mode: "always" }
  /** Identical consecutive records inside the window fold into the first,
   *  which accumulates `data.n`. */
  | { mode: "coalesce"; windowMs: number }
  /** Keep 1 in `every`; the survivor is stamped `data.sampled`. */
  | { mode: "sample"; every: number }
  /** Never recorded individually — one rollup per window carrying
   *  `{ n, avgMs, maxMs }`. */
  | { mode: "aggregate"; windowMs: number };

export interface CodeSpec {
  /** What this event means, in one line. This is the text a viewer renders
   *  INSTEAD of a `message` field — which is the whole reason there is no
   *  `message` field. */
  text: string;
  policy: CodePolicy;
  /** `data` keys this code may carry. Checked against FORBIDDEN_KEYS by test. */
  data?: readonly string[];
  /** Typical severity, for documentation; the emitter still decides. */
  severity?: JournalSeverity;
}

const ALWAYS: CodePolicy = { mode: "always" };

/**
 * THE REGISTRY.
 *
 * Rate policies are chosen against one question: "if this fires as fast as it
 * possibly can, does the buffer still hold a useful minute?" User-paced events
 * (commands, activation, crashes) are `always` — they are the highest-value
 * signal in the app and they cannot storm. Machine-paced events (dispatch,
 * frames) are `aggregate` — one rollup per second, never individually.
 */
export const CODES: Readonly<Record<string, CodeSpec>> = {
  // ── engine ────────────────────────────────────────────────────────────
  "engine.load.parse": {
    text: "IDML parsed into the scene model",
    policy: ALWAYS,
    data: ["bytes", "pages"],
  },
  "engine.load.build": {
    text: "Document built (layout + emit)",
    policy: ALWAYS,
    data: ["pages", "paragraphs"],
  },
  "engine.load.post": {
    text: "Post-build indexing finished",
    policy: ALWAYS,
  },
  "engine.rebuild": {
    text: "Document rebuilt after a mutation",
    policy: { mode: "coalesce", windowMs: 500 },
    data: ["pages", "paragraphs", "rebuilds", "hits", "misses", "opApplyMs"],
  },
  "engine.dispatch": {
    text: "A wire command was handled by the engine",
    policy: { mode: "aggregate", windowMs: 1000 },
    data: ["kind", "n", "avgMs", "maxMs"],
  },
  "engine.render.diagnostic": {
    text: "The renderer reported a lossy or degraded outcome",
    policy: { mode: "coalesce", windowMs: 1000 },
    data: ["code", "n"],
    severity: "warn",
  },
  "engine.tracing.rollup": {
    text: "Rust tracing events fired and were dropped (text not carried)",
    policy: { mode: "aggregate", windowMs: 5000 },
    data: ["debug", "info", "warn", "error", "n"],
  },

  // ── worker ────────────────────────────────────────────────────────────
  "worker.init.failed": {
    text: "The render worker failed to initialise",
    policy: ALWAYS,
    data: ["error"],
    severity: "error",
  },
  "worker.protocol.mismatch": {
    text: "Engine and editor disagree about the wire protocol version",
    policy: ALWAYS,
    data: ["engine", "editor"],
    severity: "error",
  },
  "worker.sab.drift": {
    text: "The SharedArrayBuffer layout contract drifted between Rust and TS",
    policy: ALWAYS,
    severity: "error",
  },
  "worker.dispatch.error": {
    text: "A worker message handler threw",
    policy: ALWAYS,
    data: ["kind", "error"],
    severity: "error",
  },
  "worker.frame": {
    text: "Frames presented",
    policy: { mode: "aggregate", windowMs: 1000 },
    data: ["n", "avgMs", "maxMs", "gpu"],
  },

  // ── client ────────────────────────────────────────────────────────────
  "client.send": {
    text: "A command was sent to the worker and replied",
    policy: { mode: "aggregate", windowMs: 1000 },
    data: ["kind", "n", "avgMs", "maxMs"],
  },
  "client.reply.orphan": {
    text: "A reply arrived with no pending request — it was discarded",
    policy: { mode: "coalesce", windowMs: 2000 },
    data: ["n"],
    severity: "warn",
  },
  "client.pending.stalled": {
    text: "A request has been waiting an unusually long time (not yet failed)",
    policy: ALWAYS,
    data: ["kind", "waitedMs"],
    severity: "warn",
  },
  "client.pending.abandoned": {
    text: "A request was abandoned — the worker never replied",
    policy: ALWAYS,
    data: ["kind", "waitedMs"],
    severity: "error",
  },

  // ── shell ─────────────────────────────────────────────────────────────
  "shell.command": {
    text: "A command was invoked",
    policy: ALWAYS,
    data: ["id", "plugin", "ok", "error"],
  },
  "shell.gesture": {
    text: "A canvas gesture was committed",
    policy: ALWAYS,
    data: ["tool", "updates", "ok"],
  },
  "shell.fps": {
    text: "Main-thread responsiveness sample",
    policy: { mode: "aggregate", windowMs: 5000 },
    data: ["n", "avgMs", "maxMs"],
  },
  "shell.panel.crash": {
    text: "A React subtree threw and was replaced by the error boundary",
    policy: ALWAYS,
    data: ["label", "error"],
    severity: "error",
  },
  "shell.window.error": {
    text: "An uncaught error reached window.onerror",
    policy: ALWAYS,
    data: ["error"],
    severity: "error",
  },
  "shell.promise.unhandled": {
    text: "A promise rejection went unhandled",
    policy: ALWAYS,
    data: ["error"],
    severity: "error",
  },

  // ── plugin ────────────────────────────────────────────────────────────
  "plugin.activate": {
    text: "A plugin bundle activated (or failed to)",
    policy: ALWAYS,
    data: ["ok", "error"],
  },
  "plugin.log": {
    text: "A plugin log line (censused: severity + site hash, never the text)",
    policy: { mode: "coalesce", windowMs: 2000 },
    data: ["level", "site", "n"],
  },
  "plugin.contribute": {
    text: "A plugin registered a contribution",
    policy: { mode: "coalesce", windowMs: 1000 },
    data: ["door", "id", "n"],
  },
  "plugin.command": {
    text: "A plugin command handler ran",
    policy: ALWAYS,
    data: ["id", "ok", "error"],
  },
  "plugin.gesture": {
    text: "A plugin tool committed a gesture",
    policy: ALWAYS,
    data: ["tool", "ok", "error"],
  },
  "plugin.mutate": {
    text: "A plugin wrote to the document",
    policy: { mode: "sample", every: 8 },
    data: ["ok", "reason", "sampled"],
  },
  "plugin.capability.denied": {
    text: "A plugin used a door it did not declare in its manifest",
    policy: ALWAYS,
    data: ["door"],
    severity: "warn",
  },
  "plugin.diagnostics.published": {
    text: "A plugin published document diagnostics (counts only)",
    policy: { mode: "coalesce", windowMs: 1000 },
    // `slot` is a siteHash of the bundle-chosen diagnostics key, NOT the key
    // itself: `DiagnosticsSurface.set(key, …)` takes a free-form string and
    // bundles legitimately pass frame ids and file-ish names through it.
    // Hashing keeps the grouping and drops the content.
    data: ["slot", "errors", "warnings", "infos", "n"],
  },

  // ── journal (the subsystem on itself) ─────────────────────────────────
  "journal.evicted": {
    text: "Entries were overwritten by the ring",
    policy: { mode: "coalesce", windowMs: 10000 },
    data: ["n"],
  },
  "journal.rejected": {
    text: "A data value was dropped for failing the identifier rule — this is a bug in the emitting code",
    policy: { mode: "coalesce", windowMs: 10000 },
    data: ["n"],
    severity: "warn",
  },
  "journal.drain.failed": {
    text: "A worker drain failed — an unknown number of entries are missing",
    policy: ALWAYS,
    data: ["error"],
    severity: "warn",
  },
};

/**
 * The policy for a code. An UNREGISTERED code still records (`always`) rather
 * than being dropped: losing a signal because someone forgot a registry entry
 * would be exactly the silent-drop failure this subsystem exists to prevent.
 * The completeness test is what keeps the registry honest, not the runtime.
 */
export function policyFor(code: string): CodePolicy {
  return CODES[code]?.policy ?? ALWAYS;
}

/** Human text for a code — what a viewer renders instead of a `message`. */
export function textFor(code: string): string {
  return CODES[code]?.text ?? code;
}

export function isRegistered(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(CODES, code);
}
