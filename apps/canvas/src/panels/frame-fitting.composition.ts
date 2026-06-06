// SDK Phase 5 / gallery pixel-parity — Frame Fitting fields. Split
// in two so the panel can interleave the reference-point grid
// between Fit and Crop per the deep1 card order:
//
//   Fit (stacked text segments)                  LIVE
//   [ref grid] Align content                     LIVE  (W2.3, bespoke)
//   Crop (stacked 4-up T/L/B/R)                  LIVE
//   Auto-fit row                                 LIVE  (W2.3)
//   Fill frame proportionally row                seam
//
// Rectangle-only — every field is a `NodeId::Rectangle` apply arm,
// so other kinds have no PropertyEntry and em-dash. W2.3 (2026-06-06)
// — protocol v28 lands `frameFittingReferencePoint` (raw IDML anchor
// string) + `frameAutoFit` (Bool). Fill-frame-proportionally stays a
// seam — it is a place-time behaviour with no PropertyPath.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_BOUNDS,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_INPUT_TOGGLE_SWITCH,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const frameFittingFitComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Frame Fitting", heading: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Fit",
        labelPosition: "stack",
        options: [
          { value: "None", label: "None" },
          { value: "FillProportionally", label: "Fill" },
          { value: "Proportionally", label: "Fit" },
          { value: "FitContent", label: "Content" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameFittingType",
        },
      },
    },
  ],
};

/** Combined tree (fit + crop/auto-fit) — the Properties panel's
 *  Image-inspector embed, where the bespoke ref-grid interleave
 *  isn't needed. */
export const frameFittingComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Frame Fitting", heading: false },
  bindings: {},
  get children() {
    return [
      ...(frameFittingFitComposition.children ?? []),
      ...(frameFittingCropComposition.children ?? []),
    ];
  },
};

export const frameFittingCropComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Crop & auto-fit", heading: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_BOUNDS,
      props: { label: "Crop", labelPosition: "stack", layout: "row4" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameFittingCrops",
        },
      },
    },
    {
      // LIVE auto-fit flag (W2.3). Rectangle-only → em-dash on
      // other kinds.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Auto-fit" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameAutoFit",
        },
      },
    },
    {
      // Engine gap — fill-frame-proportionally is a place-time
      // behaviour, not a persisted PropertyPath.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Fill frame proportionally", seam: true },
      bindings: {},
    },
  ],
};
