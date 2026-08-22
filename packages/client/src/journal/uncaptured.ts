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


// The uncaptured ledger (ADR 025 §8) — what the journal CANNOT see.
//
// This is a direct generalisation of `UncapturedTally` in
// `packages/shell/src/actions/model.ts`, from "what the action recorder
// missed" to "what the journal cannot see". The rule there applies verbatim
// here:
//
//   A silent drop would produce a false picture. A counted drop is a fact
//   on screen.
//
// Two kinds of blindness, handled differently:
//
//   · COUNTED  — runtime facts. Numbers that accrue while the app runs.
//   · DECLARED — static facts. Things that are structurally invisible, listed
//                once with why and what fixing them would cost.
//
// Both are rendered in the Journal panel AND embedded in the export. The
// panel's "What this cannot see" section is PERMANENTLY VISIBLE, not behind a
// disclosure triangle — the whole point is that a reader of an exported
// bundle must not mistake absence of evidence for evidence of absence.

/** Runtime blindness. Every field is a count, and every count has a reason a
 *  reader can act on. */
export interface UncapturedLedger {
  /** Entries overwritten by the ring. Recorded, then lost to capacity. */
  evicted: number;
  /** Entries folded into another by a coalesce/sample/aggregate policy. The
   *  survivor carries `data.n` / `data.sampled`, so the COUNT is never lost —
   *  only the individual entries are. */
  collapsed: number;
  /** `data` values dropped by `IDENT_RE` or an unsupported type. Non-zero is
   *  A BUG IN THE EMITTING CODE, not user noise, and the panel says so: it
   *  means somebody tried to journal a path, a sentence or an object. */
  rejectedData: number;
  /** Gesture updates written to the SAB and DELIBERATELY not journaled
   *  individually (ADR 025 §7). The denominator for "what actually happened"
   *  behind a single `shell.gesture` entry. NOT A GAP — a decision. */
  sabGestureUpdates: number;
  /** Camera writes to the SAB, same deal. */
  sabCameraWrites: number;
  /** Rust `tracing` events that fired and were DROPPED because no shipped
   *  subscriber carries their text (ADR 025 §3 / the CountingLayer). We
   *  cannot safely surface the strings, so we count them and say so. */
  engineTracing: { debug: number; info: number; warn: number; error: number };
  /** Worker entries evicted before a drain reached them. */
  workerDropped: number;
  /** Drains that failed or timed out — meaning the merged view is missing an
   *  UNKNOWN number of engine/worker entries. Unknown, not zero. */
  drainFailures: number;
  /** Plugin log lines recorded as a census (severity + site hash) with their
   *  text deliberately withheld. */
  pluginLogCensus: number;
}

export function emptyLedger(): UncapturedLedger {
  return {
    evicted: 0,
    collapsed: 0,
    rejectedData: 0,
    sabGestureUpdates: 0,
    sabCameraWrites: 0,
    engineTracing: { debug: 0, info: 0, warn: 0, error: 0 },
    workerDropped: 0,
    drainFailures: 0,
    pluginLogCensus: 0,
  };
}

/** Fold one ledger into another — used when the worker's drained ledger
 *  merges into the shell's. Pure; neither input is mutated. */
export function mergeLedger(
  a: UncapturedLedger,
  b: UncapturedLedger,
): UncapturedLedger {
  return {
    evicted: a.evicted + b.evicted,
    collapsed: a.collapsed + b.collapsed,
    rejectedData: a.rejectedData + b.rejectedData,
    sabGestureUpdates: a.sabGestureUpdates + b.sabGestureUpdates,
    sabCameraWrites: a.sabCameraWrites + b.sabCameraWrites,
    engineTracing: {
      debug: a.engineTracing.debug + b.engineTracing.debug,
      info: a.engineTracing.info + b.engineTracing.info,
      warn: a.engineTracing.warn + b.engineTracing.warn,
      error: a.engineTracing.error + b.engineTracing.error,
    },
    workerDropped: a.workerDropped + b.workerDropped,
    drainFailures: a.drainFailures + b.drainFailures,
    pluginLogCensus: a.pluginLogCensus + b.pluginLogCensus,
  };
}

/** True when nothing has been missed — lets the panel say "nothing uncaptured"
 *  positively instead of rendering nine zeroes. */
export function ledgerIsClean(l: UncapturedLedger): boolean {
  return (
    l.evicted === 0 &&
    l.collapsed === 0 &&
    l.rejectedData === 0 &&
    l.sabGestureUpdates === 0 &&
    l.sabCameraWrites === 0 &&
    l.engineTracing.debug === 0 &&
    l.engineTracing.info === 0 &&
    l.engineTracing.warn === 0 &&
    l.engineTracing.error === 0 &&
    l.workerDropped === 0 &&
    l.drainFailures === 0 &&
    l.pluginLogCensus === 0
  );
}

/** A structural blind spot: something the journal cannot see at all, stated
 *  once with the reason and the price of fixing it. */
export interface BlindSpot {
  /** Stable id so a reader can diff two bundles. */
  id: string;
  what: string;
  why: string;
  wouldCost: string;
}

/**
 * The declared blind spots, embedded verbatim in every exported bundle.
 *
 * Each of these was verified in the tree, not guessed. Keep this list honest:
 * when one is fixed, DELETE the row rather than editing it into a half-truth,
 * and when a new one is discovered, add it in the same commit that discovers
 * it.
 */
export const KNOWN_BLIND_SPOTS: readonly BlindSpot[] = [
  {
    id: "engine-panic",
    what: "An engine panic is not recorded at all.",
    why:
      "The wasm worker builds with panic=abort, so there is no unwind and no " +
      "hook output the journal can reach. The only evidence is that replies " +
      "stopped arriving, which surfaces as client.pending.abandoned.",
    wouldCost: "panic=unwind (size + perf) or a worker supervisor process.",
  },
  {
    id: "pdf-import-no-panic-hook",
    what: "A panic in the paged.pdf import wasm produces no output whatsoever.",
    why:
      "plugin-publish's pdf-import crate installs no console_error_panic_hook, " +
      "unlike the other four plugin wasm crates. Not even a console line.",
    wouldCost: "One line in that crate's init.",
  },
  {
    id: "wasm-error-flattening",
    what: "Plugin wasm errors reach the journal as a bare kind, not a cause.",
    why:
      "Five wasm crates flatten structured Rust errors through " +
      "JsValue::from_str(&e.to_string()), so the structure is destroyed at the " +
      "boundary before anything can read it.",
    wouldCost: "A structured error enum across each wasm boundary.",
  },
  {
    id: "sab-hot-path",
    what: "Individual gesture and camera updates are never journaled.",
    why:
      "They cross a SharedArrayBuffer on an 8 ms drain, and journaling them " +
      "would cost more than the work they describe. THIS IS A DECISION, NOT A " +
      "GAP: the count survives on the single entry recorded at commit, and in " +
      "the ledger's sabGestureUpdates / sabCameraWrites.",
    wouldCost: "Nothing worth paying — the aggregate is the right shape.",
  },
  {
    id: "plugin-log-census",
    what: "Plugin log TEXT is withheld; only severity and a site hash appear.",
    why:
      "host.log is free text across ~900 call sites and routinely carries " +
      "document content, font names and paths. The journal censuses it " +
      "instead of mirroring it (ADR 025 §5).",
    wouldCost:
      "Nothing — reproduce with the browser console open to read the text.",
  },
  {
    id: "subms-duration",
    what: "Some engine durations read as 0 ms.",
    why:
      "Browsers clamp Date.now(), which the wasm clock currently uses, so a " +
      "sub-millisecond dispatch cannot be distinguished from an instant one.",
    wouldCost:
      "Switching the injected wasm Clock to performance.now() — one line.",
  },
  {
    id: "mutation-intent",
    what: "Typing and panel field edits carry no intent.",
    why:
      "The catalog binding hook and ~20 hand-written panels call client.mutate " +
      "directly rather than going through the command registry, so the journal " +
      "knows a mutation happened but not which surface caused it. This is the " +
      "same gap the action recorder documents in shell/src/actions/model.ts.",
    wouldCost: "Routing panel edits through commands, or a mutation-source tag.",
  },
  {
    id: "single-error-boundary",
    what: "A panel crash and a whole-shell crash look identical.",
    why:
      "There is exactly one React error boundary, at the shell root, so any " +
      "component throw replaces the entire surface.",
    wouldCost: "Per-panel error boundaries.",
  },
];
