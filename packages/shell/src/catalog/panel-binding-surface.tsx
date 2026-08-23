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

// ADR 023 follow-up — WHICH SHARED PANEL DOES AN EDIT CONTEXT SERVE?
//
// THE DEFECT this answers. `EditContextContribution.panelIds` lets a
// context raise its OWN panels on enter. It was written when every panel
// belonged to exactly one owner, so "raise mine" and "keep the shared one
// visible" could not conflict. With ADR 023 they do: entering paged.draw's
// `vectorGraphic` raises draw's Stroke panel into the right dock, the dock
// shows ONE panel at a time, and the shared Layers panel is therefore off
// screen at the precise moment it retargets — the one moment the whole
// design exists to produce.
//
// WHERE THE ANSWER COMES FROM, and why not from the plugin. The obvious
// fix is a second field beside `panelIds` — `servesPanelIds: ["paged.layers"]`.
// It is the wrong shape for three reasons, in order of weight:
//
//   1. It is a HOST LAYOUT fact, not a plugin fact. Whether raising one
//      panel displaces another depends on the host's dock topology (this
//      cockpit shows one tab; a multi-pane shell would show both and the
//      question would not arise). A plugin cannot know that and should not
//      have to.
//   2. It would put HOST PANEL IDS in plugin code. `provides` is the
//      capability declaration ADR 023 fought to make identity-free; a
//      plugin naming `paged.layers` re-introduces exactly the coupling
//      the value lane removed, one layer up.
//   3. It can DRIFT from `provides`, and both directions are lies: declare
//      a panel you do not serve and it stays up showing CORE rows while
//      the user is inside your frame; forget to declare one you do serve
//      and the original defect is back.
//
// So the answer is INFERRED from declarations that already exist, and both
// halves are read in the SAME closed vocabulary (`CollectionName` /
// `PropertyPath`) — a set intersection, not a guess:
//
//   · the PROVIDER half is `BindingProviderScope` (`provides.collections`
//     / `provides.paths`), which a provider must already declare
//     correctly or nothing about it works at all;
//   · the PANEL half is THIS module: what a MOUNTED panel actually asks
//     the seam about, reported by the seam hooks themselves.
//
// WHY REPORTED AND NOT DECLARED. A `PanelContribution.serves` field would
// be a second copy of what `useProvidedCollection("layers")` and
// `useBindings({path: "characterFontSize"})` already say, and the copy
// would rot the first time a panel grows a binding. This follows the
// precedent the ADR's own outcome praises: the Layers slice "put the
// retargeting read in the PLATFORM, not the panel, so every schema list
// declaring `documentCollection` inherits it". Same here — a future shared
// panel is covered the moment it resolves through the seam, with nothing
// to remember.
//
// THE AUTHORITY IS PURELY NEGATIVE. "This context serves that panel" can
// only ever WITHHOLD a displacement. It never opens a panel, never raises
// one, never closes one. A plugin therefore cannot use it to take over the
// user's dock — the worst it can do with a wrong declaration is fail to
// raise its own panel, which is visible and harmless.

import {
  createContext,
  useContext,
  useEffect,
  type PropsWithChildren,
} from "react";

import type { CollectionName, PropertyPath } from "@paged-media/client";

/** The declaration side of the intersection — structurally the slice of
 *  `BindingProviderScope` / `ShellBindingProviderScope` that names core
 *  vocabulary. Declared structurally rather than imported so this module
 *  stays a leaf. */
export interface DeclaredBindingSurface {
  paths?: readonly PropertyPath[];
  collections?: readonly CollectionName[];
}

/** What a mounted panel asks the seam about. */
export interface PanelBindingSurface {
  collections: ReadonlySet<CollectionName>;
  paths: ReadonlySet<PropertyPath>;
}

interface Entry {
  panelId: string;
  collections: readonly CollectionName[];
  paths: readonly PropertyPath[];
}

/** MODULE-level on purpose, like `cockpitActions`: the edit-context
 *  controller reads this imperatively at the instant a context is entered
 *  and must not subscribe to it (a re-render there would re-run the enter
 *  effect). Entries are keyed by an opaque token so several hooks inside
 *  one panel — and several panels at once — coexist without refcounting. */
const entries = new Map<symbol, Entry>();

const PanelIdContext = createContext<string | null>(null);

/** Names the panel a subtree belongs to. Mounted by `PanelHost`, so every
 *  panel — host, plugin React, plugin schema — is scoped identically and
 *  a NESTED `PanelHost` (the Properties panel embeds one) correctly
 *  re-scopes to the inner panel. Anything rendering OUTSIDE a panel (a
 *  toolbar cluster, the control strip) reports nothing, which is right:
 *  it is not a dock tab and cannot be displaced. */
export function PanelBindingScope({
  panelId,
  children,
}: PropsWithChildren<{ panelId: string }>) {
  return (
    <PanelIdContext.Provider value={panelId}>
      {children}
    </PanelIdContext.Provider>
  );
}

/** Report what the calling hook asks the binding seam about, for as long
 *  as it is mounted. Called by the seam hooks (`useProvidedCollection`,
 *  `useBindings`) — never by a panel author, which is the whole point. */
export function useReportBindingSurface(
  collections: readonly CollectionName[],
  paths: readonly PropertyPath[],
): void {
  const panelId = useContext(PanelIdContext);
  // Content identity: the arrays are rebuilt every render by their
  // callers, so the effect keys off what is IN them, not the reference.
  const key = `${collections.join(",")}|${paths.join(",")}`;
  useEffect(() => {
    if (panelId === null) return;
    const token = Symbol("panel-binding-surface");
    entries.set(token, { panelId, collections, paths });
    return () => {
      entries.delete(token);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId, key]);
}

/** The union of everything the panel's mounted hooks reported. Empty when
 *  the panel is not mounted — which is the normal state of every dock tab
 *  but the active one, and is why the caller must treat "empty" as
 *  "unknown", never as "serves nothing". */
export function panelBindingSurface(panelId: string): PanelBindingSurface {
  const collections = new Set<CollectionName>();
  const paths = new Set<PropertyPath>();
  for (const entry of entries.values()) {
    if (entry.panelId !== panelId) continue;
    for (const c of entry.collections) collections.add(c);
    for (const p of entry.paths) paths.add(p);
  }
  return { collections, paths };
}

/**
 * Does any of `providers` serve what the panel currently on screen is
 * bound to? The whole rule, as a set intersection over core vocabulary.
 *
 * `false` for an unmounted / unreported panel is deliberate and is the
 * SAFE direction: it means the shell keeps its existing behaviour (raise
 * the context's own panels), rather than silently suppressing a raise
 * because it could not prove anything.
 */
export function panelServedBy(
  panelId: string,
  providers: readonly DeclaredBindingSurface[],
): boolean {
  const surface = panelBindingSurface(panelId);
  if (surface.collections.size === 0 && surface.paths.size === 0) return false;
  for (const provider of providers) {
    for (const c of provider.collections ?? []) {
      if (surface.collections.has(c)) return true;
    }
    for (const p of provider.paths ?? []) {
      if (surface.paths.has(p)) return true;
    }
  }
  return false;
}

/** Test/diagnostic seam — the shell's own e2e reads this through
 *  `window.__canvas`. Never read it for control flow. */
export function panelBindingSurfaceSnapshot(): Record<
  string,
  { collections: string[]; paths: string[] }
> {
  const out: Record<string, { collections: string[]; paths: string[] }> = {};
  for (const entry of entries.values()) {
    const bucket = (out[entry.panelId] ??= { collections: [], paths: [] });
    for (const c of entry.collections) {
      if (!bucket.collections.includes(c)) bucket.collections.push(c);
    }
    for (const p of entry.paths) {
      if (!bucket.paths.includes(p)) bucket.paths.push(p);
    }
  }
  return out;
}
