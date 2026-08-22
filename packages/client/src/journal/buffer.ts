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


// The journal ring buffer (ADR 025 §6/§7).
//
// Bounded, append-only, subscribable. One of these lives on the main thread
// (the shell buffer, 2048) and one inside the render worker (512, drained on
// demand). Nothing here touches the DOM, React or the wire — this file is
// pure enough to run under Node in a unit test, which is how the redaction
// golden test exercises it.
//
// ─────────────────────────────────────────────────────────────────────
// RATE POLICY LIVES HERE, NOT AT THE CALL SITE
// ─────────────────────────────────────────────────────────────────────
//
// A caller cannot forget to throttle, because callers do not throttle: they
// `record()` and the buffer decides. That is deliberate — the alternative
// (every emitter remembering its own budget) is how instrumentation turns
// into a firehose in exactly the paths that matter most.
//
// Whatever a policy collapses, the SURVIVING entry carries the count
// (`data.n`, `data.sampled`) and the ledger counts it too, so the number of
// things that happened is never lost — only the individual entries are. Same
// rule as everywhere else in this subsystem: a counted drop is a fact.

import {
  SEVERITY_RANK,
  errorIdent,
  sanitizeData,
  type JournalEntry,
  type JournalInput,
  type JournalOrigin,
  type JournalSeverity,
  type JournalValue,
} from "./entry";
import { policyFor, type CodePolicy } from "./codes";
import { emptyLedger, type UncapturedLedger } from "./uncaptured";

export interface JournalBufferOptions {
  origin: JournalOrigin;
  /** Ring capacity. 2048 on the shell (~250 KB), 512 in the worker. */
  capacity?: number;
  /** Entries below this are dropped before anything else. `debug` is gated
   *  off by default; `info` and above always record, because a flight
   *  recorder that is off when the bug happens is worthless. */
  minSeverity?: JournalSeverity;
  /** Injected for tests. Defaults to `performance.now()`. */
  now?: () => number;
  /** Injected for tests. Defaults to `Date.now()`, read ONCE at construction
   *  and exposed as `epochWallMs`; entry timestamps stay relative. */
  wallNow?: () => number;
}

interface CoalesceState {
  entry: JournalEntry;
  until: number;
}

interface AggregateState {
  n: number;
  sumMs: number;
  maxMs: number;
  severity: JournalSeverity;
  until: number;
}

export type { CodePolicy };

const DEFAULT_CAPACITY = 2048;

function defaultNow(): number {
  // `performance` exists on the main thread and in workers; the guard is for
  // Node-based unit tests on older runtimes.
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export class JournalBuffer {
  readonly origin: JournalOrigin;
  readonly capacity: number;
  /** Wall time of this buffer's epoch. The ONLY wall clock in the subsystem,
   *  and the export rounds it to the hour before writing it. */
  readonly epochWallMs: number;

  private readonly ring: (JournalEntry | undefined)[];
  private readonly now: () => number;
  private readonly t0: number;
  private readonly minRank: number;
  private readonly listeners = new Set<() => void>();
  private readonly coalescing = new Map<string, CoalesceState>();
  private readonly sampling = new Map<string, number>();
  private readonly aggregating = new Map<string, AggregateState>();

  private head = 0;
  private count = 0;
  private nextSeq = 1;
  private rev = 0;
  private ledger: UncapturedLedger = emptyLedger();
  private snapshot: JournalEntry[] | null = null;

  constructor(options: JournalBufferOptions) {
    this.origin = options.origin;
    this.capacity = Math.max(1, options.capacity ?? DEFAULT_CAPACITY);
    this.ring = new Array<JournalEntry | undefined>(this.capacity);
    this.now = options.now ?? defaultNow;
    this.t0 = this.now();
    this.epochWallMs = (options.wallNow ?? Date.now)();
    this.minRank = SEVERITY_RANK[options.minSeverity ?? "info"];
  }

  /** Record one entry. Never throws: a broken emitter must not break the app
   *  it is watching. */
  record(input: JournalInput): void {
    try {
      this.recordInner(input);
    } catch {
      // A journal that can crash the editor is worse than no journal. There
      // is deliberately nowhere to report this to — reporting it here would
      // be the same recursion.
    }
  }

  private recordInner(input: JournalInput): void {
    const severity = input.severity ?? "info";
    if (SEVERITY_RANK[severity] < this.minRank) return;

    const t = this.now() - this.t0;
    const policy = policyFor(input.code);

    // `aggregate` never records individually.
    if (policy.mode === "aggregate") {
      this.accumulate(input, severity, t, policy.windowMs);
      return;
    }

    if (policy.mode === "sample") {
      const seen = (this.sampling.get(input.code) ?? 0) + 1;
      if (seen % policy.every !== 0) {
        this.sampling.set(input.code, seen);
        this.ledger.collapsed += 1;
        return;
      }
      this.sampling.set(input.code, 0);
    }

    const { data, rejected } = sanitizeData(input.data);
    if (rejected) this.ledger.rejectedData += rejected;

    if (policy.mode === "coalesce") {
      const key = this.coalesceKey(input.code, data);
      const open = this.coalescing.get(key);
      if (open && t < open.until) {
        const d = (open.entry.data ??= {});
        d.n = ((d.n as number) ?? 1) + 1;
        this.ledger.collapsed += 1;
        this.snapshot = null;
        this.emit();
        return;
      }
    }

    const entry: JournalEntry = {
      seq: this.nextSeq++,
      t,
      origin: this.origin,
      code: input.code,
      severity,
    };
    if (input.corr !== undefined) entry.corr = input.corr;
    if (input.durMs !== undefined) entry.durMs = round2(input.durMs);
    if (data) entry.data = data;
    if (policy.mode === "sample") {
      (entry.data ??= {}).sampled = policy.every;
    }

    this.push(entry);

    if (policy.mode === "coalesce") {
      this.coalescing.set(this.coalesceKey(input.code, data), {
        entry,
        until: t + policy.windowMs,
      });
    }
  }

  /** Push an entry minted elsewhere (the worker drain, the engine wire).
   *  Its `origin` and `seq` are preserved; only ring placement is ours. */
  adopt(entry: JournalEntry): void {
    this.push({ ...entry });
  }

  private push(entry: JournalEntry): void {
    if (this.count === this.capacity) this.ledger.evicted += 1;
    this.ring[this.head] = entry;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
    this.snapshot = null;
    this.emit();
  }

  private accumulate(
    input: JournalInput,
    severity: JournalSeverity,
    t: number,
    windowMs: number,
  ): void {
    const open = this.aggregating.get(input.code);
    const dur = input.durMs ?? 0;
    if (open && t < open.until) {
      open.n += 1;
      open.sumMs += dur;
      if (dur > open.maxMs) open.maxMs = dur;
      if (SEVERITY_RANK[severity] > SEVERITY_RANK[open.severity]) {
        open.severity = severity;
      }
      this.ledger.collapsed += 1;
      return;
    }
    if (open) this.flushAggregate(input.code, open);
    this.aggregating.set(input.code, {
      n: 1,
      sumMs: dur,
      maxMs: dur,
      severity,
      until: t + windowMs,
    });
  }

  private flushAggregate(code: string, state: AggregateState): void {
    const data: Record<string, JournalValue> = { n: state.n };
    if (state.maxMs > 0 || state.sumMs > 0) {
      data.avgMs = round2(state.sumMs / state.n);
      data.maxMs = round2(state.maxMs);
    }
    this.push({
      seq: this.nextSeq++,
      t: state.until,
      origin: this.origin,
      code,
      severity: state.severity,
      data,
    });
  }

  /** Emit every pending aggregate immediately. Call before a drain or an
   *  export so an in-flight window is not silently missing from the output. */
  flush(): void {
    for (const [code, state] of this.aggregating) {
      this.flushAggregate(code, state);
    }
    this.aggregating.clear();
    this.coalescing.clear();
  }

  /** Oldest-first. Stable between mutations, so it is safe as a
   *  `useSyncExternalStore` snapshot. */
  entries(): JournalEntry[] {
    if (this.snapshot) return this.snapshot;
    const out: JournalEntry[] = [];
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i += 1) {
      const e = this.ring[(start + i) % this.capacity];
      if (e) out.push(e);
    }
    this.snapshot = out;
    return out;
  }

  /** Entries oldest-first, then CLEAR. Used by the worker drain so entries
   *  are handed over exactly once. */
  take(): JournalEntry[] {
    this.flush();
    const out = this.entries();
    this.ring.fill(undefined);
    this.head = 0;
    this.count = 0;
    this.snapshot = null;
    return out;
  }

  getLedger(): UncapturedLedger {
    return this.ledger;
  }

  /** Fold externally-observed blindness in (SAB write counts, the engine's
   *  dropped-tracing rollup, a failed drain). */
  addUncaptured(patch: Partial<UncapturedLedger>): void {
    const l = this.ledger;
    if (patch.evicted) l.evicted += patch.evicted;
    if (patch.collapsed) l.collapsed += patch.collapsed;
    if (patch.rejectedData) l.rejectedData += patch.rejectedData;
    if (patch.sabGestureUpdates) l.sabGestureUpdates += patch.sabGestureUpdates;
    if (patch.sabCameraWrites) l.sabCameraWrites += patch.sabCameraWrites;
    if (patch.workerDropped) l.workerDropped += patch.workerDropped;
    if (patch.drainFailures) l.drainFailures += patch.drainFailures;
    if (patch.pluginLogCensus) l.pluginLogCensus += patch.pluginLogCensus;
    if (patch.engineTracing) {
      l.engineTracing.debug += patch.engineTracing.debug;
      l.engineTracing.info += patch.engineTracing.info;
      l.engineTracing.warn += patch.engineTracing.warn;
      l.engineTracing.error += patch.engineTracing.error;
    }
    this.emit();
  }

  /** Counts by severity — the HUD badge reads this without walking entries. */
  counts(): Record<JournalSeverity, number> {
    const out: Record<JournalSeverity, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };
    for (const e of this.entries()) out[e.severity] += 1;
    return out;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Monotone revision, bumped on every change (entries AND ledger). The
   *  React binding subscribes to THIS rather than to `entries()`, because a
   *  ledger-only change (an eviction, a counted SAB write) leaves the entry
   *  array identical and would otherwise be invisible to the panel. */
  version(): number {
    return this.rev;
  }

  private emit(): void {
    this.rev += 1;
    for (const l of this.listeners) {
      try {
        l();
      } catch {
        // A subscriber is a bystander — the same posture CommandRegistry
        // takes with a throwing observer.
      }
    }
  }

  private coalesceKey(
    code: string,
    data: Record<string, JournalValue> | undefined,
  ): string {
    if (!data) return code;
    const keys = Object.keys(data).sort();
    let key = code;
    for (const k of keys) {
      if (k === "n") continue;
      key += `|${k}=${String(data[k])}`;
    }
    return key;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Convenience for the many `try { … } catch (err) { record(…) }` sites. */
export function recordThrow(
  buffer: JournalBuffer,
  code: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  buffer.record({
    code,
    severity: "error",
    data: { ...extra, error: errorIdent(err) },
  });
}
