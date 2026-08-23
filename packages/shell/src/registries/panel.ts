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

import type { ComponentType } from "react";

import type { DockEdge, Disposable, VisibilityPredicate } from "./types";

/**
 * Lifecycle handle dockview passes into a panel. Bundles never
 * read this directly — the substrate wraps it so panel code only
 * sees the high-level `paged` handle.
 */
export interface PanelApi {
  // Step 3e fleshes this out alongside `DockingSubstrate`.
  id: string;
}

/**
 * Props every panel component receives. Step 3d defines the shape;
 * Step 3f mounts panels through it.
 */
export interface PanelProps {
  /** Editor handle — context providers, registries, client. */
  paged: unknown; // Resolved to PagedEditor in the editor module.
  /** Substrate-provided lifecycle. */
  api: PanelApi;
}

/**
 * Declarative panel manifest. Panels are data: a stable id, a
 * title, a React component, and placement / visibility metadata.
 */
export interface PanelContribution {
  /** E6 — a DEVELOPER surface: kept out of the Window menu.
   *
   *  The menu listed every registered panel, so an end user browsing it
   *  found the REPL, the script editor and two panels titled "Swatch
   *  list (schema)" and "Structure (schema tree)" — which exist to give
   *  the schema tiers a real consumer for their tests. Four developer
   *  tools in a designer's Window menu, indistinguishable from the
   *  ninety real ones.
   *
   *  It stays REGISTERED and openable — `__canvas.openPanel`, the
   *  command palette, and any test that wants it — because the panel is
   *  not the problem; offering it to a designer browsing for a workspace
   *  is. */
  devOnly?: boolean;

  /** Stable identifier. Format: `<namespace>.<panel>`. */
  id: string;

  /** Human-readable title shown in the tab header. */
  title: string;

  /** The React component to render inside the panel. */
  component: ComponentType<PanelProps>;

  /** Initial dock edge. Users may rearrange; this is initial only. */
  defaultDock?: DockEdge;

  /** Semantic group name. Panels with the same group land in one
   * dockview group at startup. */
  defaultGroup?: string;

  /** Optional icon name for the tab header. */
  icon?: string;

  /** K-8 — opt into the panel rail: the rail renders a launcher item
   *  for this panel after the app's built-in items. Off by default. */
  rail?: boolean;

  /** K-8 — a self-contained SVG glyph (inner markup of a 24×24 viewBox,
   *  currentColor, no script/event handlers). SANITIZED before render;
   *  used when `icon` names no host glyph. */
  iconSvg?: string;

  /** Optional visibility predicate against application state. */
  when?: VisibilityPredicate;

  /** Whether the panel is closable. Defaults to true. */
  closable?: boolean;

  /** Whether the panel can be moved. Defaults to true. */
  movable?: boolean;
}

export type PanelRegistryEvent =
  | { kind: "registered"; contribution: PanelContribution }
  | { kind: "unregistered"; id: string };

export interface PanelRegistry {
  register(contribution: PanelContribution): Disposable;
  unregister(id: string): void;
  get(id: string): PanelContribution | undefined;
  list(): PanelContribution[];
  onChange(handler: (event: PanelRegistryEvent) => void): Disposable;
}

/**
 * Default in-memory `PanelRegistry`. Insertion order is preserved so
 * the substrate can rely on a deterministic mount sequence.
 */
export function createPanelRegistry(): PanelRegistry {
  const byId = new Map<string, PanelContribution>();
  const listeners = new Set<(event: PanelRegistryEvent) => void>();

  function emit(event: PanelRegistryEvent) {
    for (const fn of listeners) fn(event);
  }

  return {
    register(contribution) {
      if (byId.has(contribution.id)) {
        throw new Error(
          `PanelRegistry: id "${contribution.id}" already registered`,
        );
      }
      byId.set(contribution.id, contribution);
      emit({ kind: "registered", contribution });
      return {
        dispose() {
          if (byId.delete(contribution.id)) {
            emit({ kind: "unregistered", id: contribution.id });
          }
        },
      };
    },
    unregister(id) {
      if (byId.delete(id)) {
        emit({ kind: "unregistered", id });
      }
    },
    get(id) {
      return byId.get(id);
    },
    list() {
      return Array.from(byId.values());
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
