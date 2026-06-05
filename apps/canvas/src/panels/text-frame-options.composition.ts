// SDK Phase 5 / gallery pixel-parity — Text Frame Options, composed
// to the deep1 card (gallery-deep1.jsx `TextFrame`):
//
//   COLUMNS kicker → [⫼ 1 | gutter 4] 2-up      seam
//   Balance (label-left toggle)                  seam
//   INSET SPACING kicker → 4-up T/L/B/R          LIVE
//   Vert. justify (label-left icon segments)     seam
//   Auto-size (label-left soft select)           seam
//   First baseline (label-left select)           seam
//
// Seams await engine gap 13 (text-frame geometry).

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
          props: { count: 2 },
          bindings: {},
          children: [
            {
              catalogId: PAGED_INPUT_NUMERIC_SCRUB,
              props: { icon: "ui-cols-2", seam: true, placeholder: "1" },
              bindings: {},
            },
            {
              catalogId: PAGED_INPUT_NUMERIC_SCRUB,
              props: { seam: true, placeholder: "gutter —" },
              bindings: {},
            },
          ],
        },
        {
          catalogId: PAGED_INPUT_TOGGLE_SWITCH,
          props: { label: "Balance", labelPosition: "left", seam: true },
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
      // Engine gap — no vertical-justification path yet. Glyph
      // stand-ins per the deep1 card.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Vert. justify",
        seam: true,
        options: [
          { value: "Top", label: "ui-align-left" },
          { value: "Center", label: "ui-align-center" },
          { value: "Bottom", label: "ui-align-right" },
          { value: "Justify", label: "ui-align-justify" },
        ],
      },
      bindings: {},
    },
    {
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "Auto-size", seam: true, placeholder: "Off" },
      bindings: {},
    },
    {
      catalogId: PAGED_INPUT_SELECT,
      props: { label: "First baseline", seam: true, placeholder: "Ascent" },
      bindings: {},
    },
  ],
};
