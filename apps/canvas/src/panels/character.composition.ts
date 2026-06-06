// SDK Phase 3 / gallery pixel-parity — Character panel, composed
// to the deep1 card (gallery-deep1.jsx `Character`):
//
//   Family            (stacked label + select)            LIVE (bespoke)
//   [Style ▾ | 11 pt] (2-up: select + size metric)        LIVE | LIVE
//   [16 pt  | 0    ]  (2-up: leading + tracking metrics)  LIVE
//   [Metrics| 0 pt ]  (2-up: kerning + baseline metrics)  LIVE
//   [H 100 | V 100 | 0°] (3-up: scale + skew)             LIVE
//   Case              (label-left segments ab/AB/Ab)      LIVE
//   Position          (label-left icon segments)          LIVE
//   Underline / Strikethru / Ligatures (check rows)       LIVE
//   Language          (label-left select)                 LIVE
//   Fill              (label-left swatch — live extra;
//                      the card hosts fill in Properties)  LIVE
//   OPENTYPE          (bespoke chips in character-panel)  seam
//
// W2.1 (2026-06-06) — protocol v28 lands the character formatting
// paths (gaps 5/11 closed). Every field flips seam→live except
// Family (rendered bespoke in character-panel.tsx — the `fonts`
// collection rows key on `family`, not the `{selfId,name}` shape
// the catalog CollectionSelect leaf expects) and the OpenType chip
// row (the opaque `characterOtfFeatures` tag string has no chip
// mapping — see character-panel.tsx). Content-scope bindings; the
// binding hook maps the selection to a StoryRange.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_COLOR_SWATCH,
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_INPUT_SELECT,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_INPUT_TOGGLE_SWITCH,
  PAGED_LAYOUT_CLUSTER,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

// Common IDML FontStyle face names — a static write surface (no
// per-family face listing on the wire yet). An out-of-list current
// value still renders via SelectLeaf's pass-through option.
const FONT_STYLES = [
  { value: "Regular", label: "Regular" },
  { value: "Italic", label: "Italic" },
  { value: "Bold", label: "Bold" },
  { value: "Bold Italic", label: "Bold Italic" },
  { value: "Light", label: "Light" },
  { value: "Medium", label: "Medium" },
  { value: "Semibold", label: "Semibold" },
];

// IDML KerningMethod enum strings.
const KERNING_METHODS = [
  { value: "Metrics", label: "Metrics" },
  { value: "Optical", label: "Optical" },
  { value: "None", label: "None" },
];

// A pragmatic short list of IDML AppliedLanguage names; an
// out-of-list current value renders via the pass-through option.
const LANGUAGES = [
  { value: "$ID/English: USA", label: "English: USA" },
  { value: "$ID/English: UK", label: "English: UK" },
  { value: "$ID/German", label: "German" },
  { value: "$ID/French", label: "French" },
  { value: "$ID/Spanish", label: "Spanish" },
  { value: "$ID/Italian", label: "Italian" },
];

export const characterComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Character", heading: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_SELECT,
          props: { placeholder: "—", options: FONT_STYLES },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "characterFontStyle",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-size" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "characterFontSize",
            },
          },
        },
      ],
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-leading" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "characterLeading",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { icon: "ui-tracking" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "characterTracking",
            },
          },
        },
      ],
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_SELECT,
          props: { icon: "ui-kerning", options: KERNING_METHODS },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "characterKerningMethod",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-size" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "characterBaselineShift",
            },
          },
        },
      ],
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 3, sublabels: ["H scale", "V scale", "Skew"] },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { suffix: "%" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "characterHorizontalScale",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { suffix: "%" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "characterVerticalScale",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { suffix: "°" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "characterSkew",
            },
          },
        },
      ],
    },
    {
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Case",
        options: [
          { value: "Normal", label: "ab" },
          { value: "AllCaps", label: "AB" },
          { value: "SmallCaps", label: "Ab" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "characterCase",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Position",
        options: [
          { value: "Normal", label: "ui-minus" },
          { value: "Superscript", label: "ui-size" },
          { value: "Subscript", label: "ui-leading" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "characterPosition",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Underline" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "characterUnderline",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Strikethrough" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "characterStrikethru",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Ligatures" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "characterLigatures",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "Language", placeholder: "—", options: LANGUAGES },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "characterLanguage",
        },
      },
    },
    {
      // LIVE extra beyond the card (the card hosts fill in the
      // Properties inspector) — kept for capability.
      catalogId: PAGED_INPUT_COLOR_SWATCH,
      props: { label: "Fill" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "characterFillColor",
        },
      },
    },
  ],
};
