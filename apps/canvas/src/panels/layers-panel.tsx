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

// THE Layers panel — ADR 023 phase C, the first host-owned panel that
// RETARGETS instead of being duplicated.
//
// Before this, "Layers" existed three times: this panel (hand-rolled
// over `client.layers()`), plugin-draw's `layers-panel.tsx`, and
// plugin-image's `LayersSection`. Each was the correct LOCAL decision,
// because the platform's only two ways to put a panel on screen both
// MINT A NEW PANEL. ADR 023 inverts that: the HOST owns the panel, and
// while a plugin's edit context is active that plugin resolves the
// values the panel binds to.
//
// So this panel binds to the `"layers"` collection and to core's own op
// vocabulary (`layerMove` / `layerSetName` / `layerSetVisible` / …) —
// ALWAYS, whatever is selected. Who answers changes; the declaration
// does not. There is deliberately NOT ONE conditional on a plugin id in
// this file, and there must never be: a shared panel with product
// conditionals is worse than three honest separate ones, and it is the
// exact anti-pattern the ADR names.
//
// WHAT IS DECLARED VS WHAT IS CODE
//   · the LIST is schema (phase B's tree / drag-reorder / inline
//     rename), so the retargeting read lane lives in the platform
//     (`schema-panel-renderer` → `useProvidedCollection`) and every
//     other schema list inherits it;
//   · the CHROME (the "New layer" button) is host React, because the
//     schema tier has no button widget and faking one would be worse;
//   · the COMMANDS are host React, because they are the WRITE lane and
//     every one of them goes provider-first through
//     `useProviderFirstMutate`.
//
// TWO REORDER LANES, and they are genuinely different ops on different
// id types — the thing the ADR's framing flattened into one:
//   · LAYER order is `layerMove`, which resolves to `NodeId::Layer`.
//     The wire `ElementId` has no layer variant, so the schema's
//     `reorderElement` lane cannot express it. Hence the `command`
//     lane, and hence `paged.layers.reorder` below.
//   · ITEM-within-parent order is `reorderElement`, on a wire
//     `ElementId`. A provider serving element-shaped rows honours the
//     panel's `layerMove` by translating it in ITS OWN realm — which is
//     precisely the reconciliation §18.10 describes, and why the panel
//     needs no branch to get both.
//
// FRONT AT TOP. `LayerSummary.z` is the designmap index and index 0 is
// the BACKMOST layer (`paged_scene::layer`: "IDML lists layers
// bottom-first … layers[0] is the backmost"). The old hand-rolled panel
// rendered that verbatim, so it showed the backmost layer at the TOP —
// the opposite of InDesign, Illustrator and plugin-draw's own panel.
// `displayOrder: "frontFirst"` fixes it in the widget, where sibling
// INDICES stay the engine's, so the reorder command needs no arithmetic
// and cannot drift from the display.
//
// ONE CAPABILITY LOST IN THE MIGRATION, named rather than faked: the
// old panel drew eye / lock / print GLYPHS reflecting each row's own
// flag. The schema list tier has no per-row state indicator — only
// static-label action buttons — so the toggles here work but do not
// show their state. That is a WIDGET-tier gap (an icon/state column on
// `SchemaListSpec`), not a seam gap, and it is recorded rather than
// papered over with a `binding`-lane row set that would take the read
// out of the platform seam and put it back in one panel.

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  CatalogRegistryProvider,
  PAGED_LIST,
  SchemaPanelRenderer,
  createLocalBindingsSurface,
  useActiveBindingProviders,
  useCollectionPathOffered,
  useProvidedCollection,
  useProviderFirstMutate,
  useRegistries,
  type ShellPanelSchema,
  type ShellSchemaRenamePayload,
  type ShellSchemaReorderPayload,
} from "@paged-media/shell";

import type { LayerSummary, Mutation } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";

export const LAYERS_PANEL_ID = "paged.layers";

export const LAYERS_REORDER_COMMAND = "paged.layers.reorder";
export const LAYERS_RENAME_COMMAND = "paged.layers.rename";
export const LAYERS_TOGGLE_VISIBLE_COMMAND = "paged.layers.toggleVisible";
export const LAYERS_TOGGLE_LOCKED_COMMAND = "paged.layers.toggleLocked";
export const LAYERS_REMOVE_COMMAND = "paged.layers.remove";
export const LAYERS_ADD_COMMAND = "paged.layers.add";

const SELECTED_BINDING = "paged.layers.selected";
/** Capability gates published from `activeProviders()` — see
 *  `useCollectionPathOffered`. A control whose path the ACTIVE owner
 *  does not declare is a control that cannot work, so it is disabled
 *  rather than left to write into a row core has never heard of. */
const CAN_RENAME_BINDING = "paged.layers.canRename";
const CAN_TOGGLE_VISIBLE_BINDING = "paged.layers.canToggleVisible";
const CAN_TOGGLE_LOCKED_BINDING = "paged.layers.canToggleLocked";

// Module-scoped so dock close/reopen keeps the published gates — the
// same reason the schema-tree demo panel holds its surface here.
const layersBindings = createLocalBindingsSurface();

const LAYERS_SCHEMA: ShellPanelSchema = {
  id: LAYERS_PANEL_ID,
  title: "Layers",
  sections: [
    {
      rows: [
        {
          widget: PAGED_LIST,
          list: {
            // The ONE declaration the whole ADR turns on. It names a
            // CORE collection and nothing else; the active plugin edit
            // context may answer it instead of the engine, and this
            // panel never learns which.
            items: { kind: "documentCollection", collection: "layers" },
            labelField: "name",
            idField: "selfId",
            selectionBinding: SELECTED_BINDING,
            // `LayerSummary.parentId` (protocol 60) is a layer GROUP
            // pointer — the flat-summary wall ADR 023's own phase-A
            // notes recorded, closed in core so a real tree can render.
            tree: { parentField: "parentId" },
            // Front at top: the DTP convention, and the opposite of the
            // engine's sibling order. See the module header.
            displayOrder: "frontFirst",
            rename: {
              action: { kind: "command", command: LAYERS_RENAME_COMMAND },
              enabled: { bind: CAN_RENAME_BINDING },
            },
            // The command lane, because layer order is `layerMove` and
            // the wire `ElementId` cannot address a layer. Measured, not
            // assumed — see the module header.
            reorder: {
              action: { kind: "command", command: LAYERS_REORDER_COMMAND },
            },
            actions: [
              {
                label: "Hide/show",
                action: {
                  kind: "command",
                  command: LAYERS_TOGGLE_VISIBLE_COMMAND,
                },
                enabled: { bind: CAN_TOGGLE_VISIBLE_BINDING },
              },
              {
                label: "Lock/unlock",
                action: {
                  kind: "command",
                  command: LAYERS_TOGGLE_LOCKED_COMMAND,
                },
                enabled: { bind: CAN_TOGGLE_LOCKED_BINDING },
              },
              {
                label: "Delete",
                action: { kind: "command", command: LAYERS_REMOVE_COMMAND },
              },
            ],
          },
        },
      ],
    },
  ],
};

/** A row as the panel reads it. Structurally `LayerSummary` — the
 *  vocabulary rule means a PROVIDER's rows carry the same shape, which
 *  is exactly what lets one renderer draw both. */
type LayerRow = LayerSummary;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelProps = any;

export function LayersPanel(_: PanelProps) {
  const registries = useRegistries();
  const mutate = useProviderFirstMutate();
  // The rows THE PANEL IS SHOWING, whoever answered. The commands read
  // this (a toggle needs the current flag) so a write always acts on the
  // row the user clicked, not on core's idea of it.
  const { rows, provider } = useProvidedCollection<LayerRow>("layers");
  const rowsRef = useRef<readonly LayerRow[]>([]);
  rowsRef.current = rows ?? [];

  // ------------------------------------------------------- capability
  //
  // §18.10: "phase C must actually READ `activeProviders()` and disable
  // rather than assume". The question asked is a CAPABILITY question —
  // "does whoever owns these rows serve this path?" — and the answer is
  // a boolean. No plugin id reaches this component's logic.
  const canRename = useCollectionPathOffered("layers", "layerName");
  const canToggleVisible = useCollectionPathOffered("layers", "layerVisible");
  const canToggleLocked = useCollectionPathOffered("layers", "layerLocked");
  const active = useActiveBindingProviders();
  useEffect(() => {
    layersBindings.publish(CAN_RENAME_BINDING, canRename);
    layersBindings.publish(CAN_TOGGLE_VISIBLE_BINDING, canToggleVisible);
    layersBindings.publish(CAN_TOGGLE_LOCKED_BINDING, canToggleLocked);
  }, [canRename, canToggleVisible, canToggleLocked]);

  const rowById = useCallback(
    (id: string): LayerRow | undefined =>
      rowsRef.current.find((r) => r.selfId === id),
    [],
  );

  // --------------------------------------------------------- commands
  //
  // Every one goes through `useProviderFirstMutate`: offer core's own
  // op to the active providers, send it to the engine if nobody claims
  // it. The panel speaks ONE vocabulary; the translation into a
  // plugin's own realm is that plugin's business.
  const run = useCallback(
    async (mutation: Mutation, what: string) => {
      const out = await mutate(mutation);
      if (!out.applied) {
        // A claimed-but-refused write names its owner; an unclaimed one
        // that the engine rejected does not. Both are reported — a
        // silent no-op here is the class of lie the platform refuses.
        console.warn(
          `paged.layers: ${what} refused by ${out.provider ?? "the engine"}`,
          out.error,
        );
      }
    },
    [mutate],
  );

  useEffect(() => {
    const defs = [
      {
        id: LAYERS_REORDER_COMMAND,
        title: "Move layer",
        run: (payload?: unknown) => {
          const p = payload as ShellSchemaReorderPayload | undefined;
          if (!p || typeof p.id !== "string") return;
          // `toIndex` is the SOURCE sibling index — the tree keeps
          // engine indices even while drawing front-first, so this
          // command is correct in both display orders and does no
          // arithmetic of its own.
          return run(
            {
              op: "layerMove",
              args: { layerId: p.id, newIndex: p.toIndex },
            } as Mutation,
            "layerMove",
          );
        },
      },
      {
        id: LAYERS_RENAME_COMMAND,
        title: "Rename layer",
        run: (payload?: unknown) => {
          const p = payload as ShellSchemaRenamePayload | undefined;
          if (!p || typeof p.id !== "string" || typeof p.name !== "string") {
            return;
          }
          return run(
            {
              op: "layerSetName",
              args: { layerId: p.id, name: p.name },
            } as Mutation,
            "layerSetName",
          );
        },
      },
      {
        id: LAYERS_TOGGLE_VISIBLE_COMMAND,
        title: "Show or hide layer",
        run: (payload?: unknown) => {
          const row = typeof payload === "string" ? rowById(payload) : undefined;
          if (!row) return;
          return run(
            {
              op: "layerSetVisible",
              args: { layerId: row.selfId, visible: !row.visible },
            } as Mutation,
            "layerSetVisible",
          );
        },
      },
      {
        id: LAYERS_TOGGLE_LOCKED_COMMAND,
        title: "Lock or unlock layer",
        run: (payload?: unknown) => {
          const row = typeof payload === "string" ? rowById(payload) : undefined;
          if (!row) return;
          return run(
            {
              op: "layerSetLocked",
              args: { layerId: row.selfId, locked: !row.locked },
            } as Mutation,
            "layerSetLocked",
          );
        },
      },
      {
        id: LAYERS_REMOVE_COMMAND,
        title: "Delete layer",
        run: (payload?: unknown) => {
          if (typeof payload !== "string") return;
          return run(
            { op: "layerRemove", args: { layerId: payload } } as Mutation,
            "layerRemove",
          );
        },
      },
      {
        id: LAYERS_ADD_COMMAND,
        title: "New layer",
        run: () =>
          run(
            {
              op: "layerInsert",
              // Position 0 is the BACKMOST slot, so a new layer appears
              // at the BOTTOM of a front-first list. InDesign adds above
              // the current layer; matching that needs a selection-aware
              // insert and is a separate change — this keeps the old
              // panel's behaviour rather than quietly altering it.
              args: { position: 0, name: "Layer" },
            } as Mutation,
            "layerInsert",
          ),
      },
    ];
    // dockview can briefly hold two instances across a layout swap and
    // the registry throws on a duplicate id — register idempotently.
    const handles = defs
      .filter((d) => !registries.commands.get(d.id))
      .map((d) =>
        registries.commands.register({
          id: d.id,
          title: d.title,
          category: "Layers",
          handler: (_paged: unknown, payload?: unknown) => d.run(payload),
        }),
      );
    return () => handles.forEach((h) => h.dispose());
  }, [registries, run, rowById]);

  const onAdd = useCallback(() => {
    void registries.commands.invoke(LAYERS_ADD_COMMAND);
  }, [registries]);

  const ownerNote = useMemo(() => {
    if (!provider) return null;
    const owner = active.find((p) => p.plugin === provider);
    return owner ? `${provider} · ${owner.contextType}` : provider;
  }, [provider, active]);

  return (
    <div className="text-sm" data-layers="ready" data-layers-source={provider ?? "core"}>
      <div className="flex items-center justify-between gap-2 border-b border-input p-1">
        {/* "Provided by" — the ADR's own affordance. It is DISPLAY: the
            user is told which content type they are looking at, and no
            code reads it. */}
        <span className="pg-ui-xs px-1" style={{ color: "var(--pg-muted-fg)" }}>
          {ownerNote ?? "Document"}
        </span>
        <button
          type="button"
          className="rounded px-2 py-0.5 hover:bg-muted/60"
          data-action="add-layer"
          onClick={onAdd}
        >
          New layer
        </button>
      </div>
      {/* The seam host is already in context (PagedShell publishes it
          above the dock); only the CATALOG registry is panel-local. */}
      <CatalogRegistryProvider registry={appCatalogRegistry()}>
        <SchemaPanelRenderer schema={LAYERS_SCHEMA} bindings={layersBindings} />
      </CatalogRegistryProvider>
    </div>
  );
}
