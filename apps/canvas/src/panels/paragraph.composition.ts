// SDK Phase 3 / gallery pixel-parity — Paragraph panel, composed
// to the deep1 card (gallery-deep1.jsx `Paragraph`):
//
//   Align              (stacked label + icon segments)     LIVE
//   [0|0|0]            (3-up indents, sub-labels below)    seam·seam·LIVE
//   [0 pt | 6 pt]      (2-up space metrics)                LIVE
//   [Drop 0 | lines 0] (2-up + "Drop cap" caption)         seam
//   Hyphenate          (check row)                         seam
//   Align to baseline grid (check row)                     seam
//   Paragraph rules    (collapsed disclosure: 2 check rows) seam
//
// Content-scope; paragraph paths round the range to whole
// paragraphs. Seams await engine gap 12 (paragraph layout).

import type { CompositionNode } from "@paged-media/catalog";
import {
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_INPUT_TOGGLE_GROUP,
  PAGED_INPUT_TOGGLE_SWITCH,
  PAGED_LAYOUT_CLUSTER,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

export const paragraphComposition: CompositionNode = {
  catalogId: PAGED_LAYOUT_SECTION,
  props: { title: "Paragraph", heading: false },
  bindings: {},
  children: [
    {
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Align",
        labelPosition: "stack",
        options: [
          { value: "LeftAlign", label: "ui-align-left" },
          { value: "CenterAlign", label: "ui-align-center" },
          { value: "RightAlign", label: "ui-align-right" },
          { value: "LeftJustified", label: "ui-align-justify" },
        ],
      },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "paragraphJustification",
        },
      },
    },
    {
      // L/R indents are engine gaps; first-line indent is LIVE.
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: {
        count: 3,
        sublabels: ["L indent", "R indent", "1st indent"],
      },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { icon: "ui-align-left", seam: true, placeholder: "0" },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { icon: "ui-align-right", seam: true, placeholder: "0" },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-align-left", showUnit: false },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphFirstLineIndent",
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
              path: "paragraphSpaceBefore",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-leading" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphSpaceAfter",
            },
          },
        },
      ],
    },
    {
      // Engine gap — no drop-cap paths; 0 is the truthful default
      // (no drop cap).
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2, caption: "Drop cap" },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { seam: true, placeholder: "Drop 0" },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { seam: true, placeholder: "lines 0" },
          bindings: {},
        },
      ],
    },
    {
      // Engine gap — no hyphenation path yet.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Hyphenate", seam: true },
      bindings: {},
    },
    {
      // Engine gap — no baseline-grid path yet.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Align to baseline grid", seam: true },
      bindings: {},
    },
    {
      // Engine gap — paragraph rules unwired; ships collapsed.
      catalogId: PAGED_LAYOUT_SECTION,
      props: {
        title: "Paragraph rules",
        collapsible: true,
        defaultOpen: false,
      },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_TOGGLE_SWITCH,
          props: { label: "Rule above", seam: true },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_TOGGLE_SWITCH,
          props: { label: "Rule below", seam: true },
          bindings: {},
        },
      ],
    },
  ],
};
