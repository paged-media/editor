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

import type { Disposable, VisibilityPredicate } from "./types";

/**
 * Declarative menu item. Items contribute themselves to a path-based
 * tree — `"File/Open…"` → File menu, "Open…" leaf. The
 * shell renders top-level path segments as drop-down menus; nested
 * paths nest as sub-menus.
 *
 * Menu items are commands underneath: selecting one invokes
 * `commands.invoke(command)`. Reuse beats parallel surfaces, so
 * keybindings, palette entries, and menu items all dispatch to the
 * same command id.
 */
export interface MenuItemContribution {
  /** Slash-separated path. `"File/Open…"`, `"View/Show: Pages"`. */
  path: string;

  /** Command id this item invokes when selected. */
  command: string;

  /** Lower numbers float up within their menu group. Default 100. */
  order?: number;

  /** Optional separator group. Items with the same group cluster;
   * different groups render with a visual separator between them. */
  group?: string;

  /** E4 — a human heading for this item's group.
   *
   *  The Window menu already computes these (`WINDOW_MENU_CATEGORIES`:
   *  Workspace / Structure / Styles / Text / Properties / Object /
   *  Output / Developer) and then threw them away, because `MenuBar`
   *  only ever emitted a separator on a group change. So ~90 panel
   *  entries rendered as one flat list divided by unlabelled hairlines —
   *  the grouping was done and the user could not see it.
   *
   *  Optional: a menu whose groups need no names (File's open/save
   *  clusters) keeps the bare separator. */
  groupLabel?: string;

  /** Visible-but-disabled seam — a kit menu item whose backing
   * doesn't exist yet. Renders greyed with a "soon" marker and
   * never invokes (the honest-stub convention). */
  disabled?: boolean;

  /** Optional visibility predicate. Same shape + Step-3 semantics
   * (function evaluated against application state; DSL string is
   * inert until the evaluator lands in a later step). */
  when?: VisibilityPredicate;

  /** F1 — this entry is a HOST COURTESY for a plugin's command, and
   *  stands down the moment that plugin contributes its own.
   *
   *  The host curates `Object ▸ Insert web frame…` and three Data verbs
   *  on behalf of bundles that cannot reach the menu bar (C1). Once
   *  `contribute.menu()` shipped, a bundle CAN — and then the courtesy
   *  entry is a second route to the same command, in a place the plugin
   *  did not choose, that the plugin cannot remove.
   *
   *  Set to the command id this entry stands in for. A non-fallback
   *  entry naming the same command supersedes it: at the SAME path it
   *  replaces it outright (rather than throwing, which would take the
   *  bundle's activation down over a menu), and at a DIFFERENT path it
   *  hides it from `list()`.
   *
   *  The host keeps registering these unconditionally, so a bundle that
   *  declares no menu of its own still gets a front door. That is the
   *  whole point of a fallback: it is not deleted when the door opens,
   *  it is deleted when someone walks through it. */
  fallbackFor?: string;
}

export type MenuRegistryEvent =
  | { kind: "registered"; contribution: MenuItemContribution }
  | { kind: "unregistered"; path: string };

export interface MenuRegistry {
  register(contribution: MenuItemContribution): Disposable;
  unregister(path: string): void;
  get(path: string): MenuItemContribution | undefined;
  list(): MenuItemContribution[];
  onChange(handler: (event: MenuRegistryEvent) => void): Disposable;
}

/**
 * Default in-memory `MenuRegistry`. Path is the dedupe key; two
 * items at the same path conflict the way two panels at the same id
 * conflict. Insertion order is preserved within a sort-by-order tie.
 */
export function createMenuRegistry(): MenuRegistry {
  const byPath = new Map<string, MenuItemContribution>();
  const listeners = new Set<(event: MenuRegistryEvent) => void>();

  function emit(event: MenuRegistryEvent) {
    for (const fn of listeners) fn(event);
  }

  return {
    register(contribution) {
      const existing = byPath.get(contribution.path);
      if (existing) {
        // A real entry SUPERSEDES a courtesy one at the same path. It
        // must not throw: the thrower is a bundle's `activate`, and
        // taking a plugin down because the host was already being
        // helpful there is the worst of the available outcomes.
        if (existing.fallbackFor && !contribution.fallbackFor) {
          byPath.set(contribution.path, contribution);
          emit({ kind: "registered", contribution });
          return {
            dispose() {
              if (byPath.get(contribution.path) === contribution) {
                byPath.delete(contribution.path);
                emit({ kind: "unregistered", path: contribution.path });
              }
            },
          };
        }
        // The reverse: a courtesy entry arriving after the real one is
        // simply not needed. Inert handle, no throw, no duplicate.
        if (contribution.fallbackFor && !existing.fallbackFor) {
          return { dispose() {} };
        }
        throw new Error(
          `MenuRegistry: path "${contribution.path}" already registered`,
        );
      }
      byPath.set(contribution.path, contribution);
      emit({ kind: "registered", contribution });
      return {
        dispose() {
          if (byPath.delete(contribution.path)) {
            emit({ kind: "unregistered", path: contribution.path });
          }
        },
      };
    },
    unregister(path) {
      if (byPath.delete(path)) {
        emit({ kind: "unregistered", path });
      }
    },
    get(path) {
      return byPath.get(path);
    },
    list() {
      const all = Array.from(byPath.values());
      // A courtesy entry hides once the command it stands in for is
      // claimed by a real entry ANYWHERE — the plugin will usually put
      // it somewhere the host did not guess.
      const claimed = new Set(
        all.filter((m) => !m.fallbackFor).map((m) => m.command),
      );
      return all.filter((m) => !m.fallbackFor || !claimed.has(m.fallbackFor));
    },
    onChange(handler) {
      listeners.add(handler);
      return {
        dispose() {
          listeners.delete(handler);
        },
      };
    },
  };
}
