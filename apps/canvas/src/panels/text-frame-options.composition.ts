// SDK Phase 5 / gallery pixel-parity — Text Frame Options, composed
// to the deep1 card (gallery-deep1.jsx `TextFrame`):
//
//   COLUMNS kicker → [⫼ count | gutter] 2-up      LIVE
//   Balance (label-left toggle)                   LIVE
//   INSET SPACING kicker → 4-up T/L/B/R           LIVE
//   Vert. justify (label-left icon segments)      LIVE
//   Auto-size (label-left select)                 LIVE
//   First baseline (label-left select)            LIVE
//
// W2.3 (2026-06-06) — protocol v28 lands the text-frame-preference
// paths (engine gap 13 closed). Every field flips seam→live on its
// `textFrame*` PropertyPath.
//
// TextFrame-ONLY parse fields: the apply arms + read-side only
// expose these on `NodeId::TextFrame`. On Rectangle / Oval / Polygon
// / GraphicLine there is no PropertyEntry, so the binding reads null
// and every control em-dashes — the same kind-specific honesty as
// the W2.2 stroke join/miter/align rows.
//
// Enum-string wires (`Value::Text`): the canvas read-side returns
// the RAW IDML enum string verbatim, so the select/segment option
// `value`s MUST be those exact strings to reflect + round-trip:
//   • Vert. justify → `{Top,Center,Bottom,Justify}Align`
//   • Auto-size     → `Off | HeightOnly | WidthOnly | HeightAndWidth
//                      | HeightAndWidthProportionally`
//   • First baseline→ `AscentOffset | CapHeight | XHeight | EmBoxHeight
//                      | LeadingOffset | FixedHeight`
// An unset field reads back as `Value::Text("")` (the enum's
// Default) — SelectLeaf keeps an empty option visible rather than
// snapping to the first entry.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_BOUNDS,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_INPUT_SELECT,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_INPUT_TOGGLE_SWITCH,
  PAGED_LAYOUT_CLUSTER,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

// IDML `<TextFramePreference VerticalJustification="...">` values.
const VERTICAL_JUSTIFY = [
  { value: "TopAlign", label: "ui-align-left" },
  { value: "CenterAlign", label: "ui-align-center" },
  { value: "BottomAlign", label: "ui-align-right" },
  { value: "JustifyAlign", label: "ui-align-justify" },
];

// IDML `<TextFramePreference AutoSizingType="...">` values.
const AUTO_SIZING = [
  { value: "Off", label: "Off" },
  { value: "HeightOnly", label: "Height only" },
  { value: "WidthOnly", label: "Width only" },
  { value: "HeightAndWidth", label: "Height & width" },
  { value: "HeightAndWidthProportionally", label: "Proportional" },
];

// IDML `<TextFramePreference FirstBaselineOffset="...">` values.
const FIRST_BASELINE = [
  { value: "AscentOffset", label: "Ascent" },
  { value: "CapHeight", label: "Cap height" },
  { value: "XHeight", label: "x height" },
  { value: "EmBoxHeight", label: "Em box height" },
  { value: "LeadingOffset", label: "Leading" },
  { value: "FixedHeight", label: "Fixed" },
];

export const textFrameOptionsComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Text Frame Options", heading: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_LAYOUT_SECTION,
      props: { title: "Columns" },
      bindings: {},
      children: [
        {
          catalogId: PAGED_LAYOUT_CLUSTER,
          props: { count: 2 },
          bindings: {},
          children: [
            {
              // LIVE column count (clamped ≥1 + rounded engine-side).
              catalogId: PAGED_INPUT_NUMERIC_SCRUB,
              props: { icon: "ui-cols-2" },
              bindings: {
                value: {
                  kind: "selectionProperty",
                  scope: "element",
                  path: "textFrameColumnCount",
                },
              },
            },
            {
              // LIVE column gutter (points).
              catalogId: PAGED_INPUT_NUMERIC_SCRUB,
              props: { prefix: "gutter" },
              bindings: {
                value: {
                  kind: "selectionProperty",
                  scope: "element",
                  path: "textFrameColumnGutter",
                },
              },
            },
          ],
        },
        {
          // LIVE balance flag.
          catalogId: PAGED_INPUT_TOGGLE_SWITCH,
          props: { label: "Balance", labelPosition: "left" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "element",
              path: "textFrameColumnBalance",
            },
          },
        },
      ],
    },
    {
      catalogId: PAGED_LAYOUT_SECTION,
      props: { title: "Inset spacing" },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_BOUNDS,
          props: { layout: "row4" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "element",
              path: "frameInsetSpacing",
            },
          },
        },
      ],
    },
    {
      // LIVE vertical justification (TextFrame-only → em-dash on
      // other kinds). Glyph segments per the deep1 card.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: { label: "Vert. justify", options: VERTICAL_JUSTIFY },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "textFrameVerticalJustification",
        },
      },
    },
    {
      // LIVE auto-size rule.
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "Auto-size", placeholder: "Off", options: AUTO_SIZING },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "textFrameAutoSizing",
        },
      },
    },
    {
      // LIVE first-baseline offset.
      catalogId: PAGED_INPUT_SELECT,
      props: {
        label: "First baseline",
        placeholder: "Ascent",
        options: FIRST_BASELINE,
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "textFrameFirstBaseline",
        },
      },
    },
  ],
};
