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


// The journal envelope (ADR 025). ONE append-only event vocabulary, shared by
// the shell, the client, the render worker, the engine and every plugin.
//
// ─────────────────────────────────────────────────────────────────────
// THE RULE
// ─────────────────────────────────────────────────────────────────────
//
//   Diagnostics describe the DOCUMENT. The journal describes the PROGRAM.
//
// A diagnostic is a STATE keyed to a location in the user's content, it is
// user-actionable, and it belongs on screen next to that content (the
// Problems panel, the overset badge). A journal entry is an EVENT keyed to a
// moment in time, it is developer-actionable, and it belongs in a bounded
// ring buffer. That axis is why the three `Diagnostic` types in this
// workspace are RELATED, not unified — see ADR 025 §3.
//
// ─────────────────────────────────────────────────────────────────────
// WHY THERE IS NO `message: string`
// ─────────────────────────────────────────────────────────────────────
//
// This is the single most important fact about this file. A free-text field
// is where PII leaks in every telemetry system ever built. The `code` IS the
// message; the human sentence lives in a static `code -> text` table on the
// viewer side. A variable goes into `data` as a number or an IDENTIFIER.
//
// The consequence is that redaction here is STRUCTURAL IMPOSSIBILITY rather
// than filtering: document text, file paths, URIs and user prose are not
// "stripped", they are UNREPRESENTABLE. `sanitizeData` below is the one
// chokepoint, and `IDENT_RE` is the one predicate.
//
// Nothing recorded here is ever transmitted. The journal is KEPT, not SENT —
// which is why it is not called telemetry (ADR 025 §1).

/** Ordered so callers can filter (`>= "warn"`); see `SEVERITY_RANK`. */
export type JournalSeverity = "debug" | "info" | "warn" | "error";

/** Where an entry was minted. Closed set — a new origin is a code change. */
export type JournalOrigin =
  | "shell"
  | "client"
  | "worker"
  | "engine"
  | "plugin";

export const SEVERITY_RANK: Readonly<Record<JournalSeverity, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** The only value shapes `data` may carry. Flat and scalar BY DESIGN: it
 *  makes an entry trivially `structuredClone`-able (so the plugin door
 *  proxies unchanged across the future isolate boundary, DESIGN.md §6) and
 *  trivially `BTreeMap<String, JournalValue>` on the Rust side. */
export type JournalValue = number | boolean | string;

export interface JournalEntry {
  /** Monotone per buffer. Ordering is the buffer's, not the clock's. */
  seq: number;
  /** ms since this buffer's epoch — RELATIVE, `performance.now()`-style,
   *  never wall clock. A relative clock is a privacy property: it cannot
   *  correlate a session to a person's timeline. The epoch's wall time
   *  appears ONCE, in the export header, rounded to the hour. */
  t: number;
  origin: JournalOrigin;
  /** Dotted, stable, machine-matchable: `<area>.<thing>.<outcome>`.
   *  APPEND-ONLY CONTRACT, exactly like the engine's `DiagnosticCode`
   *  (ADR 007) — codes are never renamed or repurposed, only added. */
  code: string;
  severity: JournalSeverity;
  /** Manifest id when `origin === "plugin"`. HOST-STAMPED, never
   *  entry-authored: a bundle cannot forge attribution. */
  plugin?: string;
  /** Correlation scalar — the wire seq, the command seq, the gesture handle.
   *  Enough to pair a `started` with its `settled`; deliberately NOT a span
   *  tree, which is a fantasy across a SharedArrayBuffer boundary. */
  corr?: number;
  durMs?: number;
  data?: Record<string, JournalValue>;
}

/** What a caller hands `record()`. `seq`, `t` and `origin` are stamped by the
 *  buffer; `plugin` is stamped by the plugin host. */
export interface JournalInput {
  code: string;
  severity?: JournalSeverity;
  corr?: number;
  durMs?: number;
  data?: Record<string, unknown>;
}

/**
 * The redaction predicate. A `data` STRING value must match this or it is
 * dropped and counted.
 *
 * Lowercase, no spaces, 64 chars max. That is deliberately narrow enough that
 * a file path (`/Users/…`, capitals + `/`), a sentence (spaces), a font family
 * (`Helvetica Neue`), a URI (`://`) or any user prose CANNOT pass. Identifiers
 * that SHOULD pass: `paged.pen`, `media.paged.draw`, `overset_text_dropped`,
 * `chromium`, `k3f9a2b`.
 *
 * Numbers and booleans are always safe and are never tested.
 */
export const IDENT_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

/**
 * Keys no journal code may declare, checked by a unit test over the code
 * registry rather than at runtime. Runtime sanitising already makes the VALUES
 * safe; this list stops a well-meaning `data` key from IMPLYING that user
 * content belongs there in the first place.
 */
export const FORBIDDEN_KEYS: readonly string[] = [
  "email",
  "user",
  "token",
  "key",
  "licence",
  "license",
  "secret",
  "password",
  "path",
  "file",
  "filename",
  "url",
  "uri",
  "name",
  "text",
  "title",
  "content",
  "message",
];

export interface SanitizeResult {
  data?: Record<string, JournalValue>;
  /** Values dropped because they failed `IDENT_RE` or were an unsupported
   *  type. Non-zero is A BUG IN THE EMITTING CODE, not user noise — the
   *  Journal panel says exactly that. */
  rejected: number;
}

/** Bound on how many keys one entry may carry. A runaway `data` map is a
 *  memory leak in a ring buffer that is meant to be predictable. */
export const MAX_DATA_KEYS = 12;

/**
 * The ONE chokepoint through which every `data` map passes. Rejected values
 * are DROPPED AND COUNTED, never truncated — a truncated path is still a
 * path, and a half-sentence is still user text.
 */
export function sanitizeData(
  input: Record<string, unknown> | undefined,
): SanitizeResult {
  if (!input) return { rejected: 0 };
  let rejected = 0;
  let out: Record<string, JournalValue> | undefined;
  let kept = 0;
  for (const key of Object.keys(input)) {
    if (kept >= MAX_DATA_KEYS) {
      rejected += 1;
      continue;
    }
    const value = input[key];
    let safe: JournalValue | undefined;
    if (typeof value === "number") {
      // NaN/Infinity do not survive JSON round-trips; drop rather than emit
      // a `null` the reader would have to guess about.
      safe = Number.isFinite(value) ? value : undefined;
    } else if (typeof value === "boolean") {
      safe = value;
    } else if (typeof value === "string" && IDENT_RE.test(value)) {
      safe = value;
    }
    if (safe === undefined) {
      rejected += 1;
      continue;
    }
    (out ??= {})[key] = safe;
    kept += 1;
  }
  return { data: out, rejected };
}

/**
 * Normalise a MACHINE identifier — a command id, a tool id, a wire message
 * kind, a door name — to the journal's identifier rule.
 *
 * These are code-authored constants from a closed set, never user input, and
 * many of them are camelCase (`paged.chrome.toggleAll`). Lowercasing is
 * lossless for grouping and keeps `data` uniformly safe, so the emit sites
 * that carry such an id route it through here rather than widening `IDENT_RE`
 * — which would also start admitting single-word font families and other
 * document content.
 *
 * Returns `undefined` if the value still does not fit, which means it was not
 * a machine id after all and the caller should not be sending it.
 */
export function identOf(value: string): string | undefined {
  const lowered = value.toLowerCase();
  return IDENT_RE.test(lowered) ? lowered : undefined;
}

/**
 * Reduce an unknown thrown value to a safe identifier — its constructor name,
 * lowercased. `TypeError` becomes `typeerror`. Never the message, never the
 * stack: both routinely carry paths and user content. Stack traces reach the
 * export only through its opt-in, default-OFF `crash` section.
 */
export function errorIdent(err: unknown): string {
  const raw =
    err && typeof err === "object" && typeof err.constructor?.name === "string"
      ? err.constructor.name
      : typeof err;
  const lowered = raw.toLowerCase();
  return IDENT_RE.test(lowered) ? lowered : "unknown";
}

/**
 * FNV-1a 32-bit, base36. Used to CENSUS plugin log lines: it groups repeats of
 * the same message without carrying one character of its content. See ADR 025
 * §5 — the journal is a log census, not a log mirror.
 */
export function siteHash(message: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < message.length; i += 1) {
    h ^= message.charCodeAt(i);
    // FNV prime 16777619, via shifts to stay in 32-bit range.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}
