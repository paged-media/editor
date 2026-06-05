// SDK Phase 3 / panel-gallery pass — Character panel as a
// declarative composition, shaped to the gallery card
// (brand/editor/ui_kits/editor: gallery "Character").
//
// All bindings are `selectionProperty` refs with `scope: "content"`
// — they resolve against the current ContentSelection, mapped to
// an `ElementId.storyRange` by the binding hook. Reads come from
// `model.element_properties(StoryRange { ... })`; writes go through
// the apply arm at `(NodeId::StoryRange, CharacterFontSize | ...)`.
//
// LIVE: size, leading, tracking, fill. HONEST SEAMS (`seam: true`,
// visibly disabled — no engine paths yet): font family/style,
// kerning, baseline shift, case, position, language. The OpenType
// chip row is bespoke in character-panel.tsx (chips exceed the
// composition vocabulary).
//
// Per the plan's binding ceiling (§11.5): literals + selectionProperty
// refs only — no expressions, no conditionals, no formatters.

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
      props: { label: "Family", seam: true, placeholder: "—" },
      bindings: {},
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { label: "Style + size", count: 2 },
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
      props: { label: "Leading + tracking", count: 2 },
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
      props: { label: "Kerning + baseline", count: 2 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { icon: "ui-kerning", seam: true, placeholder: "0" },
          bindings: {},
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { icon: "ui-size", seam: true, placeholder: "0" },
          bindings: {},
        },
      ],
    },
    {
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
    {
      // Engine gap — no character-case path yet.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Case",
        seam: true,
        placeholder: "Normal",
        options: [
          { value: "Normal", label: "ab" },
          { value: "AllCaps", label: "AB" },
          { value: "SmallCaps", label: "Ab" },
        ],
      },
      bindings: {},
    },
    {
      // Engine gap — no character-position path yet.
      catalogId: PAGED_INPUT_TOGGLE_GROUP,
      props: {
        label: "Position",
        seam: true,
        placeholder: "Normal",
        options: [
          { value: "Normal", label: "x" },
          { value: "Superscript", label: "x²" },
          { value: "Subscript", label: "x₂" },
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
  ],
};
