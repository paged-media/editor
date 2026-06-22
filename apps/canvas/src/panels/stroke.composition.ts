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

// SDK Phase 3 / gallery pixel-parity — Stroke panel, composed to
// the deep1 card (gallery-deep1.jsx `Stroke`): all label-left rows.
//
//   Weight  metric "1 pt"                       LIVE
//   Color   swatch                              LIVE
//   Type    select "Solid"                      LIVE  (W2.2)
//   Cap     segments                            LIVE
//   Join    icon segments                       LIVE  (W2.2, Rect-only)
//   Miter   metric "4"                          LIVE  (W2.2, Rect-only)
//   Align   segments Center/Inside/Outside      LIVE  (W2.2, Rect-only)
//   Gap     swatch + tint metric                LIVE  (W2.2)
//   Dashes & arrows (collapsed): dash/gap 2-up + start/end selects
//                                                seam
//
// W2.2 (2026-06-06) — protocol v28 lands the stroke-detail paths
// (engine gap 17 closed bar dash-array + arrowheads). Every detail
// field flips seam→live on its `frameStroke*` PropertyPath.
//
// Enum-string wires (`Value::Text`): the canvas read-side returns
// the RAW IDML reference / enum string, so the select/segment option
// `value`s MUST be those exact strings to reflect + round-trip:
//   • Type      → `StrokeStyle/$ID/{Solid,Dashed,Dotted}` (the
//                 built-in StrokeType refs the renderer maps to a
//                 dash pattern; Striped/Wavy only exist for custom
//                 `<StrokeStyle>` definitions, not the built-in $ID
//                 names, so they're out of the static list).
//   • Join      → `{Miter,Round,Bevel}EndJoin`
//   • Alignment → `{Center,Inside,Outside}Alignment`
// Join / Miter / Alignment are Rectangle-only parse fields (the apply
// arm + read-side only expose them on Rectangle) — they em-dash on
// TextFrame / Oval / Polygon / GraphicLine, the same kind-specific
// honesty as the existing end-cap row.
//
// Still seamed: the "Dashes & arrows" disclosure — no
// `frameStrokeDashArray` or arrowhead PropertyPath on the v28 wire.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_COLOR_SWATCH,
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_INPUT_SELECT,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_LAYOUT_CLUSTER,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

// Built-in IDML StrokeType references. The canvas read-side returns
// the full `StrokeStyle/$ID/...` ref; an out-of-list custom stroke
// still renders via SelectLeaf's pass-through option.
const STROKE_TYPES = [
  { value: "StrokeStyle/$ID/Solid", label: "Solid" },
  { value: "StrokeStyle/$ID/Dashed", label: "Dashed" },
  { value: "StrokeStyle/$ID/Dotted", label: "Dotted" },
];

export const strokeComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Stroke", heading: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_LENGTH,
      props: { label: "Weight", icon: "ui-size" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeWeight",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_COLOR_SWATCH,
      props: { label: "Color" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeColor",
        },
      },
    },
    {
      // LIVE stroke-type (built-in StrokeStyle refs → dash pattern).
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "Type", placeholder: "Solid", options: STROKE_TYPES },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeType",
        },
      },
    },
    {
      // LIVE end-cap (TextFrame raises UnsupportedProperty →
      // em-dash group).
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Cap",
        options: [
          { value: "ButtEndCap", label: "—" },
          { value: "RoundEndCap", label: "○" },
          { value: "ProjectingEndCap", label: "□" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeEndCap",
        },
      },
    },
    {
      // LIVE end-join (Rectangle-only parse field → em-dash on
      // other kinds). Glyph stand-ins per the deep1 card.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Join",
        options: [
          { value: "MiterEndJoin", label: "tool-polygon" },
          { value: "RoundEndJoin", label: "tool-ellipse" },
          { value: "BevelEndJoin", label: "tool-rectangle" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeJoin",
        },
      },
    },
    {
      // LIVE miter limit (Rectangle-only).
      catalogId: PAGED_INPUT_NUMERIC_SCRUB,
      props: { label: "Miter" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeMiterLimit",
        },
      },
    },
    {
      // LIVE stroke-to-path alignment (Rectangle-only).
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Align",
        options: [
          { value: "CenterAlignment", label: "Center" },
          { value: "InsideAlignment", label: "Inside" },
          { value: "OutsideAlignment", label: "Outside" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeAlignment",
        },
      },
    },
    {
      // LIVE gap colour + tint (the colour painted between dashes /
      // stripes). Mirrors the frameStrokeColor swatch binding.
      catalogId: PAGED_INPUT_COLOR_SWATCH,
      props: { label: "Gap color" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeGapColor",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_NUMERIC_SCRUB,
      props: { label: "Gap tint", suffix: "%" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameStrokeGapTint",
        },
      },
    },
    {
      // Engine gap 17 (residual) — no `frameStrokeDashArray` or
      // arrowhead PropertyPath on the v28 wire; the dash-pattern
      // editor + start/end arrowhead selects stay seamed.
      catalogId: PAGED_LAYOUT_SECTION,
      props: {
        title: "Dashes & arrows",
        collapsible: true,
        defaultOpen: false,
      },
      bindings: {},
      children: [
        {
          catalogId: PAGED_LAYOUT_CLUSTER,
          props: { count: 2 },
          bindings: {},
          children: [
            {
              catalogId: PAGED_INPUT_NUMERIC_SCRUB,
              props: { seam: true, placeholder: "dash —" },
              bindings: {},
            },
            {
              catalogId: PAGED_INPUT_NUMERIC_SCRUB,
              props: { seam: true, placeholder: "gap —" },
              bindings: {},
            },
          ],
        },
        {
          catalogId: PAGED_INPUT_SELECT,
          props: {
            label: "Start",
            labelPosition: "stack",
            seam: true,
            placeholder: "None",
          },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_SELECT,
          props: {
            label: "End",
            labelPosition: "stack",
            seam: true,
            placeholder: "None",
          },
          bindings: {},
        },
      ],
    },
  ],
};
