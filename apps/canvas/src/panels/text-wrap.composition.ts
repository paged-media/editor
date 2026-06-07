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
      // DEFER (2026-06-07) — InDesign's "Wrap to" SIDE knob
      // (left / right / both / largest-area / toward-or-away-spine) is a
      // distinct `TextWrapSide`-style property that core does NOT model
      // (the wrap MODE above — bounding-box / contour / jump — is the
      // "wrap-to" the W2.4 seam list conflated). Routing it needs a NEW
      // PropertyPath (not a path over an existing field), which would be
      // additive but the parse/render side carries no side field yet.
      // Kept as a visible seam, not a new op, per protocol governance.
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "Wrap to", seam: true, placeholder: "Both edges" },
      bindings: {},
    },
    {
      // LIVE (W2.4) — contour source for ContourTextWrap. Bound to the
      // new `frameTextWrapContourType` path (Value::Text enum string).
      // Empty value clears the override. Meaningful only when Wrap =
      // Contour; the apply arm preserves mode/offsets/invert.
      catalogId: PAGED_INPUT_SELECT,
      props: {
        label: "Contour",
        placeholder: "Same as clip",
        options: [
          { value: "", label: "Default" },
          { value: "SameAsClipping", label: "Same as clip" },
          { value: "GraphicFrame", label: "Graphic frame" },
          { value: "DetectEdges", label: "Detect edges" },
          { value: "AlphaChannel", label: "Alpha channel" },
          { value: "PhotoshopPath", label: "Photoshop path" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameTextWrapContourType",
        },
      },
    },
    {
      // LIVE (W2.4) — `IncludeInsideEdges` lets text flow into a
      // contour's interior holes. Bool path sharing the TextWrap field.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Include inside edges" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameTextWrapContourIncludeInside",
        },
      },
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
