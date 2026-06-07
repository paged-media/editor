// W3.2 — the edit-context + object-type registries (closes plugin-draw
// B-02 + plugin-web W-03; the last two reserved plugin-api doors).
//
// An EDIT CONTEXT is a scoped editing mode entered on a double-click
// (or programmatically) over a matching element: it restricts the
// active tool-set, emphasizes a panel-set, shows a breadcrumb, narrows
// the write-scope to the context element's subtree, and pops on Esc.
// An OBJECT TYPE is a plugin-defined object (a webFrame is a rectangle
// with attached `x-paged:<id>` source metadata) whose double-click
// enters its edit context instead of descending into a group.
//
// The REGISTRY (this file) is the registration door + lookup; the STACK
// (state/edit-context-stack.tsx) owns the active-context lifecycle and
// chrome; the canvas double-click entry consults `resolveDoubleClick`
// to decide context-enter vs. group-descent.
//
// These contribution shapes mirror @paged-media/plugin-api's
// EditContextContribution / ObjectTypeContribution 1:1, so a bundle's
// contract-typed registration is assignable here (asserted through the
// editor's plugin-api-compat.ts dev link).

// eslint-disable-next-line import/no-relative-parent-imports
import type { ElementId } from "@paged-media/client";

import type { Disposable } from "./types";

/** What a matcher sees about a candidate element — a plain snapshot the
 *  host resolves once per double-click (kind, group ancestry, and the
 *  plugin's OWN metadata envelope on the element). Mirrors plugin-api's
 *  `EditContextCandidate`. */
export interface EditContextCandidate {
  id: ElementId;
  kind?: string;
  groupChain: readonly string[];
  /** This plugin's metadata envelope on the element (the
   *  `x-paged:<manifest id>` carrier), pre-resolved by the host; `null`
   *  when absent. The envelope shape is the plugin-api
   *  `PluginMetadataEnvelope` (`{ v, data, engine? }`). */
  metadata: { v: number; data: Record<string, unknown>; engine?: Record<string, string> } | null;
}

/** The live handle a context's onEnter/onExit hook receives. */
export interface EnteredEditContext {
  type: string;
  id: ElementId;
}

/** An edit-context CLAIM. Mirrors plugin-api `EditContextContribution`. */
export interface EditContextContribution {
  type: string;
  entry: "doubleClick" | "command";
  matches?(candidate: EditContextCandidate): boolean;
  /** Tool ids the context restricts the rail to. Empty = no restriction. */
  toolIds?: string[];
  /** Panel ids the cockpit emphasizes / raises on enter. */
  panelIds?: string[];
  onEnter?(ctx: EnteredEditContext): void;
  onExit?(ctx: EnteredEditContext): void;
  /** HOST-STAMPED `x-paged:<plugin id>` key — the host resolves a
   *  candidate's `metadata` from this envelope before calling `matches`
   *  (so a plugin only ever sees its OWN namespace). The SDK adapter
   *  fills it at registration. */
  metadataKey?: string;
}

/** A plugin-defined OBJECT TYPE. Mirrors plugin-api `ObjectTypeContribution`. */
export interface ObjectTypeContribution {
  type: string;
  matches(candidate: EditContextCandidate): boolean;
  /** The edit-context type a double-click on a match enters (instead of
   *  group descent). */
  editContextType?: string;
  bakedFallback: "group" | "rectangle" | "raster";
  /** HOST-STAMPED — see `EditContextContribution.metadataKey`. */
  metadataKey?: string;
}

export type EditContextRegistryEvent =
  | { kind: "registered"; contribution: EditContextContribution }
  | { kind: "unregistered"; type: string };

export type ObjectTypeRegistryEvent =
  | { kind: "registered"; contribution: ObjectTypeContribution }
  | { kind: "unregistered"; type: string };

export interface EditContextRegistry {
  register(contribution: EditContextContribution): Disposable;
  unregister(type: string): void;
  get(type: string): EditContextContribution | undefined;
  list(): EditContextContribution[];
  onChange(handler: (event: EditContextRegistryEvent) => void): Disposable;
}

export interface ObjectTypeRegistry {
  register(contribution: ObjectTypeContribution): Disposable;
  unregister(type: string): void;
  get(type: string): ObjectTypeContribution | undefined;
  list(): ObjectTypeContribution[];
  onChange(handler: (event: ObjectTypeRegistryEvent) => void): Disposable;
}

/** Default in-memory `EditContextRegistry` — keyed by `type` (a content-
 *  type name, not a namespaced id). Last-writer-wins on a duplicate type
 *  is rejected loudly (multi-plugin contention policy ships at P7; for
 *  now a collision is a bug). */
export function createEditContextRegistry(): EditContextRegistry {
  const byType = new Map<string, EditContextContribution>();
  const listeners = new Set<(e: EditContextRegistryEvent) => void>();
  const emit = (e: EditContextRegistryEvent) => {
    for (const fn of listeners) fn(e);
  };
  return {
    register(contribution) {
      if (byType.has(contribution.type)) {
        throw new Error(
          `EditContextRegistry: type "${contribution.type}" already registered`,
        );
      }
      byType.set(contribution.type, contribution);
      emit({ kind: "registered", contribution });
      return {
        dispose() {
          if (byType.delete(contribution.type)) {
            emit({ kind: "unregistered", type: contribution.type });
          }
        },
      };
    },
    unregister(type) {
      if (byType.delete(type)) emit({ kind: "unregistered", type });
    },
    get: (type) => byType.get(type),
    list: () => Array.from(byType.values()),
    onChange(handler) {
      listeners.add(handler);
      return { dispose: () => void listeners.delete(handler) };
    },
  };
}

/** Default in-memory `ObjectTypeRegistry`. */
export function createObjectTypeRegistry(): ObjectTypeRegistry {
  const byType = new Map<string, ObjectTypeContribution>();
  const listeners = new Set<(e: ObjectTypeRegistryEvent) => void>();
  const emit = (e: ObjectTypeRegistryEvent) => {
    for (const fn of listeners) fn(e);
  };
  return {
    register(contribution) {
      if (byType.has(contribution.type)) {
        throw new Error(
          `ObjectTypeRegistry: type "${contribution.type}" already registered`,
        );
      }
      byType.set(contribution.type, contribution);
      emit({ kind: "registered", contribution });
      return {
        dispose() {
          if (byType.delete(contribution.type)) {
            emit({ kind: "unregistered", type: contribution.type });
          }
        },
      };
    },
    unregister(type) {
      if (byType.delete(type)) emit({ kind: "unregistered", type });
    },
    get: (type) => byType.get(type),
    list: () => Array.from(byType.values()),
    onChange(handler) {
      listeners.add(handler);
      return { dispose: () => void listeners.delete(handler) };
    },
  };
}

/**
 * The double-click ROUTING decision — the heart of B-02/W-03. Given a
 * resolved candidate (the hit leaf + its group ancestry + this-plugin's
 * metadata, pre-resolved per registered plugin namespace), decide what a
 * double-click should do:
 *
 *   1. OBJECT TYPE first (W-03): if any registered object type
 *      `matches` the candidate AND names an `editContextType`, enter
 *      that context (a webFrame opens its source context, never group
 *      descent).
 *   2. EDIT CONTEXT by kind (B-02): else if any registered edit context
 *      with `entry: "doubleClick"` `matches` the candidate, enter it
 *      (a polygon enters vectorGraphic).
 *   3. GROUP DESCENT: else null — the caller falls through to the
 *      existing outermost-group-enter behaviour.
 *
 * Pure over the candidate + registry snapshots (no React, no client) —
 * unit-testable, and the same function the isolate path will call with a
 * cloned candidate.
 */
export interface DoubleClickResolution {
  /** The edit-context type to enter. */
  contextType: string;
  /** The matching edit-context contribution (for the stack push). */
  context: EditContextContribution;
  /** The object type that routed here, when via path 1. */
  objectType?: ObjectTypeContribution;
}

export function resolveDoubleClick(
  candidate: EditContextCandidate,
  editContexts: EditContextRegistry,
  objectTypes: ObjectTypeRegistry,
): DoubleClickResolution | null {
  // 1 — object type → its edit context (metadata-claimed objects).
  for (const ot of objectTypes.list()) {
    if (!ot.editContextType) continue;
    if (!ot.matches(candidate)) continue;
    const ctx = editContexts.get(ot.editContextType);
    if (ctx) {
      return { contextType: ctx.type, context: ctx, objectType: ot };
    }
  }
  // 2 — edit context by kind (double-click entry, kind-claimed).
  for (const ec of editContexts.list()) {
    if (ec.entry !== "doubleClick") continue;
    if (!ec.matches?.(candidate)) continue;
    return { contextType: ec.type, context: ec };
  }
  // 3 — no claim; group descent.
  return null;
}
