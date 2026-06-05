// SDK Phase 5 / panel-gallery pass — Text Wrap panel as a
// declarative composition, shaped to the gallery card.
//
// LIVE: mode (glyph segments) + offsets (row4 bounds grid); both
// element-scope, and the apply layer preserves the unset half when
// only one is committed. HONEST SEAMS: wrap-to side, contour
// source, invert — no engine paths yet (wrap-refinement roadmap).
//
// Reads:  `selectionProperty:frameTextWrapMode` +
//         `selectionProperty:frameTextWrapOffsets`
// Writes: same.

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
      catalogId: PAGED_INPUT_BOUNDS,
      props: { label: "Offset", layout: "row4" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "element",
          path: "frameTextWrapOffsets",
        },
      },
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
      props: { label: "Invert", seam: true, placeholder: "off" },
      bindings: {},
    },
  ],
};
