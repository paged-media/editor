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

// The exclusion ledger — the OTHER half of "every shipped registry row
// is accounted for".
//
// The annual's coverage goal is not "claim many rows"; it is that every
// shipped row is either CLAIMED by a page module or EXCLUDED here with
// a reason and, where one exists, the companion spec that exercises it
// outside the document. Categories:
//
//   app-shell      editor chrome/panels/tools — exercised by the surface
//                  gate (`scripts/surface-coverage.mjs`) and panel specs,
//                  not demonstrable inside a document artifact
//   exit-path      importers that REPLACE the document (paged.pdf,
//                  publish's IDML open) — exercised by their journeys
//   session-only   SceneLayer / modal-session render state that does not
//                  persist into `.paged` — exercised by journeys-gpu
//   infrastructure server / CI / corpus / parser-internals rows — not
//                  document behaviour at all
//   by-design      not-modelled-by-declaration families (tagged XML,
//                  interactivity…) — the Limits appendix documents them
//
// Prefix rules cover whole families; row rules override for specific
// ids. The assembly gate consumes this via `classifyRow`.
//
// NOTE: the full-registry closure gate arms only when the annual's
// chapters land (EXCLUSIONS_COMPLETE); until then unclaimed-and-
// unexcluded rows are REPORTED, not failed, so the machinery migration
// stays green at the 16-page showcase's coverage numbers.

export type ExclusionCategory =
  | "app-shell"
  | "exit-path"
  | "session-only"
  | "infrastructure"
  | "by-design";

export interface Exclusion {
  category: ExclusionCategory;
  reason: string;
  /** Spec/journey that exercises the row outside the document, if any. */
  companion?: string;
}

/** Flip to true when every annual chapter has landed and the ledger
 *  below has been completed against the full registry. */
export const EXCLUSIONS_COMPLETE = false;

/** Family-prefix exclusions (matched on `family` = id up to the first dot). */
export const FAMILY_EXCLUSIONS: Record<string, Exclusion> = {
  "editor-shell": {
    category: "app-shell",
    reason: "editor chrome — every panel/tool/keybinding id is ratcheted by the surface gate",
    companion: "scripts/surface-coverage.mjs",
  },
  "editor-tools": {
    category: "app-shell",
    reason: "tool rail behaviour — exercised by the tools journeys",
    companion: "tests/journey/focused/tools*.spec.ts",
  },
  server: {
    category: "infrastructure",
    reason: "editor-server rows — no document artifact involvement",
  },
  "test-corpus": {
    category: "infrastructure",
    reason: "corpus/fidelity lane bookkeeping, not document behaviour",
  },
};

/** Per-row exclusions (override family rules). Filled chapter by
 *  chapter as the annual lands; the assembly report prints the rows
 *  still unaccounted so each wave shrinks the list knowingly. */
export const ROW_EXCLUSIONS: Record<string, Exclusion> = {
  "plugin-pdf.importer": {
    category: "exit-path",
    reason: "PDF import replaces the open document by design — cannot appear as a page of this one",
    companion: "tests/journey/plugins/pdf.journey.spec.ts",
  },
};

export function classifyRow(id: string): Exclusion | null {
  const row = ROW_EXCLUSIONS[id];
  if (row) return row;
  const family = id.split(".")[0];
  return FAMILY_EXCLUSIONS[family] ?? null;
}
