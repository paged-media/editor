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

// Local STRUCTURAL mirror of the plugin-api schema-panel contract
// (`@paged-media/plugin-api` `PanelSchema` / `BindingsSurface` / …).
//
// Why a mirror, not an import: `@paged-media/shell` is one layer below
// `apps/canvas` in the consumer chain and does NOT depend on
// `@paged-media/plugin-api` (only `apps/canvas` links it). The shell
// renders the schema; the bundle host (in apps/canvas) injects this
// renderer into `createBundleHost({ schemaPanelRenderer })`. The
// INJECTION POINT (apps/canvas `main.tsx`) asserts this renderer
// satisfies the real `SchemaPanelRenderer` type — so the structural
// mirror can't drift silently (a contract change fails the editor's
// typecheck at the seam, exactly the plugin-api-compat discipline).
//
// Keep these shapes a structural SUPERSET of plugin-api/src/
// panel-schema.ts + the `BindingsSurface` slice of host.ts: the v1
// members stay byte-identical; editor-side schema extensions (the
// B-01 list widget / G3 applyEntity members, and the v1.2 tree /
// reorder / rename members below) are ADDITIVE OPTIONAL members only,
// so a contract-shaped schema remains assignable and the seam assert
// keeps its teeth. plugin-api adopts the v1.2 members when a bundle
// needs them — that is a plugin-sdk change, and the superset rule is
// what lets the two land out of step.

import type { PropertyPath, Value } from "@paged-media/client";

export type WidgetValueBinding =
  | { kind: "literal"; value: Value }
  | {
      kind: "selectionProperty";
      scope?: "element" | "content";
      path: PropertyPath;
      coerce?: "pt" | "px" | "%";
    };

export interface BindingRef {
  bind: string;
  negate?: boolean;
}

export type SchemaGate = boolean | BindingRef;

// ---------------------------------------------------------------- lists
//
// B-01 list widget + G3 apply-entity write — the schema's COLLECTION
// tier. All members below are ADDITIVE (schema v1.1): a v1 schema
// (scalar rows only) parses and renders unchanged, and the widened
// row shape stays a structural SUPERSET of the plugin-api contract,
// so the injection-seam assert in apps/canvas main.tsx keeps passing
// (a narrower v1 `PanelSchema` is assignable to this one).

/** Where a `list` row's items come from. Two sources, mirroring the
 *  two live-collection lanes the shell already has:
 *    · `documentCollection` — a named engine collection (the same
 *      D1 `useCollection` lane the editor's own panels read);
 *    · `binding` — an ARRAY the plugin publishes through
 *      `host.bindings.publish(name, rows)` (the B-01 published-
 *      bindings door, now carrying rows instead of a boolean). */
export type WidgetCollectionBinding =
  | { kind: "documentCollection"; collection: string }
  | { kind: "binding"; bind: string };

/** G3 — a schema row ACTION. Either dispatches a registered command
 *  with the row id as payload, or the `applyEntity` write kind:
 *  apply the row's entity id (style / swatch self-id) to the current
 *  selection through the SAME setElementProperty mutation channel
 *  the scalar widgets commit on. `valueType` picks the wire payload
 *  (`text` for applied-style paths, `colorRef` for swatch/gradient
 *  paths) — exactly the collection-select leaf's convention. */
export type SchemaRowAction =
  | { kind: "command"; command: string }
  | {
      kind: "applyEntity";
      /** Selection surface to write to (defaults to `"element"`). */
      scope?: "element" | "content";
      /** The applied-entity PropertyPath (e.g. `frameFillColor`,
       *  `appliedParagraphStyle`). */
      path: PropertyPath;
      /** Wire payload variant; defaults to `"text"`. */
      valueType?: "text" | "colorRef";
    };

/** One per-row action button on a `list` widget. */
export interface SchemaListAction {
  /** Button label (sentence case, no emoji — brand content rules). */
  label: string;
  action: SchemaRowAction;
  /** B2 — reflect the ROW's own state on the button.
   *
   *  The schema list tier had no per-row state: an action carried one
   *  static label for every row, so the Layers panel's toggles worked
   *  and did not SHOW anything. A row read
   *  `Layer 1 [Hide/show] [Lock/unlock]` whether the layer was visible
   *  or hidden, and a locked layer was indistinguishable from an
   *  unlocked one until a click failed.
   *
   *  `field` is a dot-path into the row. When its value is falsy the
   *  button renders `labelWhenOff` and carries `data-row-state="off"`,
   *  so a spec asserts the state rather than the label text. */
  state?: { field: string; labelWhenOff: string };

  /** Gate the button on a published binding (absent = enabled;
   *  `applyEntity` actions additionally disable while the target
   *  selection is empty — the honest no-write-path rule). */
  enabled?: SchemaGate;
}

// ------------------------------------------------------- v1.2: tree rows
//
// The three things B-01/G3 recorded as still absent after the list
// tier — TREE ROWS, DRAG-REORDER, INLINE RENAME. All three hang off
// `SchemaListSpec` rather than minting rival widgets: a tree IS a list
// with parentage, and a panel that declares one should not have to
// re-declare its rows, fields, selection and actions to get it.
//
// Additive and optional throughout, so schema v1.1 (and the narrower
// `plugin-api` contract, which has not adopted these yet) stays
// assignable and the injection-seam assert in apps/canvas main.tsx
// keeps its teeth.

/** Tree rows. The row set stays FLAT — each row names its parent —
 *  which is the shape the engine hands us (`LayerSummary.parentId`,
 *  protocol 60) rather than a nested wire form every producer would
 *  have to build and the widget would immediately re-flatten.
 *
 *  A row whose parent field is absent/null, or names an id that is not
 *  in the row set (an ORPHAN — a partial collection, one layer's
 *  items), renders as a ROOT. Rows are never dropped for structural
 *  reasons; see `schema-tree.ts` for the cycle rule. */
export interface SchemaTreeSpec {
  /** Dot-path into a row object carrying its PARENT row's id. */
  parentField: string;
  /** Whether rows with children start expanded (default `true` — a
   *  fully-collapsed tree over the common 3-layer document reads as
   *  broken; a panel over a deep tree opts out, and a collapsed
   *  subtree costs no rendered rows at all). */
  defaultExpanded?: boolean;
  // NO `expansionBinding`. Expansion is panel-local UI state and is
  // NOT published, which has one honest consequence worth stating:
  // closing and reopening the dock tab resets it. A published lane
  // (the `selectionBinding` shape) would fix that and let sibling
  // rows gate on expansion — it is left out until a panel asks,
  // rather than shipped untested on the guess that one will.
}

// ---------------------------------------------------- v1.2: drag-reorder

/** What a completed drag WRITES.
 *
 *  `reorderElement` is the engine's own z-order op (protocol 59) —
 *  deliberately NOT a reorder path invented here. Its `{ index }` form
 *  is the absolute one: `to` is the row's FINAL slot after the drag,
 *  which is exactly what a drop position means. Inherited limits,
 *  stated rather than rediscovered:
 *
 *    · it reorders WITHIN the sibling list the element already belongs
 *      to — it cannot reparent. A drop across parents is therefore
 *      REJECTED by the renderer, never silently flattened into a
 *      same-parent move;
 *    · an out-of-range index is rejected by the engine, never clamped.
 *      The renderer does not pre-clamp either — a stale row set should
 *      produce a loud rejection, not a plausible wrong move;
 *    · index 0 is the BACKMOST slot. The declaring panel's row order
 *      IS the engine's sibling order; a panel that wants front-at-top
 *      display uses the `command` kind and does its own arithmetic
 *      (there is no display-order knob until a real consumer needs
 *      one).
 *
 *  `command` is the escape hatch for everything the element z-order op
 *  does not model — layer order (`layerMove`), plugin-owned row sets —
 *  and receives a `SchemaReorderPayload`. */
export type SchemaReorderAction =
  | { kind: "command"; command: string }
  | {
      kind: "reorderElement";
      /** Dot-path into the row carrying its `ElementId` KIND
       *  ("rectangle", "textFrame", …); defaults to "kind". A row
       *  whose kind is missing or not an element kind is not
       *  draggable — the honest no-write-path rule. */
      elementKindField?: string;
    };

/** Payload handed to a `command` reorder. Sibling indices, so the
 *  numbers mean the same thing for a flat list and for a tree. */
export interface SchemaReorderPayload {
  /** The dragged row's id. */
  id: string;
  /** Its sibling index before the drag. */
  fromIndex: number;
  /** Its sibling index after the drag (the FINAL slot). */
  toIndex: number;
  /** The shared parent id, or `null` at the root. */
  parentId: string | null;
}

/** Drag-to-reorder on a `list` widget. Absent = rows are not
 *  draggable (unchanged v1.1 behaviour). */
export interface SchemaListReorder {
  action: SchemaReorderAction;
  /** Gate dragging on a published binding (absent = enabled). */
  enabled?: SchemaGate;
}

// --------------------------------------------------- v1.2: inline rename

/** What a committed rename WRITES.
 *
 *  COMMAND-ONLY, and that is a measurement, not a shortcut: every
 *  rename the engine models is a dedicated mutation, not a property
 *  write. `layerSetName` needs `NodeId::Layer`, which the wire
 *  `ElementId` cannot even express; `editSwatch` takes a whole
 *  `SwatchSpec`; `renameParagraphStyle` and its four siblings are
 *  their own ops. There is no element-name `PropertyPath` to bind to,
 *  so an `applyEntity`-style typed write would have nothing to write.
 *  Vector-valued or op-shaped writes stay commands — the same line the
 *  list tier already drew. */
export type SchemaRenameAction = { kind: "command"; command: string };

/** Payload handed to a rename command. */
export interface SchemaRenamePayload {
  id: string;
  /** The committed text, trimmed. Never empty and never equal to the
   *  previous value — the renderer swallows both as no-ops rather than
   *  spending an undo step on nothing. */
  name: string;
}

/** Double-click-to-rename on a `list` widget. Absent = rows are not
 *  renameable (unchanged v1.1 behaviour). */
export interface SchemaListRename {
  action: SchemaRenameAction;
  /** Dot-path the editor seeds its draft from; defaults to the list's
   *  `labelField`. */
  field?: string;
  /** Gate renaming on a published binding (absent = enabled). */
  enabled?: SchemaGate;
}

/** The `list` widget spec (widget id `paged.list`). Renders rows
 *  from a collection binding; publishes the clicked row's id back
 *  through `selectionBinding` so other rows/sections can gate on it. */
export interface SchemaListSpec {
  items: WidgetCollectionBinding;
  /** Dot-path into a row object for the primary label ("name"). */
  labelField: string;
  /** Optional secondary line (mono), e.g. "kind". */
  secondaryField?: string;
  /** Dot-path carrying the row's stable id; defaults to "selfId"
   *  (the summary-shape convention every document collection uses). */
  idField?: string;
  /** Published binding name that receives the selected row id on
   *  click (string). Absent = the list keeps private selection. */
  selectionBinding?: string;
  /** Per-row action buttons. */
  actions?: SchemaListAction[];
  /** ADDITIVE (v1.2) — render the rows as a TREE. */
  tree?: SchemaTreeSpec;
  /** ADDITIVE (v1.2) — which end of the engine's sibling order is drawn
   *  FIRST.
   *
   *  `"source"` (the default, and the v1.2 shipping behaviour) draws the
   *  collection verbatim: index 0 at the top. That is the ENGINE's
   *  back-to-front order — `layers[0]` is the BACKMOST layer, the first
   *  element in a sibling list paints first.
   *
   *  `"frontFirst"` reverses each sibling group, which is what every DTP
   *  Layers panel does (InDesign, Illustrator, and plugin-draw's own
   *  panel all sort front-to-back). v1.2 shipped without this knob and
   *  told a panel that wanted it to use the `command` reorder lane and
   *  do its own arithmetic; the host Layers panel is the real consumer
   *  that makes it worth having, and the arithmetic is exactly what it
   *  removes — `SchemaReorderPayload` still carries SOURCE sibling
   *  indices, so a reorder command is written once and is correct in
   *  both orders. */
  displayOrder?: "source" | "frontFirst";
  /** ADDITIVE (v1.2) — drag rows to reorder. */
  reorder?: SchemaListReorder;
  /** ADDITIVE (v1.2) — double-click a row label to rename it. */
  rename?: SchemaListRename;
}

export interface PanelSchemaRow {
  widget: string;
  props?: Record<string, unknown>;
  value?: WidgetValueBinding;
  /** ADDITIVE (v1.1) — present iff `widget` is the list widget
   *  (`paged.list`). Scalar rows ignore it. */
  list?: SchemaListSpec;
  visible?: SchemaGate;
  enabled?: SchemaGate;
}

export interface PanelSchemaSection {
  title?: string;
  collapsible?: boolean;
  rows: PanelSchemaRow[];
  visible?: SchemaGate;
}

export interface PanelSchema {
  id: string;
  title: string;
  icon?: string;
  defaultDock?: "left" | "right" | "top" | "bottom" | "center";
  defaultGroup?: string;
  sections: PanelSchemaSection[];
}

/** The publish-bindings door the renderer subscribes to (the
 *  `BindingsSurface` slice it uses). */
export interface BindingsSurface {
  publish(name: string, value: unknown): void;
  get(name: string): unknown;
  delete(name: string): void;
  onDidChange(listener: (name: string) => void): { dispose(): void };
}

export interface SchemaPanelRendererProps {
  schema: PanelSchema;
  bindings: BindingsSurface;
}
