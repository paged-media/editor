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

// B-01 list widget + G3 applyEntity — the IN-REPO CONSUMER PROOF.
//
// A schema-driven panel (pure data, rendered through the SAME
// `SchemaPanelRenderer` the bundle host injects) exercising the
// schema v1.1 collection tier end-to-end against a REAL document
// collection:
//
//   · a `paged.list` row bound to `documentCollection:swatches` —
//     row label from `name`, mono secondary from `kind`, id from
//     `selfId`;
//   · row SELECTION published back through the panel's bindings
//     (`demo.selectedSwatch`) — proven by the gated readout row
//     below it, which appears only once a row is selected (the
//     B-01 derived-bound-value gate, unchanged);
//   · a G3 `applyEntity` action ("Fill") applying the row's swatch
//     id to the element selection's `frameFillColor` as a ColorRef —
//     the standard setElementProperty mutation channel;
//   · a COMMAND action ("Stroke") dispatching a registered command
//     with the row id as payload; the handler (registered on panel
//     mount) applies the swatch to `frameStrokeColor`, so the
//     command lane does something real, never fake-interactive.
//
// Driven end-to-end by tests/e2e/schema-list-panel.spec.ts.

import { useEffect, useRef } from "react";

import {
  CatalogRegistryProvider,
  createLocalBindingsSurface,
  PAGED_LIST,
  PAGED_READOUT,
  SchemaPanelRenderer,
  useCanvasClient,
  useRegistries,
  useSelection,
  type ShellPanelSchema,
} from "@paged-media/shell";
import type { Value } from "@paged-media/client";

import { appCatalogRegistry } from "./catalog-registry";

export const SCHEMA_LIST_DEMO_PANEL_ID = "paged.schema-list-demo";
export const DEMO_APPLY_STROKE_COMMAND = "paged.demo.applySwatchStroke";
const SELECTED_BINDING = "demo.selectedSwatch";

// Module-scoped: the panel's published-bindings store survives dock
// tab close/reopen (selection state is UI state, not document state).
const demoBindings = createLocalBindingsSurface();

const DEMO_SCHEMA: ShellPanelSchema = {
  id: SCHEMA_LIST_DEMO_PANEL_ID,
  title: "Swatch List (schema)",
  sections: [
    {
      title: "Swatches",
      rows: [
        {
          widget: PAGED_LIST,
          list: {
            items: { kind: "documentCollection", collection: "swatches" },
            labelField: "name",
            secondaryField: "kind",
            idField: "selfId",
            selectionBinding: SELECTED_BINDING,
            actions: [
              {
                label: "Fill",
                action: {
                  kind: "applyEntity",
                  path: "frameFillColor",
                  valueType: "colorRef",
                },
              },
              {
                label: "Stroke",
                action: { kind: "command", command: DEMO_APPLY_STROKE_COMMAND },
              },
            ],
          },
        },
        {
          // Gated on the list's published selection binding — renders
          // only once a row is selected (the publish-back proof).
          widget: PAGED_READOUT,
          props: { label: "Selected", text: "swatch row selected" },
          visible: { bind: SELECTED_BINDING },
        },
      ],
    },
  ],
};

export function SchemaListDemoPanel() {
  const client = useCanvasClient();
  const registries = useRegistries();
  const { elementSelection } = useSelection();
  // Live ref — the command handler closes over the CURRENT selection,
  // not the mount-time snapshot.
  const selRef = useRef(elementSelection);
  selRef.current = elementSelection;

  useEffect(() => {
    // Idempotent under a re-mount race (dockview can briefly hold two
    // instances across a layout swap; the registry throws on dup ids).
    if (registries.commands.get(DEMO_APPLY_STROKE_COMMAND)) return;
    const handle = registries.commands.register({
      id: DEMO_APPLY_STROKE_COMMAND,
      title: "Apply swatch to stroke (schema demo)",
      category: "Demo",
      handler: (_paged, payload) => {
        const swatchId = typeof payload === "string" ? payload : null;
        if (!swatchId) return;
        const value = { type: "colorRef", value: swatchId } as Value;
        for (const id of selRef.current) {
          void client.mutate({
            op: "setElementProperty",
            args: { elementId: id, path: "frameStrokeColor", value },
          });
        }
      },
    });
    return () => handle.dispose();
  }, [registries, client]);

  return (
    <CatalogRegistryProvider registry={appCatalogRegistry()}>
      <SchemaPanelRenderer schema={DEMO_SCHEMA} bindings={demoBindings} />
    </CatalogRegistryProvider>
  );
}
