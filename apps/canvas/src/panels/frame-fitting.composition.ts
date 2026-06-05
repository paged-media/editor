// SDK Phase 5 / panel-gallery pass — Frame Fitting panel as a
// declarative composition, shaped to the gallery card.
//
// Rectangle-only — the apply layer raises UnsupportedProperty for
// other kinds (TextFrame / Oval / Polygon / GraphicLine don't
// host placed images in IDML's content-fitting sense).
//
// LIVE: fitting type (text segments per the gallery) + crops (the
// row4 bounds grid; IDML's signed-from-frame-edge convention —
// negative grows the image outward). HONEST SEAMS: auto-fit +
// fill-frame-proportionally check rows (no paths yet). The
// reference-point grid is bespoke in frame-fitting-panel.tsx.

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_BOUNDS,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_INPUT_TOGGLE_SWITCH,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const frameFittingComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Frame Fitting", heading: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Fit",
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
    {
      catalogId: PAGED_INPUT_BOUNDS,
      props: { label: "Crop", layout: "row4" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameFittingCrops",
        },
      },
    },
    {
      // Engine gap — no auto-fit flag yet.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Auto-fit", seam: true, placeholder: "off" },
      bindings: {},
    },
    {
      // Engine gap — no fill-frame-proportionally-on-place flag.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: {
        label: "Fill frame proportionally",
        seam: true,
        placeholder: "off",
      },
      bindings: {},
    },
  ],
};
