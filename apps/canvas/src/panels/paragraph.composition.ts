// SDK Phase 3 / panel-gallery pass — Paragraph panel as a
// declarative composition, shaped to the gallery card.
//
// Content-scope bindings. Paragraph paths apply to a
// `NodeId::StoryRange` and round the range to whole paragraphs
// (paragraphs are atomic — you can't half-apply space-before).
// The snapshot returns one value per intersecting paragraph,
// collapsed to `Some(value)` when they agree or `None` for mixed.
//
// LIVE: alignment (icon segments), space before/after, first-line
// indent. HONEST SEAMS: left/right indents, drop cap, hyphenate,
// align-to-baseline-grid, paragraph rules (no engine paths yet).

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
      // SDK Phase 5 (v1 sweep) — alignment toggle-group, now with
      // the kit's alignment glyphs. Four-segment IDML default
      // alignments. `LeftJustified` / `CenterJustified` /
      // `RightJustified` / `FullyJustified` (binding-aware
      // aliases) land when a binding-side selector ships.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Align",
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
      // L/R indents are engine gaps; first-line indent is live.
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { label: "Indents L · R · 1st", count: 3 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { seam: true, placeholder: "0" },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { seam: true, placeholder: "0" },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { unitPicker: false },
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
      props: { label: "Space before + after", count: 2 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-leading", unitPicker: false },
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
          props: { icon: "ui-leading", unitPicker: false },
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
      // Engine gap — no drop-cap paths yet.
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { label: "Drop cap", count: 2 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { seam: true, placeholder: "0" },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { seam: true, placeholder: "0" },
          bindings: {},
        },
      ],
    },
    {
      // Engine gap — no hyphenation path yet.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: { label: "Hyphenate", seam: true, placeholder: "on" },
      bindings: {},
    },
    {
      // Engine gap — no baseline-grid path yet.
      catalogId: PAGED_INPUT_TOGGLE_SWITCH,
      props: {
        label: "Align to baseline grid",
        seam: true,
        placeholder: "off",
      },
      bindings: {},
    },
    {
      // Engine gap — paragraph rules are unwired; the disclosure
      // ships collapsed per the gallery card.
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
          props: { label: "Rule above", seam: true, placeholder: "off" },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_TOGGLE_SWITCH,
          props: { label: "Rule below", seam: true, placeholder: "off" },
          bindings: {},
        },
      ],
    },
  ],
};
