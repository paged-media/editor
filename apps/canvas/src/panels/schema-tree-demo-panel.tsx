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

// Schema v1.2 — TREE ROWS + DRAG-REORDER + INLINE RENAME, the
// IN-REPO CONSUMER PROOF (ADR 023 phase B).
//
// Two schema-declared lists in one panel, because the three
// capabilities land on two different engine write paths and proving
// them on one list would prove only that list:
//
//   · "Structure" — a TREE over the REAL scene outline (spread → page
//     → frames), published as flat parent-id rows through the
//     bindings door. Drag-reorder here emits the ENGINE's own
//     `reorderElement` (protocol 59) with the absolute `{ index }`
//     form, which is what the op's author called the honest shape for
//     a layers-panel drag. No reorder path is invented.
//
//   · "Layers" — the live `layers` document collection, declared as a
//     tree on `parentId` (protocol 60 exposed it; a document with no
//     layer GROUPS simply renders every row as a root, which is the
//     orphan/root rule doing its job rather than a special case).
//     Rename and reorder here go through COMMANDS, because the engine
//     models both as dedicated ops — `layerSetName` needs
//     `NodeId::Layer`, which the wire `ElementId` cannot express, and
//     `layerMove` is not a property write. That is the tier's line:
//     anything the binding model cannot express stays a command.
//
// This panel is NOT the Layers panel. Phase C owns that; this only
// proves the widget capability it needs.
//
// Driven end-to-end by tests/e2e/schema-tree-panel.spec.ts.

import { useCallback, useEffect } from "react";

import {
  CatalogRegistryProvider,
  createLocalBindingsSurface,
  PAGED_LIST,
  SchemaPanelRenderer,
  useCanvasClient,
  useRegistries,
  type ShellPanelSchema,
  type ShellSchemaRenamePayload,
  type ShellSchemaReorderPayload,
} from "@paged-media/shell";
import type { SceneTreeNode } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";

export const SCHEMA_TREE_DEMO_PANEL_ID = "paged.schema-tree-demo";
export const DEMO_RENAME_LAYER_COMMAND = "paged.demo.renameLayer";
export const DEMO_MOVE_LAYER_COMMAND = "paged.demo.moveLayer";

const STRUCTURE_BINDING = "demo.structureRows";
const STRUCTURE_SELECTED = "demo.structureSelected";

// Module-scoped so the published rows + expansion survive a dock tab
// close/reopen (UI state, not document state) — the schema-list demo
// panel's convention.
const demoBindings = createLocalBindingsSurface();

/** One published row: flat, with a parent pointer — the shape the
 *  tree spec reads and the shape `LayerSummary` already has. */
interface StructureRow {
  rowId: string;
  parentId: string | null;
  label: string;
  /** The `ElementId` kind, when the node addresses one. Spread/Page
   *  rows carry `""` — deliberately NOT draggable, which is what the
   *  reorder lane's "no kind, no write path" rule renders. */
  kind: string;
}

/** Flatten the engine's scene outline into parent-id rows. Spread and
 *  Page nodes have no element id, so they get synthetic row ids —
 *  real structure, honestly labelled, never a fabricated element. */
function flattenSceneTree(roots: SceneTreeNode[]): StructureRow[] {
  const out: StructureRow[] = [];
  const walk = (node: SceneTreeNode, parentId: string | null, path: string) => {
    const rowId = node.id ? String(node.id.id) : path;
    out.push({
      rowId,
      parentId,
      label: node.label,
      kind: node.id ? node.id.kind : "",
    });
    (node.children ?? []).forEach((child, i) => walk(child, rowId, `${path}.${i}`));
  };
  roots.forEach((root, i) => walk(root, null, `node:${i}`));
  return out;
}

const DEMO_SCHEMA: ShellPanelSchema = {
  id: SCHEMA_TREE_DEMO_PANEL_ID,
  title: "Structure (schema tree)",
  sections: [
    {
      title: "Structure",
      rows: [
        {
          widget: PAGED_LIST,
          list: {
            items: { kind: "binding", bind: STRUCTURE_BINDING },
            labelField: "label",
            secondaryField: "kind",
            idField: "rowId",
            selectionBinding: STRUCTURE_SELECTED,
            tree: { parentField: "parentId" },
            // The engine's z-order op — absolute index, within one
            // sibling list, rejected (not clamped) when stale.
            reorder: { action: { kind: "reorderElement", elementKindField: "kind" } },
          },
        },
      ],
    },
    {
      // The same rows with `defaultExpanded: false` — the opt-out a
      // panel over a deep tree needs, and the reason a large tree does
      // not have to fight the render window. No reorder here either,
      // so a tree WITHOUT drag renders as a plain (non-draggable) one.
      title: "Collapsed",
      rows: [
        {
          widget: PAGED_LIST,
          list: {
            items: { kind: "binding", bind: STRUCTURE_BINDING },
            labelField: "label",
            idField: "rowId",
            tree: { parentField: "parentId", defaultExpanded: false },
          },
        },
      ],
    },
    {
      title: "Layers",
      rows: [
        {
          widget: PAGED_LIST,
          list: {
            items: { kind: "documentCollection", collection: "layers" },
            labelField: "name",
            idField: "selfId",
            // protocol 60 — layer nesting was always in the model; the
            // wire summary simply dropped it.
            tree: { parentField: "parentId" },
            rename: {
              action: { kind: "command", command: DEMO_RENAME_LAYER_COMMAND },
            },
            reorder: {
              action: { kind: "command", command: DEMO_MOVE_LAYER_COMMAND },
            },
          },
        },
      ],
    },
  ],
};

export function SchemaTreeDemoPanel() {
  const client = useCanvasClient();
  const registries = useRegistries();

  // Publish the scene outline as tree rows; re-publish on every
  // committed mutation so a reorder is visible in the rows it moved.
  const refresh = useCallback(() => {
    void client
      .sceneTree()
      .then((roots) =>
        demoBindings.publish(STRUCTURE_BINDING, flattenSceneTree(roots)),
      )
      .catch(() => demoBindings.publish(STRUCTURE_BINDING, []));
  }, [client]);

  useEffect(() => {
    refresh();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "documentLoaded" ||
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        refresh();
      }
    });
    return off;
  }, [client, refresh]);

  useEffect(() => {
    // Idempotent under a re-mount race (dockview can briefly hold two
    // instances across a layout swap; the registry throws on dup ids).
    const handles: { dispose(): void }[] = [];
    if (!registries.commands.get(DEMO_RENAME_LAYER_COMMAND)) {
      handles.push(
        registries.commands.register({
          id: DEMO_RENAME_LAYER_COMMAND,
          title: "Rename layer (schema tree demo)",
          category: "Demo",
          handler: (_paged, payload) => {
            const p = payload as ShellSchemaRenamePayload | undefined;
            if (!p || typeof p.id !== "string" || typeof p.name !== "string") {
              return;
            }
            void client.mutate({
              op: "layerSetName",
              args: { layerId: p.id, name: p.name },
            });
          },
        }),
      );
    }
    if (!registries.commands.get(DEMO_MOVE_LAYER_COMMAND)) {
      handles.push(
        registries.commands.register({
          id: DEMO_MOVE_LAYER_COMMAND,
          title: "Move layer (schema tree demo)",
          category: "Demo",
          handler: (_paged, payload) => {
            const p = payload as ShellSchemaReorderPayload | undefined;
            if (!p || typeof p.id !== "string") return;
            // A layer is not an element, so its order is `layerMove`,
            // not `reorderElement` — the command lane exists for
            // exactly this.
            void client.mutate({
              op: "layerMove",
              args: { layerId: p.id, newIndex: p.toIndex },
            });
          },
        }),
      );
    }
    return () => handles.forEach((h) => h.dispose());
  }, [registries, client]);

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <SchemaPanelRenderer schema={DEMO_SCHEMA} bindings={demoBindings} />
    </CatalogRegistryProvider>
  );
}
