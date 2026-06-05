// SDK Phase 3 / panel-gallery pass — Stroke panel as a declarative
// composition, shaped to the gallery card.
//
// Element-scope bindings — they resolve against the single selected
// page item. LIVE: weight (FrameStrokeWeight), colour
// (FrameStrokeColor), end cap (FrameStrokeEndCap). HONEST SEAMS:
// stroke type, join, align, the dashes & arrows disclosure — no
// engine paths yet (stroke-detail roadmap).

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
      // SDK Phase 5 (v1 sweep) — end-cap toggle-group. Three
      // IDML enum values; Rectangle / Oval / Polygon /
      // GraphicLine carry the field, TextFrame does not (the
      // apply arm returns UnsupportedProperty when wired to a
      // text frame).
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
      // Engine gap — no stroke-join path yet.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Join",
        seam: true,
        placeholder: "MiterJoin",
        options: [
          { value: "MiterJoin", label: "Miter" },
          { value: "RoundJoin", label: "Round" },
          { value: "BevelJoin", label: "Bevel" },
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
        placeholder: "Center",
        options: [
          { value: "Inside", label: "Inside" },
          { value: "Center", label: "Center" },
          { value: "Outside", label: "Outside" },
        ],
      },
      bindings: {},
    },
    {
      // Engine gap — dash pattern + arrowheads unwired; ships
      // collapsed per the gallery card.
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
          props: { label: "Dash + gap", count: 2 },
          bindings: {},
          children: [
            {
              catalogId: PAGED_INPUT_NUMERIC_SCRUB,
              props: { seam: true, placeholder: "4" },
              bindings: {},
            },
            {
              catalogId: PAGED_INPUT_NUMERIC_SCRUB,
              props: { seam: true, placeholder: "2" },
              bindings: {},
            },
          ],
        },
        {
          catalogId: PAGED_INPUT_SELECT,
          props: { label: "Start arrow", seam: true, placeholder: "None" },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_SELECT,
          props: { label: "End arrow", seam: true, placeholder: "None" },
          bindings: {},
        },
      ],
    },
  ],
};
