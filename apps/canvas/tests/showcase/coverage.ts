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

// The coverage manifest — what makes "shows all the functionality" a
// checkable claim instead of a slogan.
//
// `state/registry/features/*.yaml` is the project's own enumeration of
// what exists: 39 families, ~571 rows, each with a per-stage status.
// Every showcase page module declares the rows it demonstrates; this
// resolves those ids against the registry and refuses two things:
//
//   · a claimed row that does not exist — a typo, or a row that was
//     renamed out from under the page;
//   · a claimed row that the registry does not mark `shipped` in any
//     stage — the document must not advertise something the project
//     itself records as planned.
//
// The result is written next to the artifacts so a reader can ask the
// document what it proves and get an answer that was checked.
//
// The registry lives in a SIBLING repo, so the whole gate degrades to
// a warning when that checkout is absent (a fresh clone of the editor
// alone). Absent evidence is reported as absent, never as a pass.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface RegistryRow {
  id: string;
  title?: string;
  /** True when ANY stage records `shipped`. See `loadRegistry`. */
  shipped: boolean;
}

export interface CoverageClaim {
  /** Module id, e.g. `06-vector`. */
  module: string;
  title: string;
  pages: number[];
  covers: string[];
  notes?: string[];
}

export interface CoverageReport {
  generatedFrom: string;
  registryFound: boolean;
  registryRows: number;
  claimedRows: number;
  claims: CoverageClaim[];
  /** Claimed ids absent from the registry — always a failure. */
  unknown: string[];
  /** Claimed ids the registry does not mark shipped anywhere. */
  notShipped: string[];
  /** Families the showcase touches, with how many rows in each. */
  families: Record<string, number>;
}

/**
 * Load every registry row, keyed by id. Empty when the sibling repo is
 * not checked out.
 *
 * This reads the registry files by SPLITTING them into per-row blocks
 * and asking two questions of each: what is the `id`, and does any
 * stage say `shipped`. That is deliberately narrower than parsing
 * YAML, and it is narrow because the files mix block maps, flow maps
 * (`core.parser: { status: shipped }`) and multi-line block scalars in
 * the notes — a line-oriented reader that looked for `^\s+status:`
 * would silently miss every flow-style stage and report almost nothing
 * as shipped. Searching the whole block for `status: shipped` handles
 * every style the registry actually uses.
 *
 * The cost of the shortcut is stated rather than hidden: this cannot
 * tell you WHICH stage shipped, only that one did, and a `note:` whose
 * prose contained the literal text `status: shipped` would fool it. No
 * note does today, and the alternative was adding a YAML parser to the
 * editor's dependency tree to answer a yes/no question in a test.
 */
export function loadRegistry(registryDir: string): Map<string, RegistryRow> {
  const out = new Map<string, RegistryRow>();
  if (!existsSync(registryDir)) return out;
  for (const file of readdirSync(registryDir)) {
    if (!file.endsWith(".yaml")) continue;
    const text = readFileSync(join(registryDir, file), "utf8");
    // Rows start at column 0 with `- id:`; everything up to the next
    // such line belongs to that row, notes and all.
    const parts = text.split(/^- id:[ \t]*/m).slice(1);
    for (const part of parts) {
      const id = (/^\S+/.exec(part)?.[0] ?? "").replace(/^["']|["']$/g, "");
      if (!id) continue;
      const title = /^\s+title:[ \t]*(.+)$/m
        .exec(part)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, "");
      out.set(id, {
        id,
        title,
        shipped: /status:\s*["']?shipped/.test(part),
      });
    }
  }
  return out;
}

export function buildCoverage(
  registryDir: string,
  claims: CoverageClaim[],
): CoverageReport {
  const registry = loadRegistry(registryDir);
  const unknown: string[] = [];
  const notShipped: string[] = [];
  const families: Record<string, number> = {};
  const seen = new Set<string>();

  for (const claim of claims) {
    for (const id of claim.covers) {
      seen.add(id);
      const family = id.split(".")[0];
      families[family] = (families[family] ?? 0) + 1;
      if (registry.size === 0) continue;
      const row = registry.get(id);
      if (!row) {
        unknown.push(`${claim.module} → ${id}`);
        continue;
      }
      if (!row.shipped) notShipped.push(`${claim.module} → ${id}`);
    }
  }

  return {
    generatedFrom: registryDir,
    registryFound: registry.size > 0,
    registryRows: registry.size,
    claimedRows: seen.size,
    claims,
    unknown,
    notShipped,
    families,
  };
}
