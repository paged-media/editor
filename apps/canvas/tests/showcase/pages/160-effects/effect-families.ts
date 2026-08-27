/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// The eight effect families as data — shared by the contact sheet
// (p58, full battery per family) and the parameter table (p60, full
// battery plus one overridden knob per tile). Writing the WHOLE
// battery both places is deliberate: it keeps every tile in a row
// comparable, and it is the checklist that guarantees the chapter
// touches every per-field path the wire owns.
//
// THE PATH CHECKLIST (65 family paths, every one written by `base`;
// frameGradientFeather is the 66th, exhibited on p59):
//   drop shadow (7)   frameDropShadow, frameDropShadowMode,
//                     frameDropShadowXOffset, frameDropShadowYOffset,
//                     frameDropShadowSize, frameDropShadowOpacity,
//                     frameDropShadowColor
//   inner shadow (9)  frameInnerShadowEnabled, ...BlendMode, ...Color,
//                     ...Opacity, ...Angle, ...Distance, ...Size,
//                     ...Choke, ...Noise
//   outer glow (7)    frameOuterGlowEnabled, ...BlendMode, ...Color,
//                     ...Opacity, ...Spread, ...Size, ...Noise
//   inner glow (8)    frameInnerGlowEnabled, ...BlendMode, ...Color,
//                     ...Opacity, ...Choke, ...Size, ...Source, ...Noise
//   bevel/emboss (13) frameBevelEnabled, ...Style, ...Technique,
//                     ...Depth, ...Direction, ...Size, ...Soften,
//                     ...Angle, ...Altitude, ...HighlightColor,
//                     ...ShadowColor, ...HighlightOpacity,
//                     ...ShadowOpacity
//   satin (8)         frameSatinEnabled, ...BlendMode, ...Color,
//                     ...Opacity, ...Angle, ...Distance, ...Size,
//                     ...Invert
//   feather (5)       frameFeatherEnabled, ...Width, ...CornerType,
//                     ...Noise, ...Choke
//   directional (8)   frameDirectionalFeatherEnabled, ...LeftWidth,
//                     ...RightWidth, ...TopWidth, ...BottomWidth,
//                     ...Angle, ...Noise, ...Choke
//
// Enable paths come FIRST in each battery — the apply layer
// materialises the family's default struct on the enable write, so the
// per-field writes that follow always have a target. Drop shadow's
// enable is the legacy `frameDropShadow` bool (not `*Enabled`).
// Value shapes per the wire: bool / length / text / colorRef.

export interface EffectWrite {
  path: string;
  value: { type: string; value: unknown };
}

export interface EffectSwatches {
  ink: string;
  vermilion: string;
  paperWarm: string;
  slate: string;
}

export interface EffectFamily {
  key: string;
  label: string;
  /** The apparatus citation for the family's path battery. */
  citation: string;
  base: (sw: EffectSwatches) => EffectWrite[];
  /** p60's one-knob-at-a-time overrides, applied on top of `base`. */
  variants: (sw: EffectSwatches) => Array<{ label: string; write: EffectWrite }>;
}

const len = (path: string, value: number): EffectWrite => ({
  path,
  value: { type: "length", value },
});
const txt = (path: string, value: string): EffectWrite => ({
  path,
  value: { type: "text", value },
});
const flag = (path: string, value: boolean): EffectWrite => ({
  path,
  value: { type: "bool", value },
});
const col = (path: string, value: string): EffectWrite => ({
  path,
  value: { type: "colorRef", value },
});

export const EFFECT_FAMILIES: EffectFamily[] = [
  {
    key: "drop-shadow",
    label: "Drop shadow",
    citation: "frameDropShadow* · 7 paths",
    base: (sw) => [
      flag("frameDropShadow", true),
      txt("frameDropShadowMode", "Drop"),
      len("frameDropShadowXOffset", 5),
      len("frameDropShadowYOffset", 7),
      len("frameDropShadowSize", 9),
      len("frameDropShadowOpacity", 80),
      col("frameDropShadowColor", sw.ink),
    ],
    variants: (sw) => [
      { label: "x +14", write: len("frameDropShadowXOffset", 14) },
      { label: "blur 16", write: len("frameDropShadowSize", 16) },
      { label: "op 30", write: len("frameDropShadowOpacity", 30) },
      { label: "vermilion", write: col("frameDropShadowColor", sw.vermilion) },
    ],
  },
  {
    key: "inner-shadow",
    label: "Inner shadow",
    citation: "frameInnerShadow* · 9 paths",
    base: (sw) => [
      flag("frameInnerShadowEnabled", true),
      txt("frameInnerShadowBlendMode", "Multiply"),
      col("frameInnerShadowColor", sw.ink),
      len("frameInnerShadowOpacity", 85),
      len("frameInnerShadowAngle", 135),
      len("frameInnerShadowDistance", 6),
      len("frameInnerShadowSize", 9),
      len("frameInnerShadowChoke", 15),
      len("frameInnerShadowNoise", 0),
    ],
    variants: () => [
      { label: "dist 12", write: len("frameInnerShadowDistance", 12) },
      { label: "size 16", write: len("frameInnerShadowSize", 16) },
      { label: "choke 60", write: len("frameInnerShadowChoke", 60) },
      { label: "noise 35", write: len("frameInnerShadowNoise", 35) },
    ],
  },
  {
    key: "outer-glow",
    label: "Outer glow",
    citation: "frameOuterGlow* · 7 paths",
    // A dark glow MULTIPLIED onto the warm paper — the default Screen
    // blend with a light colour is invisible on a light ground (the
    // effects e2e suite learned this first).
    base: (sw) => [
      flag("frameOuterGlowEnabled", true),
      txt("frameOuterGlowBlendMode", "Multiply"),
      col("frameOuterGlowColor", sw.slate),
      len("frameOuterGlowOpacity", 90),
      len("frameOuterGlowSpread", 25),
      len("frameOuterGlowSize", 12),
      len("frameOuterGlowNoise", 0),
    ],
    variants: () => [
      { label: "spread 65", write: len("frameOuterGlowSpread", 65) },
      { label: "size 18", write: len("frameOuterGlowSize", 18) },
      { label: "op 35", write: len("frameOuterGlowOpacity", 35) },
      { label: "noise 30", write: len("frameOuterGlowNoise", 30) },
    ],
  },
  {
    key: "inner-glow",
    label: "Inner glow",
    citation: "frameInnerGlow* · 8 paths",
    base: (sw) => [
      flag("frameInnerGlowEnabled", true),
      txt("frameInnerGlowBlendMode", "Screen"),
      col("frameInnerGlowColor", sw.paperWarm),
      len("frameInnerGlowOpacity", 80),
      txt("frameInnerGlowSource", "EdgeGlow"),
      len("frameInnerGlowChoke", 8),
      len("frameInnerGlowSize", 9),
      len("frameInnerGlowNoise", 0),
    ],
    variants: () => [
      { label: "center", write: txt("frameInnerGlowSource", "CenterGlow") },
      { label: "choke 60", write: len("frameInnerGlowChoke", 60) },
      { label: "size 18", write: len("frameInnerGlowSize", 18) },
      { label: "noise 30", write: len("frameInnerGlowNoise", 30) },
    ],
  },
  {
    key: "bevel-emboss",
    label: "Bevel & emboss",
    citation: "frameBevel* · 13 paths",
    base: (sw) => [
      flag("frameBevelEnabled", true),
      txt("frameBevelStyle", "InnerBevel"),
      txt("frameBevelTechnique", "Smooth"),
      len("frameBevelDepth", 120),
      txt("frameBevelDirection", "Up"),
      len("frameBevelSize", 8),
      len("frameBevelSoften", 2),
      len("frameBevelAngle", 120),
      len("frameBevelAltitude", 30),
      col("frameBevelHighlightColor", sw.paperWarm),
      len("frameBevelHighlightOpacity", 80),
      col("frameBevelShadowColor", sw.ink),
      len("frameBevelShadowOpacity", 70),
    ],
    variants: () => [
      { label: "emboss", write: txt("frameBevelStyle", "Emboss") },
      { label: "depth 240", write: len("frameBevelDepth", 240) },
      { label: "down", write: txt("frameBevelDirection", "Down") },
      { label: "chisel", write: txt("frameBevelTechnique", "ChiselHard") },
    ],
  },
  {
    key: "satin",
    label: "Satin",
    citation: "frameSatin* · 8 paths",
    base: (sw) => [
      flag("frameSatinEnabled", true),
      txt("frameSatinBlendMode", "Multiply"),
      col("frameSatinColor", sw.ink),
      len("frameSatinOpacity", 55),
      len("frameSatinAngle", 20),
      len("frameSatinDistance", 7),
      len("frameSatinSize", 11),
      flag("frameSatinInvert", false),
    ],
    variants: () => [
      { label: "angle 100", write: len("frameSatinAngle", 100) },
      { label: "dist 14", write: len("frameSatinDistance", 14) },
      { label: "size 18", write: len("frameSatinSize", 18) },
      // The recorded limit: stored and exported, ignored by the
      // rasterizer — the tile prints like its neighbour, and the
      // margin note on p60 says so.
      { label: "invert", write: flag("frameSatinInvert", true) },
    ],
  },
  {
    key: "feather",
    label: "Feather",
    citation: "frameFeather* · 5 paths",
    base: () => [
      flag("frameFeatherEnabled", true),
      len("frameFeatherWidth", 10),
      txt("frameFeatherCornerType", "Diffusion"),
      len("frameFeatherNoise", 0),
      len("frameFeatherChoke", 0),
    ],
    variants: () => [
      { label: "width 18", write: len("frameFeatherWidth", 18) },
      { label: "sharp", write: txt("frameFeatherCornerType", "Sharp") },
      { label: "choke 55", write: len("frameFeatherChoke", 55) },
      { label: "noise 35", write: len("frameFeatherNoise", 35) },
    ],
  },
  {
    key: "directional-feather",
    label: "Directional feather",
    citation: "frameDirectionalFeather* · 8 paths",
    base: () => [
      flag("frameDirectionalFeatherEnabled", true),
      len("frameDirectionalFeatherLeftWidth", 14),
      len("frameDirectionalFeatherRightWidth", 3),
      len("frameDirectionalFeatherTopWidth", 8),
      len("frameDirectionalFeatherBottomWidth", 0),
      len("frameDirectionalFeatherAngle", 0),
      len("frameDirectionalFeatherNoise", 0),
      len("frameDirectionalFeatherChoke", 0),
    ],
    variants: () => [
      { label: "bottom 18", write: len("frameDirectionalFeatherBottomWidth", 18) },
      { label: "angle 45", write: len("frameDirectionalFeatherAngle", 45) },
      { label: "choke 50", write: len("frameDirectionalFeatherChoke", 50) },
      { label: "noise 30", write: len("frameDirectionalFeatherNoise", 30) },
    ],
  },
];

/** `setElementProperty` op objects for one battery on one element. */
export function batteryOps(
  kind: string,
  id: string,
  writes: EffectWrite[],
): Array<{ op: string; args: unknown }> {
  return writes.map((w) => ({
    op: "setElementProperty",
    args: {
      elementId: { kind, id },
      path: w.path,
      value: w.value,
    },
  }));
}
