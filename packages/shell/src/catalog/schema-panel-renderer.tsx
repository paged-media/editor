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

// SchemaPanelRenderer — the host's renderer for a plugin's DECLARATIVE
// panel (plugin-sdk W3.1, closes plugin-draw B-01).
//
// A bundle registers a `SchemaPanelContribution` through
// `host.contribute.schemaPanel` (NO React crosses the boundary — the
// isolate-ready panel form). The SDK host adapter synthesizes a
// `PanelContribution` whose component delegates to THIS renderer,
// injected via `createBundleHost({ schemaPanelRenderer })` (the same
// host-injection shape as `widgets` / `shell`). The renderer:
//
//   · maps every schema ROW onto a catalog `CompositionNode` — the
//     widget id IS the catalog id, the static props pass through, and
//     the `value` binding maps 1:1 onto the catalog `Binding` (the
//     §11.5 ceiling: literal | selectionProperty + coerce, UNCHANGED);
//   · drives `CompositionRenderer` (the existing catalog walk) so the
//     rows render from the SAME primitive leaves the editor's own
//     panels use — pixel-identical, no rival widget set;
//   · gates each row / section on the schema's `visible` / `enabled`
//     by LOOKING UP the bundle's PUBLISHED bindings (`host.bindings`) —
//     a host-side lookup, NOT an expression language (B-01). The
//     renderer subscribes to `bindings.onDidChange`, so a row's
//     visibility / enablement flips the instant the plugin publishes a
//     new value (e.g. its tool/selection state machine sets
//     `hasSelection`).
//
// `enabled: false` renders the row inside a `data-schema-disabled`
// wrapper that neutralises pointer + opacity — the catalog leaves'
// own no-write-path disable still applies on top (so a row with no
// selection stays disabled regardless).

import { useEffect, useReducer } from "react";

import type { Binding, CompositionNode } from "@paged-media/catalog";
import type { CollectionName, ElementId, Value } from "@paged-media/client";

import { useCanvasClient } from "../state/canvas-client-context";
import { useContentSelection } from "../state/content-selection-context";
import { useRegistries } from "../state/registries-context";
import { useSelection } from "../state/selection-context";
import { PAGED_LIST } from "./built-in";
import type { ListLeafAction } from "./leaves";
import { CompositionRenderer } from "./render";
import { resolveGate } from "./schema-gate";
import type {
  BindingsSurface,
  PanelSchema,
  PanelSchemaRow,
  PanelSchemaSection,
  SchemaGate,
  SchemaRowAction,
  WidgetValueBinding,
} from "./schema-panel-types";
import { useCollection } from "./use-collection";

/** Map a schema `WidgetValueBinding` onto a catalog `Binding`. The
 *  shapes are structurally identical (panel-schema.ts mirrors the
 *  catalog ceiling); this is the 1:1 bridge. */
function toCatalogBinding(b: WidgetValueBinding): Binding {
  if (b.kind === "literal") return { kind: "literal", value: b.value };
  return { kind: "selectionProperty", scope: b.scope, path: b.path, coerce: b.coerce };
}

/** A schema row → a catalog `CompositionNode`. The widget id is the
 *  catalog id; the value binding (if any) is the node's primary
 *  `"value"` binding. */
function rowToNode(row: PanelSchemaRow): CompositionNode {
  return {
    catalogId: row.widget,
    props: { ...(row.props ?? {}) },
    bindings: row.value ? { value: toCatalogBinding(row.value) } : {},
  };
}

/** Subscribe to the bundle's published bindings; re-render on any
 *  change so the gates stay live. */
function useBindingsTick(bindings: BindingsSurface): void {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const d = bindings.onDidChange(() => tick());
    return () => d.dispose();
  }, [bindings]);
}

function gate(g: SchemaGate | undefined, bindings: BindingsSurface): boolean {
  return resolveGate(g, (name) => bindings.get(name));
}

// ---------------------------------------------------------------- list rows
//
// B-01 list widget + G3 applyEntity — the schema's COLLECTION tier
// (schema v1.1, additive). A row carrying `list` renders through the
// `paged.list` catalog leaf with:
//   · its ROWS resolved host-side from the spec's collection binding —
//     `documentCollection` reads the same `useCollection` lane the
//     editor's own panels use; `binding` reads an ARRAY the plugin
//     published (live via the panel-wide bindings tick);
//   · SELECTION published BACK through `selectionBinding`
//     (`bindings.publish(name, rowId)`), so other rows/sections can
//     gate on it — the B-01 derived-bound-value direction, unchanged;
//   · per-row ACTIONS dispatching either a registered COMMAND with the
//     row id as payload, or the G3 `applyEntity` write: the row's
//     entity id applied to the current selection through the SAME
//     per-id setElementProperty mutations the scalar binding hook
//     commits (`makeOnCommitMany`'s shape) — text payload for applied-
//     style paths, colorRef for swatch/gradient paths. An applyEntity
//     button disables while its target selection is empty (the honest
//     no-write-path rule the scalar leaves follow).

function SchemaListRow({
  row,
  bindings,
}: {
  row: PanelSchemaRow;
  bindings: BindingsSurface;
}) {
  const spec = row.list!;
  const registries = useRegistries();
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const { contentSelection } = useContentSelection();

  const collectionName =
    spec.items.kind === "documentCollection" ? spec.items.collection : null;
  // Hook must run unconditionally (safe fallback — same idiom as the
  // collection-select leaf); the published-binding branch ignores it.
  const fetched = useCollection<Record<string, unknown>>(
    (collectionName ?? "swatches") as CollectionName,
  );
  let items: unknown[];
  if (spec.items.kind === "binding") {
    const published = bindings.get(spec.items.bind);
    items = Array.isArray(published) ? published : [];
  } else {
    items = fetched ?? [];
  }

  const selBind = spec.selectionBinding;
  const selectedRaw = selBind ? bindings.get(selBind) : undefined;
  const selectedId = typeof selectedRaw === "string" ? selectedRaw : null;
  const onSelect = selBind
    ? (id: string) => bindings.publish(selBind, id)
    : undefined;

  const runApplyEntity = (
    action: Extract<SchemaRowAction, { kind: "applyEntity" }>,
    rowId: string,
  ) => {
    const value = (
      action.valueType === "colorRef"
        ? { type: "colorRef", value: rowId === "" ? null : rowId }
        : { type: "text", value: rowId }
    ) as Value;
    if ((action.scope ?? "element") === "content") {
      if (!contentSelection) return;
      const id = {
        kind: "storyRange",
        id: {
          story_id: contentSelection.storyId,
          start: contentSelection.start,
          end: contentSelection.end,
        },
      } as ElementId;
      void client.mutate({
        op: "setElementProperty",
        args: { elementId: id, path: action.path as never, value },
      });
      return;
    }
    // Element scope — fan out to every selected id, one SetProperty
    // each (the scalar hook's multi-commit shape; same undo grain).
    for (const id of elementSelection) {
      void client.mutate({
        op: "setElementProperty",
        args: { elementId: id, path: action.path as never, value },
      });
    }
  };

  const seenKeys = new Set<string>();
  const actions: ListLeafAction[] = (spec.actions ?? []).map((a, i) => {
    const base =
      a.action.kind === "command"
        ? a.action.command
        : `apply:${a.action.path}`;
    const key = seenKeys.has(base) ? `${base}-${i}` : base;
    seenKeys.add(key);
    const gateOpen = gate(a.enabled, bindings);
    const applyTargetEmpty =
      a.action.kind === "applyEntity" &&
      ((a.action.scope ?? "element") === "element"
        ? elementSelection.length === 0
        : contentSelection == null);
    const act = a.action;
    return {
      key,
      label: a.label,
      disabled: !gateOpen || applyTargetEmpty,
      onInvoke: (rowId: string) => {
        if (act.kind === "command") {
          // Row id IS the payload — the G3 command dispatch contract.
          void registries.commands.invoke(act.command, rowId).catch((err) => {
            console.warn(
              `schema list action: command "${act.command}" failed`,
              err,
            );
          });
        } else {
          runApplyEntity(act, rowId);
        }
      },
    };
  });

  const node: CompositionNode = {
    catalogId: row.widget || PAGED_LIST,
    props: {
      ...(row.props ?? {}),
      items,
      labelField: spec.labelField,
      ...(spec.secondaryField ? { secondaryField: spec.secondaryField } : {}),
      ...(spec.idField ? { idField: spec.idField } : {}),
      ...(onSelect ? { selectedId, onSelect } : {}),
      actions,
    },
    bindings: {},
  };
  return <CompositionRenderer composition={node} />;
}

function SchemaRow({
  row,
  bindings,
}: {
  row: PanelSchemaRow;
  bindings: BindingsSurface;
}) {
  if (!gate(row.visible, bindings)) return null;
  const enabled = gate(row.enabled, bindings);
  const rendered = row.list ? (
    <SchemaListRow row={row} bindings={bindings} />
  ) : (
    <CompositionRenderer composition={rowToNode(row)} />
  );
  if (enabled) return rendered;
  // Disabled gate — neutralise pointer + dim. The leaf's own
  // no-write-path disable still applies underneath.
  return (
    <div
      data-schema-disabled="true"
      style={{ opacity: 0.5, pointerEvents: "none" }}
    >
      {rendered}
    </div>
  );
}

function SchemaSection({
  section,
  bindings,
}: {
  section: PanelSchemaSection;
  bindings: BindingsSurface;
}) {
  if (!gate(section.visible, bindings)) return null;
  // Each row is gated INDIVIDUALLY (its own visible/enabled), so we
  // render rows directly rather than handing them to the catalog
  // section leaf's own walk — but we wrap them in the same section
  // chrome the catalog leaf uses (kicker title above a hairline) so a
  // schema section reads identical to a native one.
  const rows = section.rows.map((row, i) => (
    <SchemaRow key={`${row.widget}-${i}`} row={row} bindings={bindings} />
  ));
  if (section.title === undefined) {
    return (
      <div className="flex flex-col gap-[9px]" data-schema-section="">
        {rows}
      </div>
    );
  }
  return (
    <div
      className="-mx-3 border-t border-input px-3 pt-2"
      data-schema-section={section.title}
    >
      <div className="pg-label mb-2">{section.title}</div>
      <div className="flex flex-col gap-[9px]">{rows}</div>
    </div>
  );
}

/**
 * Render a plugin's declarative schema panel. Injected into
 * `createBundleHost({ schemaPanelRenderer })` so a schema panel
 * registered via `host.contribute.schemaPanel` renders from the
 * catalog with its visibility/enablement driven by the bundle's
 * published bindings.
 */
export function SchemaPanelRenderer({
  schema,
  bindings,
}: {
  schema: PanelSchema;
  bindings: BindingsSurface;
}) {
  useBindingsTick(bindings);
  return (
    <div
      className="flex flex-col gap-[9px] p-3"
      data-schema-panel={schema.id}
    >
      {schema.sections.map((section, i) => (
        <SchemaSection
          key={`section-${i}`}
          section={section}
          bindings={bindings}
        />
      ))}
    </div>
  );
}
