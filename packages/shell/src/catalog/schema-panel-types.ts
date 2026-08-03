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
// B-01 list widget / G3 applyEntity members below) are ADDITIVE
// OPTIONAL members only, so a contract-shaped schema remains
// assignable and the seam assert keeps its teeth.

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
  /** Gate the button on a published binding (absent = enabled;
   *  `applyEntity` actions additionally disable while the target
   *  selection is empty — the honest no-write-path rule). */
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
