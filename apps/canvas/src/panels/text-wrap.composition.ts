// SDK Phase 5 / gallery pixel-parity — Text Wrap, composed to the
// deep1 card (gallery-deep1.jsx `TextWrap`):
//
//   Wrap (stacked label + glyph segments)        LIVE
//   OFFSET kicker → 4-up T/L/B/R                 LIVE
//   Wrap to (label-left select)                  seam
//   Contour (label-left soft select)             seam
//   Invert (check row)                           seam
//
// Both LIVE rows share one `Option<TextWrap>`; the apply layer
// preserves the unset half. Seams await gap 14 (wrap refinement).

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_BOUNDS,
  PAGED_INPUT_SELECT,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_INPUT_TOGGLE_SWITCH,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const textWrapComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Text Wrap", heading: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Wrap",
        labelPosition: "stack",
        options: [
          { value: "None", label: "ui-x" },
          { value: "BoundingBoxTextWrap", label: "panel-text-wrap" },
          { value: "ContourTextWrap", label: "panel-conditions" },
          { value: "JumpObjectTextWrap", label: "ui-rows" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameTextWrapMode",
        },
      },
    },
    {
      catalogId: PAGED_LAYOUT_SECTION,
      props: { title: "Offset" },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_BOUNDS,
          props: { layout: "row4" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "element",
              path: "frameTextWrapOffsets",
            },
          },
        },
      ],
    },
    {
      // Engine gap — no wrap-to-side option yet.
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "Wrap to", seam: true, placeholder: "Both edges" },
      bindings: {},
    },
    {
      // Engine gap — no contour-source option yet.
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "Contour", seam: true, placeholder: "Same as clip" },
      bindings: {},
    },
    {
      // Engine gap — no invert flag yet.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Invert", seam: true },
      bindings: {},
    },
  ],
};
