// SDK Phase 5 / gallery pixel-parity — Text Wrap, composed to the
// deep1 card (gallery-deep1.jsx `TextWrap`):
//
//   Wrap (stacked label + glyph segments)        LIVE
//   OFFSET kicker → 4-up T/L/B/R                 LIVE
//   Wrap to (label-left select)                  seam
//   Contour (label-left soft select)             seam
//   Invert (check row)                           LIVE  (W2.3)
//
// All three LIVE rows share one `Option<TextWrap>`; the apply layer
// preserves the unset members (mode/offsets/invert). W2.3 (2026-06-06)
// — protocol v28 lands `textWrapInvert` (Bool) on every wrap-capable
// kind (TextFrame / Rectangle / Oval / Polygon / GraphicLine). Wrap-to
// (side) + contour source still seam — no PropertyPath on the v28 wire.
//
// NOTE the wire name is `textWrapInvert` (NOT `frameTextWrapInvert`)
// — it matches the PropertyPath union verbatim.

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
      // LIVE invert flag (W2.3). Shares the `Option<TextWrap>` field
      // with mode/offsets; the apply arm preserves the other members.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Invert" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "textWrapInvert",
        },
      },
    },
  ],
};
