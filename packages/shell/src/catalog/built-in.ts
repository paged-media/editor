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

// SDK Phase 3 — default catalog registrations.
//
// Adds the primitive leaves to a `CatalogRegistry`. Apps call
// `registerBuiltInCatalogEntries(registry)` once at startup.

import type { CatalogEntry, CatalogRegistry } from "@paged-media/catalog";

import {
  BoundsLeaf,
  CollectionSelectLeaf,
  ColorSwatchLeaf,
  LabelLeaf,
  LayoutClusterLeaf,
  LayoutSectionLeaf,
  LengthLeaf,
  ListLeaf,
  NumericScrubLeaf,
  ReadoutLeaf,
  SelectLeaf,
  ToggleGroupLeaf,
  ToggleSwitchLeaf,
} from "./leaves";

/** Stable catalog ids the rest of the codebase references. */
export const PAGED_INPUT_LENGTH = "paged.input.length";
export const PAGED_INPUT_COLOR_SWATCH = "paged.input.color-swatch";
export const PAGED_INPUT_NUMERIC_SCRUB = "paged.input.numeric-scrub";
export const PAGED_INPUT_BOUNDS = "paged.input.bounds";
export const PAGED_INPUT_COLLECTION_SELECT = "paged.input.collection-select";
export const PAGED_INPUT_TOGGLE_GROUP = "paged.input.toggle-group";
export const PAGED_INPUT_SELECT = "paged.input.select";
export const PAGED_INPUT_TOGGLE_SWITCH = "paged.input.toggle-switch";
export const PAGED_READOUT = "paged.readout";
export const PAGED_LIST = "paged.list";
export const PAGED_LAYOUT_SECTION = "paged.layout.section";
export const PAGED_LAYOUT_CLUSTER = "paged.layout.cluster";
export const PAGED_LABEL = "paged.label";

// Leaf binding declarations describe the leaf's *write surface* —
// the audit-only declaration that this primitive emits a typed
// `selectionProperty:*` commit regardless of which specific
// `PropertyPath` the composition wires it to. The actual binding
// at render time comes from the composition node's `bindings` dict
// (still constrained by the §11.5 binding ceiling: literal + ref +
// coerce). Each primitive declares a `selectionProperty:*` reads +
// writes pair — the audit surface confirms the leaf is on the
// supported wire, without committing to a specific path.

const ENTRIES: CatalogEntry[] = [
  {
    id: PAGED_INPUT_LENGTH,
    kind: "leaf",
    props: {
      label: "string",
      labelPosition: "string",
      icon: "string",
      prefix: "string",
      showUnit: "boolean",
      unitPicker: "boolean",
      seam: "boolean",
      placeholder: "string",
    },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: LengthLeaf,
  },
  {
    id: PAGED_INPUT_COLOR_SWATCH,
    kind: "leaf",
    props: { label: "string" },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: ColorSwatchLeaf,
  },
  {
    id: PAGED_INPUT_NUMERIC_SCRUB,
    kind: "leaf",
    props: {
      label: "string",
      labelPosition: "string",
      icon: "string",
      prefix: "string",
      suffix: "string",
      seam: "boolean",
      placeholder: "string",
    },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: NumericScrubLeaf,
  },
  {
    id: PAGED_INPUT_BOUNDS,
    kind: "leaf",
    props: {
      label: "string",
      labels: "JsonValue",
      layout: "string",
      seam: "boolean",
    },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: BoundsLeaf,
  },
  {
    // SDK Phase 5 (D7) — apply-an-entity selector. Reads its row
    // list from any named document collection per
    // `panel-catalog-and-sdk-extension.md` §9 + §11.5. The
    // composition node parameterises `collectionName`; the leaf's
    // bindings declaration is a generic
    // `documentCollection:swatches` placeholder for audit purposes
    // (every composition that uses this primitive declares its
    // *specific* collection via the prop). The write goes through
    // `selectionProperty:*` — the composition binds the leaf's
    // `value` to whichever applied-entity path (e.g.
    // `appliedParagraphStyle`).
    id: PAGED_INPUT_COLLECTION_SELECT,
    kind: "leaf",
    props: { label: "string", collectionName: "string" },
    bindings: {
      reads: ["selectionProperty:*", "documentCollection:swatches"],
      writes: ["selectionProperty:*"],
    },
    leaf: CollectionSelectLeaf,
  },
  {
    // SDK Phase 5 (v1 sweep) — segmented multi-state toggle.
    // Reads a `Value::Text` enum string; commits the picked
    // option's `value` as a Text payload. Per
    // `panel-catalog-and-sdk-extension.md` §9. First users in
    // v1: Paragraph alignment (justification) + Stroke end-cap
    // (≥2 panels rule).
    id: PAGED_INPUT_TOGGLE_GROUP,
    kind: "leaf",
    props: {
      label: "string",
      options: "JsonValue",
      seam: "boolean",
      placeholder: "string",
    },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: ToggleGroupLeaf,
  },
  {
    // Panel-gallery pass — generic enum select. Static option
    // list (composition data, not a document collection); binds a
    // `Value::Text` enum string. Seam-capable: `seam: true` +
    // `placeholder` renders the disabled select (honest seam).
    id: PAGED_INPUT_SELECT,
    kind: "leaf",
    props: {
      label: "string",
      options: "JsonValue",
      seam: "boolean",
      placeholder: "string",
    },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: SelectLeaf,
  },
  {
    // Panel-gallery pass — on/off switch pill (kit `Toggle`).
    // Binds a `Value::Bool`. Seam-capable (`placeholder: "on"`
    // pins the disabled pill's position).
    id: PAGED_INPUT_TOGGLE_SWITCH,
    kind: "leaf",
    props: { label: "string", seam: "boolean", placeholder: "string" },
    bindings: {
      reads: ["selectionProperty:*"],
      writes: ["selectionProperty:*"],
    },
    leaf: ToggleSwitchLeaf,
  },
  {
    // Panel-gallery pass — read-only mono readout row. Renders
    // any resolved Value variant tabular-mono; `text` renders a
    // literal when no binding is wired. No write surface.
    id: PAGED_READOUT,
    kind: "leaf",
    props: { label: "string", text: "string" },
    bindings: { reads: ["selectionProperty:*"], writes: [] },
    leaf: ReadoutLeaf,
  },
  {
    // B-01 — the collection LIST widget (schema-panel lane + expert
    // compositions). Rows come from a named document collection
    // (`collectionName`, the same `useCollection` lane the
    // collection-select leaf reads) or arrive pre-resolved as
    // `items` (the schema renderer's path — it also resolves
    // plugin-published `binding` collections + the G3 action
    // dispatch there). The audit declaration mirrors the
    // collection-select placeholder convention: a generic
    // `documentCollection:swatches` read; the write surface is the
    // G3 applyEntity path — `selectionProperty:*` through the same
    // setElementProperty channel the scalar widgets commit on.
    id: PAGED_LIST,
    kind: "leaf",
    props: {
      label: "string",
      collectionName: "string",
      labelField: "string",
      secondaryField: "string",
      idField: "string",
      items: "JsonValue",
      actions: "JsonValue",
    },
    bindings: {
      reads: ["documentCollection:swatches"],
      writes: ["selectionProperty:*"],
    },
    leaf: ListLeaf,
  },
  {
    id: PAGED_LAYOUT_SECTION,
    kind: "leaf", // layout-only leaf; children come from the composition node
    props: {
      title: "string",
      heading: "boolean",
      collapsible: "boolean",
      defaultOpen: "boolean",
    },
    bindings: { reads: [], writes: [] },
    leaf: LayoutSectionLeaf,
  },
  {
    // Panel-gallery pass — bare multi-control metric row (the
    // kit's 2-up/3-up grids). Layout-only; children omit labels
    // and carry icon chips / in-field prefixes; `sublabels`
    // renders 8.5px cell labels below, `caption` a trailing
    // 10.5px note ("Drop cap").
    id: PAGED_LAYOUT_CLUSTER,
    kind: "leaf",
    props: {
      label: "string",
      labelPosition: "string",
      count: "number",
      sublabels: "JsonValue",
      caption: "string",
    },
    bindings: { reads: [], writes: [] },
    leaf: LayoutClusterLeaf,
  },
  {
    id: PAGED_LABEL,
    kind: "leaf",
    props: { text: "string" },
    bindings: { reads: [], writes: [] },
    leaf: LabelLeaf,
  },
];

export function registerBuiltInCatalogEntries(registry: CatalogRegistry) {
  for (const entry of ENTRIES) {
    registry.register(entry);
  }
}
