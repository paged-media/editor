// SDK Phase 5 / panel-gallery pass — Text Frame Options panel as a
// declarative composition, shaped to the gallery card.
//
// LIVE: inset spacing (`[top, left, bottom, right]` in pt; the
// `frameInsetSpacing` apply arm) as the row4 grid. HONEST SEAMS:
// columns + gutter, balance, vertical justification, auto-size,
// first baseline — each gains its binding as the text-frame
// geometry Operations ship (columns/auto-size roadmap).

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
          // Engine gap — no column-structure paths yet.
          catalogId: PAGED_LAYOUT_CLUSTER,
          props: { label: "Columns + gutter", count: 2 },
          bindings: {},
          children: [
            {
              catalogId: PAGED_INPUT_NUMERIC_SCRUB,
              props: { icon: "ui-cols-2", seam: true, placeholder: "1" },
              bindings: {},
            },
            {
              catalogId: PAGED_INPUT_NUMERIC_SCRUB,
              props: { seam: true, placeholder: "12" },
              bindings: {},
            },
          ],
        },
        {
          catalogId: PAGED_INPUT_TOGGLE_SWITCH,
          props: { label: "Balance", seam: true, placeholder: "off" },
          bindings: {},
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
          props: { label: "Insets", layout: "row4" },
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
      // Engine gap — no vertical-justification path yet.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Vert. justify",
        seam: true,
        placeholder: "Top",
        options: [
          { value: "Top", label: "Top" },
          { value: "Center", label: "Center" },
          { value: "Bottom", label: "Bottom" },
          { value: "Justify", label: "Justify" },
        ],
      },
      bindings: {},
    },
    {
      // Engine gap — no auto-size paths yet.
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "Auto-size", seam: true, placeholder: "Off" },
      bindings: {},
    },
    {
      // Engine gap — no first-baseline option yet.
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "First baseline", seam: true, placeholder: "Ascent" },
      bindings: {},
    },
  ],
};
