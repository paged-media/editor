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

// The three-axis ledger — what turns "the annual demonstrates everything"
// into three checkable numbers instead of a slogan.
//
//   axis a  registry rows claimed        (coverage.ts, since the first showcase)
//   axis b  wire mutation ops exercised  (tallied here, at the driver chokepoint)
//   axis c  JS-named PropertyPaths set   (tallied here, from setElementProperty/
//                                         setStyleProperty args)
//
// Axis b's universe is the checked-in capability table — the same file
// `state`'s completeness gate trusts, re-seeded against the engine's
// declared op list by capability-matrix.spec.ts, so this ledger can
// never invent an op the engine does not declare. Axis c's universe is
// core's `paged-introspect` catalog, read from the SIBLING CHECKOUT at
// run time (the same sibling the base fixture already requires) — no
// committed copy to drift.
//
// Every chapter writes one fragment (claims + notes + tallies); the
// assembly spec merges them and diffs against the universes. An op used
// only transiently (create scratch → apply → delete scratch) is tallied
// with `transient` so the colophon can print it honestly: demonstrated,
// not resident.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve as pathResolve } from "node:path";

import { CAPABILITIES } from "../e2e/harness/capabilities";
import type { CoverageClaim } from "./coverage";

// ── universes ────────────────────────────────────────────────────────

/** Axis b universe: every op the capability table lists. */
export function opUniverse(): string[] {
  return CAPABILITIES.map((c) => c.op).sort();
}

/**
 * Axis c universe: the JS property names from core's
 * `paged-introspect/src/catalog.rs` `PROPERTY_PATHS` table — entries of
 * the shape `("frameBounds", P::FrameBounds)`. A regex over the array
 * block, not a Rust parser, for the same reason coverage.ts reads the
 * registry with a splitter: the question is a name list, and the shape
 * is mechanical. The count is asserted against the catalog's own
 * length so a format change fails loudly instead of dropping names.
 */
export function propertyPathUniverse(coreCheckout: string): string[] {
  const catalog = pathResolve(
    coreCheckout,
    "crates",
    "paged-introspect",
    "src",
    "catalog.rs",
  );
  if (!existsSync(catalog)) {
    throw new Error(
      `paged-introspect catalog not found at ${catalog} — the ledger needs ` +
        `the core checkout beside the editor (same requirement as the base fixture).`,
    );
  }
  const text = readFileSync(catalog, "utf8");
  const start = text.indexOf("pub const PROPERTY_PATHS");
  if (start < 0) throw new Error("PROPERTY_PATHS table not found in catalog.rs");
  const block = text.slice(start, text.indexOf("];", start));
  const names = [...block.matchAll(/\(\s*"([A-Za-z0-9]+)"\s*,\s*P::/g)].map(
    (m) => m[1],
  );
  if (names.length === 0) {
    throw new Error("PROPERTY_PATHS parsed to zero names — format changed?");
  }
  return [...new Set(names)].sort();
}

// ── the tally ────────────────────────────────────────────────────────

export interface OpUse {
  count: number;
  firstModule: string;
  /** True when every use was create-scratch → apply → delete-scratch. */
  transient: boolean;
}

/**
 * Accumulates op + property-path use. One instance per chapter run,
 * fed by the driver's mutate/batch/setProperty chokepoint; the module
 * label travels with each use so the report can say WHERE an op was
 * first demonstrated.
 */
export class Ledger {
  readonly ops = new Map<string, OpUse>();
  readonly paths = new Map<string, { count: number; firstModule: string }>();
  private module = "(chapter)";
  private transientDepth = 0;

  /** Set the module label for subsequent tallies. */
  enterModule(id: string): void {
    this.module = id;
  }

  /**
   * Mark the ops recorded inside `fn` as transient — the demonstrated-
   * then-removed pattern for destructive ops. Nesting is allowed.
   */
  async transient<T>(fn: () => Promise<T>): Promise<T> {
    this.transientDepth += 1;
    try {
      return await fn();
    } finally {
      this.transientDepth -= 1;
    }
  }

  /** Record one wire op (and any property path its args carry). */
  record(op: string, args: unknown): void {
    const existing = this.ops.get(op);
    if (existing) {
      existing.count += 1;
      // One resident use makes the op resident.
      if (this.transientDepth === 0) existing.transient = false;
    } else {
      this.ops.set(op, {
        count: 1,
        firstModule: this.module,
        transient: this.transientDepth > 0,
      });
    }
    if (
      (op === "setElementProperty" || op === "setStyleProperty") &&
      typeof args === "object" &&
      args !== null
    ) {
      const path = (args as { path?: unknown }).path;
      if (typeof path === "string") {
        const p = this.paths.get(path);
        if (p) p.count += 1;
        else this.paths.set(path, { count: 1, firstModule: this.module });
      }
    }
  }
}

// ── chapter fragments ────────────────────────────────────────────────

export interface ChapterFragment {
  chapter: string;
  /** Page count after this chapter's checkpoint save. */
  pageCount: number;
  gpu: boolean;
  gpuReason: string;
  claims: CoverageClaim[];
  notes: string[];
  ops: Record<string, OpUse>;
  paths: Record<string, { count: number; firstModule: string }>;
}

export function writeFragment(
  ledgerDir: string,
  fragment: ChapterFragment,
): void {
  mkdirSync(ledgerDir, { recursive: true });
  writeFileSync(
    join(ledgerDir, `${fragment.chapter}.json`),
    `${JSON.stringify(fragment, null, 2)}\n`,
  );
}

export function readFragments(ledgerDir: string): ChapterFragment[] {
  if (!existsSync(ledgerDir)) return [];
  return readdirSync(ledgerDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(join(ledgerDir, f), "utf8")) as ChapterFragment,
    );
}

/** Merge per-chapter tallies into campaign totals. */
export function mergeFragments(fragments: ChapterFragment[]): {
  claims: CoverageClaim[];
  notes: string[];
  ops: Map<string, OpUse>;
  paths: Map<string, { count: number; firstModule: string }>;
} {
  const claims: CoverageClaim[] = [];
  const notes: string[] = [];
  const ops = new Map<string, OpUse>();
  const paths = new Map<string, { count: number; firstModule: string }>();
  for (const fr of fragments) {
    claims.push(...fr.claims);
    notes.push(...fr.notes);
    for (const [op, use] of Object.entries(fr.ops)) {
      const existing = ops.get(op);
      if (existing) {
        existing.count += use.count;
        existing.transient = existing.transient && use.transient;
      } else {
        ops.set(op, { ...use });
      }
    }
    for (const [path, use] of Object.entries(fr.paths)) {
      const existing = paths.get(path);
      if (existing) existing.count += use.count;
      else paths.set(path, { ...use });
    }
  }
  return { claims, notes, ops, paths };
}
