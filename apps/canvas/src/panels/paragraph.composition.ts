// SDK Phase 3 / gallery pixel-parity — Paragraph panel, composed
// to the deep1 card (gallery-deep1.jsx `Paragraph`):
//
//   Align              (stacked label + icon segments)     LIVE
//   [0|0|0]            (3-up indents, sub-labels below)    LIVE
//   [0 pt | 6 pt]      (2-up space metrics)                LIVE
//   [Drop 0 | lines 0] (2-up + "Drop cap" caption)         LIVE
//   Hyphenate          (check row)                         LIVE
//   Keep lines together / Keep with next (check rows)      LIVE
//   Align to baseline grid (check row)                     seam
//   Paragraph rules    (disclosure: above / below structs) LIVE (bespoke)
//
// W2.1 (2026-06-06) — protocol v28 lands the paragraph layout paths
// (gap 12 closed). L/R indents, drop caps, hyphenation and keep
// options flip seam→live here; rule above/below are rendered bespoke
// in paragraph-panel.tsx (whole-struct `Value::ParagraphRule`, which
// no catalog leaf emits). Align-to-baseline-grid stays seamed (no
// matching PropertyPath on the v28 wire). Content-scope; paragraph
// paths round the range to whole paragraphs.

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
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: {
        count: 3,
        sublabels: ["L indent", "R indent", "1st indent"],
      },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-align-left", showUnit: false },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphLeftIndent",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-align-right", showUnit: false },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphRightIndent",
            },
          },
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
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2, caption: "Drop cap" },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { prefix: "Drop" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphDropCapCharacters",
            },
          },
        },
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { prefix: "Lines" },
          bindings: {
            value: {
              kind: "selectionProperty",
              scope: "content",
              path: "paragraphDropCapLines",
            },
          },
        },
      ],
    },
    {
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Hyphenate" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "paragraphHyphenation",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Keep lines together" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "paragraphKeepLinesTogether",
        },
      },
    },
    {
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Keep with next" },
      bindings: {
        value: {
          kind: "selectionProperty",
          scope: "content",
          path: "paragraphKeepWithNext",
        },
      },
    },
    {
      // Engine gap — no align-to-baseline-grid PropertyPath on the
      // v28 wire; stays an honest seam.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Align to baseline grid", seam: true },
      bindings: {},
    },
  ],
};
