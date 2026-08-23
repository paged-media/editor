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

// WHERE THE ACTION LIST LIVES, AND WHY.
//
// Three candidates, and the choice is not obvious:
//
//   1. `host.storage` — the plugin door. Per-plugin localStorage.
//      Ruled out on identity, not capability: Actions is HOST code
//      (it taps the shell's own command registry), so it has no plugin
//      to be scoped to. It would be borrowing another feature's key
//      namespace.
//
//   2. The `.paged` container part store — document-resident, travels
//      with the file, survives a browser profile change. Ruled out on
//      PURPOSE. An action's whole value is applying it to documents it
//      was NOT recorded in; the "record once, run over 200 files" case
//      is the case. Keeping the list inside a document makes it
//      reachable only while that document is open, which inverts the
//      tool. Note the two prior-art suites agree: Illustrator keeps
//      actions in the application palette and in `.aia` files,
//      Photoshop in `.atn` — neither puts them inside the artwork.
//
//   3. App-level localStorage — CHOSEN. It matches how the shell
//      already keeps app-scoped state (`paged.theme`,
//      `paged.workflow-mode`, `paged.layout.mode.*`,
//      `paged.palette.recents.v1`, the tool rail's last-used map,
//      the export-PDF options), and app-scoped is exactly what an
//      action is.
//
// The honest cost of (3) is that localStorage is per-origin, unsynced
// and clearable — an action list is not a durable asset. That is why
// export/import to a JSON file ships in the same commit rather than
// "later": the file is both the backup and the sharing mechanism, the
// role `.aia` plays for Illustrator.
//
// The case FOR (2) that is NOT being dismissed: an action baked into a
// document as a reproducible recipe (a data-merge template that
// regenerates its own pages). That is a different feature — document
// automation, whose home is the composition part, not an app-level
// palette — and it should not be smuggled in by choosing storage for
// this one.

import {
  ACTIONS_SCHEMA_VERSION,
  EMPTY_LIBRARY,
  parseLibrary,
  type ActionLibrary,
  type PagedAction,
} from "./model";

export const ACTIONS_STORAGE_KEY = "paged.actions.v1";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Private-mode / blocked storage. The feature degrades to
    // in-memory for the session rather than throwing at mount.
    return null;
  }
}

export function loadLibrary(): ActionLibrary {
  const store = storage();
  if (!store) return EMPTY_LIBRARY;
  try {
    const raw = store.getItem(ACTIONS_STORAGE_KEY);
    if (!raw) return EMPTY_LIBRARY;
    return parseLibrary(JSON.parse(raw));
  } catch {
    return EMPTY_LIBRARY;
  }
}

/** Returns false when the write was refused (quota, blocked storage)
 *  so the caller can say so instead of pretending it saved. */
export function saveLibrary(library: ActionLibrary): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

/** The exported file body — one or more actions, same schema as the
 *  stored library so an export can be re-imported without conversion. */
export function serializeForExport(actions: PagedAction[]): string {
  const library: ActionLibrary = {
    schema: ACTIONS_SCHEMA_VERSION,
    actions,
  };
  return JSON.stringify(library, null, 2);
}

/** Parse an imported file. Invalid actions are dropped, not repaired
 *  (see `parseLibrary`); the caller compares counts to report loss. */
export function parseImport(text: string): PagedAction[] {
  try {
    return parseLibrary(JSON.parse(text)).actions;
  } catch {
    return [];
  }
}
