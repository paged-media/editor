// SDK Phase 3 / gallery pixel-parity — Stroke panel, composed to
// the deep1 card (gallery-deep1.jsx `Stroke`): all label-left rows.
//
//   Weight  metric "1 pt"                       LIVE
//   Color   swatch                              LIVE
//   Type    select "Solid"                      seam
//   Cap     segments                            LIVE
//   Join    icon segments (deep1 stand-ins)     seam
//   Align   segments Center/Inside/Outside      seam
//   Dashes & arrows (collapsed): dash/gap 2-up + start/end selects
//                                                seam
//
// Seams await engine gap 17 (stroke detail).

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
      // Engine gap — no stroke-type (dash/dot/stripe) path yet.
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "Type", seam: true, placeholder: "Solid" },
      bindings: {},
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
      // Engine gap — no stroke-join path yet. Glyph stand-ins per
      // the deep1 card.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Join",
        seam: true,
        options: [
          { value: "MiterJoin", label: "tool-polygon" },
          { value: "RoundJoin", label: "tool-ellipse" },
          { value: "BevelJoin", label: "tool-rectangle" },
        ],
      },
      bindings: {},
    },
    {
      // Engine gap — no stroke-alignment path yet.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Align",
        seam: true,
        options: [
          { value: "Center", label: "Center" },
          { value: "Inside", label: "Inside" },
          { value: "Outside", label: "Outside" },
        ],
      },
      bindings: {},
    },
    {
      // Engine gap — dash pattern + arrowheads unwired.
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
