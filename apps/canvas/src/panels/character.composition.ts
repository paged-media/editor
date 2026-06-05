// SDK Phase 3 / gallery pixel-parity — Character panel, composed
// to the deep1 card (gallery-deep1.jsx `Character`):
//
//   Family            (stacked label + select)            seam
//   [Style ▾ | 11 pt] (2-up: select + size metric)        seam | LIVE
//   [16 pt  | 0    ]  (2-up: leading + tracking metrics)  LIVE
//   [Metrics| 0 pt ]  (2-up: kerning + baseline metrics)  seam
//   Case              (label-left segments ab/AB/Ab)      seam
//   Position          (label-left icon segments)          seam
//   Language          (label-left select)                 seam
//   Fill              (label-left swatch — live extra;
//                      the card hosts fill in Properties)  LIVE
//   OPENTYPE          (bespoke chips in character-panel)  seam
//
// Content-scope bindings; the binding hook maps the selection to a
// StoryRange. Seams await engine gaps 5/11 (character formatting
// paths).

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

export const characterComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Character", heading: false },
  bindings: {},
  children: [
    {
      // Engine gap — no characterFontFamily path yet.
      catalogId: PAGED_INPUT_SELECT,
      props: {
        label: "Family",
        labelPosition: "stack",
        seam: true,
        placeholder: "—",
      },
      bindings: {},
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2 },
      bindings: {},
      children: [
        {
          // Engine gap — no characterFontStyle path yet.
          catalogId: PAGED_INPUT_SELECT,
          props: { seam: true, placeholder: "—" },
          bindings: {},
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
      // Engine gap — no characterKerning / baseline-shift paths yet.
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { icon: "ui-kerning", seam: true, placeholder: "Metrics" },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-size", seam: true, placeholder: "0 pt" },
          bindings: {},
        },
      ],
    },
    {
      // Engine gap — no character-case path yet.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Case",
        seam: true,
        options: [
          { value: "Normal", label: "ab" },
          { value: "AllCaps", label: "AB" },
          { value: "SmallCaps", label: "Ab" },
        ],
      },
      bindings: {},
    },
    {
      // Engine gap — no character-position path yet. Glyph
      // stand-ins per the deep1 card.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Position",
        seam: true,
        options: [
          { value: "Normal", label: "ui-minus" },
          { value: "Superscript", label: "ui-size" },
          { value: "Subscript", label: "ui-leading" },
        ],
      },
      bindings: {},
    },
    {
      // Engine gap — no appliedLanguage path yet.
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "Language", seam: true, placeholder: "—" },
      bindings: {},
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
