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

import { useEffect, useMemo, useReducer, useState } from "react";

import type { Binding, CompositionNode } from "@paged-media/catalog";
import type { CollectionName, ElementId, Value } from "@paged-media/client";

import { useCanvasClient } from "../state/canvas-client-context";
import { useContentSelection } from "../state/content-selection-context";
import { useRegistries } from "../state/registries-context";
import { useSelection } from "../state/selection-context";
import { useProvidedCollection } from "./binding-providers";
import { PAGED_LIST } from "./built-in";
import { displayName } from "./leaves";
import type {
  ListLeafAction,
  ListLeafRename,
  ListLeafReorder,
  ListLeafTree,
} from "./leaves";
import { CompositionRenderer } from "./render";
import { resolveGate } from "./schema-gate";
import type {
  BindingsSurface,
  PanelSchema,
  PanelSchemaRow,
  PanelSchemaSection,
  SchemaGate,
  SchemaReorderPayload,
  SchemaRenamePayload,
  SchemaRowAction,
  WidgetValueBinding,
} from "./schema-panel-types";
import {
  buildSchemaTreeRows,
  flatSchemaTreeRows,
  visibleSchemaTreeRows,
  type SchemaTreeRow,
} from "./schema-tree";

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
//
// Schema v1.2 adds the three things B-01/G3 recorded as still absent —
// TREE ROWS, DRAG-REORDER and INLINE RENAME — all on the same `list`
// spec, all additive. A tree is a list with parentage, so it reuses
// the rows, fields, selection and actions the panel already declared.

// ---------------------------------------------------------------- v1.2
//
// Tree rows, drag-reorder and inline rename. The division of labour is
// deliberate: `schema-tree.ts` owns the flattening arithmetic (pure),
// `ListLeaf` owns the pointer mechanics and reports "row A dropped on
// row B", and THIS file owns the only judgement call — which engine op
// a completed drag or rename becomes, and when to refuse.

/** Reads a dot-path out of a row object. Mirrors the leaf's own
 *  reader so ids/labels resolve identically on both sides. */
function fieldAt(row: unknown, path: string): unknown {
  let cur: unknown = row;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** The row id AS THE LEAF SEES IT — `displayName`-stripped, falling
 *  back to the source index. Tree keys must agree with the leaf's
 *  `data-list-row`, so both sides derive it the same way. */
function rowKeyOf(row: unknown, idField: string, index: number): string {
  const v = fieldAt(row, idField);
  return v == null ? String(index) : displayName(String(v));
}

/** The RAW id, unstripped — what goes on the wire. Engine self-ids
 *  never carry the `$ID/` prefix `displayName` removes, but a write
 *  should not depend on that being true forever. */
function rawIdOf(row: unknown, idField: string, index: number): string {
  const v = fieldAt(row, idField);
  return v == null ? String(index) : String(v);
}

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
  // Tree expansion, held as the set of ids whose state DIFFERS from
  // the spec's default. Panel-local by design (see `SchemaTreeSpec`):
  // it does not survive a dock tab re-mount, and there is no published
  // lane for it until a panel needs one.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const collectionName =
    spec.items.kind === "documentCollection" ? spec.items.collection : null;
  // Hook must run unconditionally (safe fallback — same idiom as the
  // collection-select leaf); the published-binding branch ignores it.
  //
  // ADR 023 phase C: a `documentCollection` list resolves through the
  // BINDING-PROVIDER SEAM — the active plugin edit context answers if it
  // owns this collection, and core answers otherwise. The declaration
  // does not change (a panel still says `collection: "layers"`); only
  // WHO answers does. Nothing here — and nothing downstream — may branch
  // on which plugin that was; `provider` is carried for the DOM hook and
  // for diagnostics only.
  const provided = useProvidedCollection<Record<string, unknown>>(
    collectionName as CollectionName | null,
  );
  let items: unknown[];
  let provider: string | null = null;
  if (spec.items.kind === "binding") {
    const published = bindings.get(spec.items.bind);
    items = Array.isArray(published) ? published : [];
  } else {
    items = provided.rows ?? [];
    provider = provided.provider;
  }

  const idField = spec.idField ?? "selfId";
  const treeSpec = spec.tree;
  const parentField = treeSpec?.parentField;
  const reverseSiblings = spec.displayOrder === "frontFirst";

  // Flatten once per items/spec change — depth-first, orphans as
  // roots, cycles surfaced rather than dropped (see schema-tree.ts).
  const treeRows: SchemaTreeRow<unknown>[] = useMemo(() => {
    const idOf = (r: unknown, i: number) => rowKeyOf(r, idField, i);
    const opts = { reverseSiblings };
    if (!parentField) return flatSchemaTreeRows(items, idOf, opts);
    return buildSchemaTreeRows(
      items,
      idOf,
      (r) => {
        const p = fieldAt(r, parentField);
        return p == null ? null : displayName(String(p));
      },
      opts,
    );
    // `items` identity changes on every collection re-fetch, which is
    // exactly when the tree must be rebuilt.
  }, [items, idField, parentField, reverseSiblings]);

  // Expansion is tracked as a DIFF from the declared default, not as
  // an absolute id set, so `defaultExpanded` and the user's toggles
  // compose without one stranding the other.
  const defaultExpanded = treeSpec?.defaultExpanded ?? true;
  const isExpanded = (id: string): boolean =>
    defaultExpanded !== toggled.has(id);

  const visibleRows = treeSpec
    ? visibleSchemaTreeRows(treeRows, isExpanded)
    : treeRows;

  const onToggleExpand = (id: string) => {
    setToggled((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const byId = new Map(treeRows.map((r) => [r.id, r]));
  // Keyed off the SOURCE order, because that is the index both id
  // readers fall back to when a row carries no id field.
  const rawById = new Map<string, string>();
  items.forEach((r, i) =>
    rawById.set(rowKeyOf(r, idField, i), rawIdOf(r, idField, i)),
  );

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
      // B2 — resolved per ROW by the leaf, which is the only tier that
      // has the row. Carried rather than resolved here for that reason.
      state: a.state,
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

  // ------------------------------------------------------ drag-reorder
  //
  // The leaf reports a DROP ("row A landed on row B"); the op choice
  // and every refusal live here.
  const reorderSpec = spec.reorder;
  const reorderDisabled = reorderSpec ? !gate(reorderSpec.enabled, bindings) : true;
  const runReorder = (draggedId: string, targetId: string) => {
    if (!reorderSpec) return;
    const from = byId.get(draggedId);
    const to = byId.get(targetId);
    if (!from || !to) return;
    // `reorderElement` moves a node WITHIN the sibling list it already
    // belongs to — it cannot reparent. Refuse a cross-parent drop
    // rather than reinterpreting it as a same-parent move, which is
    // the failure the user would not see.
    if (from.parentId !== to.parentId) {
      console.warn(
        "schema list reorder: cross-parent drop refused (the engine's " +
          "reorder is within one sibling list; reparenting is a different op)",
      );
      return;
    }
    if (from.siblingIndex === to.siblingIndex) return;
    const payload: SchemaReorderPayload = {
      id: rawById.get(draggedId) ?? draggedId,
      fromIndex: from.siblingIndex,
      toIndex: to.siblingIndex,
      parentId: from.parentId == null ? null : (rawById.get(from.parentId) ?? from.parentId),
    };
    const act = reorderSpec.action;
    if (act.kind === "command") {
      void registries.commands.invoke(act.command, payload).catch((err) => {
        console.warn(
          `schema list reorder: command "${act.command}" failed`,
          err,
        );
      });
      return;
    }
    // `reorderElement` — needs an ElementId, so the row must carry a
    // kind. No kind = no write path; stay silent-but-visible rather
    // than guessing one.
    const kindField = act.elementKindField ?? "kind";
    const kind = fieldAt(from.row, kindField);
    if (typeof kind !== "string" || kind === "") {
      console.warn(
        `schema list reorder: row "${draggedId}" carries no element kind at ` +
          `"${kindField}" — not reorderable`,
      );
      return;
    }
    void client
      .mutate({
        op: "reorderElement",
        args: {
          elementId: { kind, id: payload.id } as ElementId,
          // The ABSOLUTE form: `toIndex` is the row's FINAL slot,
          // which is exactly what a drop position means. An index the
          // engine finds out of range is REJECTED, not clamped — so a
          // stale row set surfaces here instead of restacking the
          // wrong item.
          to: { index: payload.toIndex },
        },
      })
      .then((reply) => {
        // `client.mutate` RESOLVES on a rejected mutation (the failure
        // arrives as a `mutationFailed` reply, it does not throw), so
        // a bare `.catch` would swallow exactly the loud rejection the
        // absolute-index form exists to give us.
        if (reply.kind === "mutationFailed") {
          console.warn(
            "schema list reorder: reorderElement rejected",
            reply.payload.error,
          );
        }
      })
      .catch((err) => {
        console.warn("schema list reorder: reorderElement failed", err);
      });
  };
  const reorder: ListLeafReorder | undefined = reorderSpec
    ? { onDrop: runReorder, disabled: reorderDisabled }
    : undefined;

  // ---------------------------------------------------- inline rename
  const renameSpec = spec.rename;
  const rename: ListLeafRename | undefined = renameSpec
    ? {
        field: renameSpec.field ?? spec.labelField,
        disabled: !gate(renameSpec.enabled, bindings),
        onCommit: (rowId: string, name: string) => {
          const payload: SchemaRenamePayload = {
            id: rawById.get(rowId) ?? rowId,
            name,
          };
          void registries.commands
            .invoke(renameSpec.action.command, payload)
            .catch((err) => {
              console.warn(
                `schema list rename: command "${renameSpec.action.command}" failed`,
                err,
              );
            });
        },
      }
    : undefined;

  // ------------------------------------------------------- tree props
  const tree: ListLeafTree | undefined = treeSpec
    ? {
        depth: new Map(visibleRows.map((r) => [r.id, r.depth])),
        expandable: new Set(
          visibleRows.filter((r) => r.hasChildren).map((r) => r.id),
        ),
        expanded: new Set(
          visibleRows
            .filter((r) => r.hasChildren && isExpanded(r.id))
            .map((r) => r.id),
        ),
        onToggle: onToggleExpand,
      }
    : undefined;

  const node: CompositionNode = {
    catalogId: row.widget || PAGED_LIST,
    props: {
      ...(row.props ?? {}),
      // The leaf renders exactly the rows the tree says are visible —
      // a collapsed subtree costs no rows, which is what keeps the
      // render window meaningful over a deep tree.
      items: visibleRows.map((r) => r.row),
      labelField: spec.labelField,
      // Which authority answered — `null` = core. A DOM hook and a
      // diagnostic, never a control-flow input (ADR 023: a host panel
      // that branches on plugin identity has failed regardless of
      // whether its tests pass).
      ...(provider ? { provider } : {}),
      ...(tree ? { tree } : {}),
      ...(reorder ? { reorder } : {}),
      ...(rename ? { rename } : {}),
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
