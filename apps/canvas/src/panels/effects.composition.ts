// SDK Phase 5 / gallery pixel-parity — the Drop Shadow expansion
// fields (rendered inside the Effects panel's violet-railed block,
// per the deep1 card):
//
//   Mode        (label-left select)           LIVE (Drop/Inner)
//   [X … | Y …] (2-up prefixes)               LIVE
//   [Blur … | Spread …] (2-up)                LIVE | seam
//   Color       (label-left swatch)           LIVE
//   Opacity     (label-left metric %)         LIVE
//
// The apply arms materialise a default DropShadowSetting on the
// first per-field write into a prior-None state.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_COLOR_SWATCH,
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_INPUT_SELECT,
  PAGED_LAYOUT_CLUSTER,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const effectsComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Drop shadow", heading: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_SELECT,
      props: {
        label: "Mode",
        options: [
          { value: "Drop", label: "Drop" },
          { value: "Inner", label: "Inner" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameDropShadowMode",
        },
      },
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { prefix: "X", showUnit: false },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "element",
              path: "frameDropShadowXOffset",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { prefix: "Y", showUnit: false },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "element",
              path: "frameDropShadowYOffset",
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
          props: { prefix: "Blur", showUnit: false },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "element",
              path: "frameDropShadowSize",
            },
          },
        },
        {
          // Engine gap — no shadow-spread path yet.
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { seam: true, placeholder: "Spread —" },
          bindings: {},
        },
      ],
    },
    {
      catalogId: PAGED_INPUT_COLOR_SWATCH,
      props: { label: "Color" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameDropShadowColor",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_NUMERIC_SCRUB,
      props: { label: "Opacity", suffix: "%" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameDropShadowOpacity",
        },
      },
    },
  ],
};
