// SDK Phase 5 / gallery pixel-parity — the per-effect expansion
// fields rendered inside the Effects panel's violet-railed disclosure
// blocks (one composition per effect family, per the deep1 card).
//
// W2.2 (2026-06-06) — protocol v28 lands the per-field effect paths
// (engine gap 18: blend modes + glow/bevel/satin/feather models).
// Every family flips from a disabled seam pill to a live disclosure
// mirroring the drop-shadow template: an enable pill + per-field
// editors over its `frame{Family}{Field}` PropertyPaths.
//
// The apply arms materialise a default effect struct on the enable
// toggle (set `frame{Family}Enabled = true`), so the per-field
// editors always have a target to mutate. Enum-string fields
// (`Value::Text`) carry the IDML enum strings the parser stores:
//   • Blend mode → InDesign `BlendMode` (Normal / Multiply / Screen…)
//   • Bevel style/technique/direction → InnerBevel / Smooth / Up …
//   • Inner-glow source → EdgeGlow / CenterGlow
//   • Feather corner type → Sharp / Rounded / Diffusion
//
// Still seamed: shadow Spread (no `frameDropShadowSpread` path).

import type { CompositionNode } from "@paged-media/catalog";
import type { PropertyPath } from "@paged-media/client";
import {
  PAGED_INPUT_COLOR_SWATCH,
  PAGED_INPUT_LENGTH,
  PAGED_INPUT_NUMERIC_SCRUB,
  PAGED_INPUT_SELECT,
  PAGED_INPUT_TOGGLE_SWITCH,
  PAGED_LAYOUT_CLUSTER,
  PAGED_LAYOUT_SECTION,
} from "@paged-media/shell";

// InDesign `BlendMode` enum strings (the parser stores the raw
// attribute text). An out-of-list current value renders via
// SelectLeaf's pass-through option.
export const BLEND_MODES = [
  { value: "Normal", label: "Normal" },
  { value: "Multiply", label: "Multiply" },
  { value: "Screen", label: "Screen" },
  { value: "Overlay", label: "Overlay" },
  { value: "Darken", label: "Darken" },
  { value: "Lighten", label: "Lighten" },
  { value: "ColorDodge", label: "Color dodge" },
  { value: "ColorBurn", label: "Color burn" },
  { value: "HardLight", label: "Hard light" },
  { value: "SoftLight", label: "Soft light" },
  { value: "Difference", label: "Difference" },
  { value: "Exclusion", label: "Exclusion" },
  { value: "Hue", label: "Hue" },
  { value: "Saturation", label: "Saturation" },
  { value: "Color", label: "Color" },
  { value: "Luminosity", label: "Luminosity" },
];

const BEVEL_STYLES = [
  { value: "InnerBevel", label: "Inner bevel" },
  { value: "OuterBevel", label: "Outer bevel" },
  { value: "Emboss", label: "Emboss" },
  { value: "PillowEmboss", label: "Pillow emboss" },
  { value: "StrokeEmboss", label: "Stroke emboss" },
];

const BEVEL_TECHNIQUES = [
  { value: "Smooth", label: "Smooth" },
  { value: "ChiselHard", label: "Chisel hard" },
  { value: "ChiselSoft", label: "Chisel soft" },
];

const BEVEL_DIRECTIONS = [
  { value: "Up", label: "Up" },
  { value: "Down", label: "Down" },
];

const INNER_GLOW_SOURCES = [
  { value: "EdgeGlow", label: "Edge" },
  { value: "CenterGlow", label: "Center" },
];

const FEATHER_CORNERS = [
  { value: "Sharp", label: "Sharp" },
  { value: "Rounded", label: "Rounded" },
  { value: "Diffusion", label: "Diffusion" },
];

/** Element-scope selection-property binding for a frame effect path.
 *  Typed against `PropertyPath` so a mistyped path is a tsc error
 *  (every label is verified against the protocol union). */
function bind(path: PropertyPath) {
  return {
    value: {
      kind: "selectionProperty" as const,
      scope: "element" as const,
      path,
    },
  };
}

function section(title: string, children: CompositionNode[]): CompositionNode {
  return {
    catalogId: PAGED_LAYOUT_SECTION,
    props: { title, heading: false },
    bindings: {},
    children,
  };
}

// ── Drop shadow ────────────────────────────────────────────────
// Kept on the legacy per-field `frameDropShadow*` arms; the enable
// pill (in effects-panel) writes the `frameDropShadow` bool.
export const dropShadowComposition: CompositionNode = section("Drop shadow", [
  {
    catalogId: PAGED_INPUT_SELECT,
    props: {
      label: "Mode",
      options: [
        { value: "Drop", label: "Drop" },
        { value: "Inner", label: "Inner" },
      ],
    },
    bindings: bind("frameDropShadowMode"),
  },
  {
    catalogId: PAGED_LAYOUT_CLUSTER,
    props: { count: 2 },
    bindings: {},
    children: [
      {
        catalogId: PAGED_INPUT_LENGTH,
        props: { prefix: "X", showUnit: false },
        bindings: bind("frameDropShadowXOffset"),
      },
      {
        catalogId: PAGED_INPUT_LENGTH,
        props: { prefix: "Y", showUnit: false },
        bindings: bind("frameDropShadowYOffset"),
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
        bindings: bind("frameDropShadowSize"),
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
    bindings: bind("frameDropShadowColor"),
  },
  {
    catalogId: PAGED_INPUT_NUMERIC_SCRUB,
    props: { label: "Opacity", suffix: "%" },
    bindings: bind("frameDropShadowOpacity"),
  },
]);

// ── Inner shadow ───────────────────────────────────────────────
export const innerShadowComposition: CompositionNode = section("Inner shadow", [
  {
    catalogId: PAGED_INPUT_SELECT,
    props: { label: "Blend", options: BLEND_MODES },
    bindings: bind("frameInnerShadowBlendMode"),
  },
  {
    catalogId: PAGED_INPUT_COLOR_SWATCH,
    props: { label: "Color" },
    bindings: bind("frameInnerShadowColor"),
  },
  {
    catalogId: PAGED_INPUT_NUMERIC_SCRUB,
    props: { label: "Opacity", suffix: "%" },
    bindings: bind("frameInnerShadowOpacity"),
  },
  {
    catalogId: PAGED_LAYOUT_CLUSTER,
    props: { count: 2 },
    bindings: {},
    children: [
      {
        catalogId: PAGED_INPUT_NUMERIC_SCRUB,
        props: { prefix: "Angle", suffix: "°" },
        bindings: bind("frameInnerShadowAngle"),
      },
      {
        catalogId: PAGED_INPUT_LENGTH,
        props: { prefix: "Dist", showUnit: false },
        bindings: bind("frameInnerShadowDistance"),
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
        props: { prefix: "Size", showUnit: false },
        bindings: bind("frameInnerShadowSize"),
      },
      {
        catalogId: PAGED_INPUT_NUMERIC_SCRUB,
        props: { prefix: "Choke", suffix: "%" },
        bindings: bind("frameInnerShadowChoke"),
      },
    ],
  },
  {
    catalogId: PAGED_INPUT_NUMERIC_SCRUB,
    props: { label: "Noise", suffix: "%" },
    bindings: bind("frameInnerShadowNoise"),
  },
]);

// ── Outer glow ─────────────────────────────────────────────────
export const outerGlowComposition: CompositionNode = section("Outer glow", [
  {
    catalogId: PAGED_INPUT_SELECT,
    props: { label: "Blend", options: BLEND_MODES },
    bindings: bind("frameOuterGlowBlendMode"),
  },
  {
    catalogId: PAGED_INPUT_COLOR_SWATCH,
    props: { label: "Color" },
    bindings: bind("frameOuterGlowColor"),
  },
  {
    catalogId: PAGED_INPUT_NUMERIC_SCRUB,
    props: { label: "Opacity", suffix: "%" },
    bindings: bind("frameOuterGlowOpacity"),
  },
  {
    catalogId: PAGED_LAYOUT_CLUSTER,
    props: { count: 2 },
    bindings: {},
    children: [
      {
        catalogId: PAGED_INPUT_NUMERIC_SCRUB,
        props: { prefix: "Spread", suffix: "%" },
        bindings: bind("frameOuterGlowSpread"),
      },
      {
        catalogId: PAGED_INPUT_LENGTH,
        props: { prefix: "Size", showUnit: false },
        bindings: bind("frameOuterGlowSize"),
      },
    ],
  },
  {
    catalogId: PAGED_INPUT_NUMERIC_SCRUB,
    props: { label: "Noise", suffix: "%" },
    bindings: bind("frameOuterGlowNoise"),
  },
]);

// ── Inner glow ─────────────────────────────────────────────────
export const innerGlowComposition: CompositionNode = section("Inner glow", [
  {
    catalogId: PAGED_INPUT_SELECT,
    props: { label: "Blend", options: BLEND_MODES },
    bindings: bind("frameInnerGlowBlendMode"),
  },
  {
    catalogId: PAGED_INPUT_COLOR_SWATCH,
    props: { label: "Color" },
    bindings: bind("frameInnerGlowColor"),
  },
  {
    catalogId: PAGED_INPUT_SELECT,
    props: { label: "Source", options: INNER_GLOW_SOURCES },
    bindings: bind("frameInnerGlowSource"),
  },
  {
    catalogId: PAGED_INPUT_NUMERIC_SCRUB,
    props: { label: "Opacity", suffix: "%" },
    bindings: bind("frameInnerGlowOpacity"),
  },
  {
    catalogId: PAGED_LAYOUT_CLUSTER,
    props: { count: 2 },
    bindings: {},
    children: [
      {
        catalogId: PAGED_INPUT_NUMERIC_SCRUB,
        props: { prefix: "Choke", suffix: "%" },
        bindings: bind("frameInnerGlowChoke"),
      },
      {
        catalogId: PAGED_INPUT_LENGTH,
        props: { prefix: "Size", showUnit: false },
        bindings: bind("frameInnerGlowSize"),
      },
    ],
  },
  {
    catalogId: PAGED_INPUT_NUMERIC_SCRUB,
    props: { label: "Noise", suffix: "%" },
    bindings: bind("frameInnerGlowNoise"),
  },
]);

// ── Bevel & emboss ─────────────────────────────────────────────
export const bevelComposition: CompositionNode = section("Bevel and emboss", [
  {
    catalogId: PAGED_INPUT_SELECT,
    props: { label: "Style", options: BEVEL_STYLES },
    bindings: bind("frameBevelStyle"),
  },
  {
    catalogId: PAGED_INPUT_SELECT,
    props: { label: "Technique", options: BEVEL_TECHNIQUES },
    bindings: bind("frameBevelTechnique"),
  },
  {
    catalogId: PAGED_INPUT_SELECT,
    props: { label: "Direction", options: BEVEL_DIRECTIONS },
    bindings: bind("frameBevelDirection"),
  },
  {
    catalogId: PAGED_LAYOUT_CLUSTER,
    props: { count: 2 },
    bindings: {},
    children: [
      {
        catalogId: PAGED_INPUT_NUMERIC_SCRUB,
        props: { prefix: "Depth", suffix: "%" },
        bindings: bind("frameBevelDepth"),
      },
      {
        catalogId: PAGED_INPUT_LENGTH,
        props: { prefix: "Size", showUnit: false },
        bindings: bind("frameBevelSize"),
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
        props: { prefix: "Soften", showUnit: false },
        bindings: bind("frameBevelSoften"),
      },
      {
        catalogId: PAGED_INPUT_NUMERIC_SCRUB,
        props: { prefix: "Angle", suffix: "°" },
        bindings: bind("frameBevelAngle"),
      },
    ],
  },
  {
    catalogId: PAGED_INPUT_NUMERIC_SCRUB,
    props: { label: "Altitude", suffix: "°" },
    bindings: bind("frameBevelAltitude"),
  },
  {
    catalogId: PAGED_INPUT_COLOR_SWATCH,
    props: { label: "Highlight" },
    bindings: bind("frameBevelHighlightColor"),
  },
  {
    catalogId: PAGED_INPUT_NUMERIC_SCRUB,
    props: { label: "H opacity", suffix: "%" },
    bindings: bind("frameBevelHighlightOpacity"),
  },
  {
    catalogId: PAGED_INPUT_COLOR_SWATCH,
    props: { label: "Shadow" },
    bindings: bind("frameBevelShadowColor"),
  },
  {
    catalogId: PAGED_INPUT_NUMERIC_SCRUB,
    props: { label: "S opacity", suffix: "%" },
    bindings: bind("frameBevelShadowOpacity"),
  },
]);

// ── Satin ──────────────────────────────────────────────────────
export const satinComposition: CompositionNode = section("Satin", [
  {
    catalogId: PAGED_INPUT_SELECT,
    props: { label: "Blend", options: BLEND_MODES },
    bindings: bind("frameSatinBlendMode"),
  },
  {
    catalogId: PAGED_INPUT_COLOR_SWATCH,
    props: { label: "Color" },
    bindings: bind("frameSatinColor"),
  },
  {
    catalogId: PAGED_INPUT_NUMERIC_SCRUB,
    props: { label: "Opacity", suffix: "%" },
    bindings: bind("frameSatinOpacity"),
  },
  {
    catalogId: PAGED_LAYOUT_CLUSTER,
    props: { count: 2 },
    bindings: {},
    children: [
      {
        catalogId: PAGED_INPUT_NUMERIC_SCRUB,
        props: { prefix: "Angle", suffix: "°" },
        bindings: bind("frameSatinAngle"),
      },
      {
        catalogId: PAGED_INPUT_LENGTH,
        props: { prefix: "Dist", showUnit: false },
        bindings: bind("frameSatinDistance"),
      },
    ],
  },
  {
    catalogId: PAGED_INPUT_LENGTH,
    props: { label: "Size", showUnit: false },
    bindings: bind("frameSatinSize"),
  },
  {
    catalogId: PAGED_INPUT_TOGGLE_SWITCH,
    props: { label: "Invert" },
    bindings: bind("frameSatinInvert"),
  },
]);

// ── Feather (basic) ────────────────────────────────────────────
export const featherComposition: CompositionNode = section("Feather", [
  {
    catalogId: PAGED_INPUT_LENGTH,
    props: { label: "Width", showUnit: false },
    bindings: bind("frameFeatherWidth"),
  },
  {
    catalogId: PAGED_INPUT_SELECT,
    props: { label: "Corner", options: FEATHER_CORNERS },
    bindings: bind("frameFeatherCornerType"),
  },
  {
    catalogId: PAGED_LAYOUT_CLUSTER,
    props: { count: 2 },
    bindings: {},
    children: [
      {
        catalogId: PAGED_INPUT_NUMERIC_SCRUB,
        props: { prefix: "Noise", suffix: "%" },
        bindings: bind("frameFeatherNoise"),
      },
      {
        catalogId: PAGED_INPUT_NUMERIC_SCRUB,
        props: { prefix: "Choke", suffix: "%" },
        bindings: bind("frameFeatherChoke"),
      },
    ],
  },
]);

// ── Directional feather ────────────────────────────────────────
export const directionalFeatherComposition: CompositionNode = section(
  "Directional feather",
  [
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { prefix: "Left", showUnit: false },
          bindings: bind("frameDirectionalFeatherLeftWidth"),
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { prefix: "Right", showUnit: false },
          bindings: bind("frameDirectionalFeatherRightWidth"),
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
          props: { prefix: "Top", showUnit: false },
          bindings: bind("frameDirectionalFeatherTopWidth"),
        },
        {
          catalogId: PAGED_INPUT_LENGTH,
          props: { prefix: "Bottom", showUnit: false },
          bindings: bind("frameDirectionalFeatherBottomWidth"),
        },
      ],
    },
    {
      catalogId: PAGED_INPUT_NUMERIC_SCRUB,
      props: { label: "Angle", suffix: "°" },
      bindings: bind("frameDirectionalFeatherAngle"),
    },
    {
      catalogId: PAGED_LAYOUT_CLUSTER,
      props: { count: 2 },
      bindings: {},
      children: [
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { prefix: "Noise", suffix: "%" },
          bindings: bind("frameDirectionalFeatherNoise"),
        },
        {
          catalogId: PAGED_INPUT_NUMERIC_SCRUB,
          props: { prefix: "Choke", suffix: "%" },
          bindings: bind("frameDirectionalFeatherChoke"),
        },
      ],
    },
  ],
);
