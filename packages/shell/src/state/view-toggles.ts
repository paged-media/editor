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

// B4 — View-menu toggles that an OVERLAY reads and a COMMAND flips.
//
// A module-scope store rather than a context, for the reason
// `open-file-handle.ts` gives: the writer is a command registered once
// at startup and the reader is an overlay mounted inside the canvas's
// SVG. Threading a boolean between them through React state would mean
// a provider that exists for one value and renders nothing, and the
// value has to survive a dock close/reopen, which module scope does for
// free.
//
// `useSyncExternalStore` rather than an event + local state, because the
// overlay must re-render the instant the command flips the flag — and
// that is exactly the hook's contract. Getting this wrong is not
// hypothetical: Phase E shipped 0 accelerators because a `useMemo` was
// keyed on a registry whose identity never changes while its contents
// grow. A subscription that the store itself notifies cannot drift that
// way.

export type ViewToggle = "textThreads";

type Listener = () => void;

const state: Record<ViewToggle, boolean> = {
  // Off by default. The thread lines are a diagnostic view, not chrome
  // the document always wears — InDesign hides them behind
  // View ▸ Extras ▸ Show Text Threads for the same reason.
  textThreads: false,
};

const listeners = new Set<Listener>();

export function getViewToggle(which: ViewToggle): boolean {
  return state[which];
}

export function setViewToggle(which: ViewToggle, on: boolean): void {
  if (state[which] === on) return;
  state[which] = on;
  for (const l of listeners) l();
}

export function toggleViewToggle(which: ViewToggle): boolean {
  setViewToggle(which, !state[which]);
  return state[which];
}

export function subscribeViewToggles(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reset — tests only, so one spec's toggle cannot leak into the next.
 *  (The specs share a page instance per file; a leaked `true` would
 *  make the next test pass for the wrong reason.) */
export function resetViewToggles(): void {
  let changed = false;
  for (const k of Object.keys(state) as ViewToggle[]) {
    if (state[k]) {
      state[k] = false;
      changed = true;
    }
  }
  if (changed) for (const l of listeners) l();
}
