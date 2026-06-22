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

// Concept 2 — channel metadata for the colour mixer. The canonical
// wire spaces are the SwatchSpec vocabulary (CMYK / RGB / LAB /
// Gray, IDML units); HSB is a UI-only affordance over RGB (see
// hsb.ts) and never crosses the wire.

import type { SwatchSpec } from "@paged-media/client";

/** The canonical (wire) mixer state. */
export interface MixerValue {
  space: "CMYK" | "RGB" | "LAB" | "Gray";
  /** Channels in IDML units (CMYK 0..100, RGB 0..255, Lab L 0..100
   *  a/b −128..127, Gray ink 0..100). */
  value: number[];
  /** Swatch-level tint, 0..100. 100 = solid. */
  tint: number;
}

export interface ChannelMeta {
  key: string;
  label: string;
  min: number;
  max: number;
  precision: number;
}

export const SPACE_CHANNELS: Record<MixerValue["space"], ChannelMeta[]> = {
  CMYK: [
    { key: "c", label: "C", min: 0, max: 100, precision: 0 },
    { key: "m", label: "M", min: 0, max: 100, precision: 0 },
    { key: "y", label: "Y", min: 0, max: 100, precision: 0 },
    { key: "k", label: "K", min: 0, max: 100, precision: 0 },
  ],
  RGB: [
    { key: "r", label: "R", min: 0, max: 255, precision: 0 },
    { key: "g", label: "G", min: 0, max: 255, precision: 0 },
    { key: "b", label: "B", min: 0, max: 255, precision: 0 },
  ],
  LAB: [
    { key: "l", label: "L", min: 0, max: 100, precision: 0 },
    { key: "a", label: "a", min: -128, max: 127, precision: 0 },
    { key: "b", label: "b", min: -128, max: 127, precision: 0 },
  ],
  Gray: [{ key: "k", label: "K", min: 0, max: 100, precision: 0 }],
};

/** A neutral default per space (the seed when editing from the
 *  mixed sentinel or switching spaces). */
export function defaultValue(space: MixerValue["space"]): number[] {
  switch (space) {
    case "CMYK":
      return [0, 0, 0, 100];
    case "RGB":
      return [128, 128, 128];
    case "LAB":
      return [50, 0, 0];
    case "Gray":
      return [100];
  }
}

/** Build the `createSwatch`/`editSwatch` spec from mixer state. */
export function valueToSwatchSpec(v: MixerValue, name?: string): SwatchSpec {
  return {
    selfId: null,
    name: name ?? null,
    space: v.space,
    value: [...v.value],
    model: "Process",
    alternateSpace: null,
    alternateValue: [],
    tint: v.tint < 100 ? v.tint : null,
    alpha: null,
  };
}

/** `#rrggbb` → RGB channels (IDML 0..255), or null. */
export function hexToRgb(hex: string): number[] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** RGB channels (0..255) → `#rrggbb`. */
export function rgbToHex(rgb: number[]): string {
  const b = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${b(rgb[0] ?? 0)}${b(rgb[1] ?? 0)}${b(rgb[2] ?? 0)}`;
}

// Panel-gallery pass — naive client-side conversions for the colour
// wheel's HEX · RGB · CMYK · HSL field round-trip. These are UI
// approximations (device CMYK, no profile); the CMM-accurate path
// stays `useColorCompute` / the engine's colorCompute and these
// never cross the wire as authoritative values.

/** RGB (0..255) → naive CMYK (0..100 each). */
export function rgbToCmyk(rgb: number[]): [number, number, number, number] {
  const r = (rgb[0] ?? 0) / 255;
  const g = (rgb[1] ?? 0) / 255;
  const b = (rgb[2] ?? 0) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  const d = 1 - k;
  return [
    Math.round(((1 - r - k) / d) * 100),
    Math.round(((1 - g - k) / d) * 100),
    Math.round(((1 - b - k) / d) * 100),
    Math.round(k * 100),
  ];
}

/** Naive CMYK (0..100 each) → RGB (0..255). */
export function cmykToRgb(cmyk: number[]): [number, number, number] {
  const c = Math.min(100, Math.max(0, cmyk[0] ?? 0)) / 100;
  const m = Math.min(100, Math.max(0, cmyk[1] ?? 0)) / 100;
  const y = Math.min(100, Math.max(0, cmyk[2] ?? 0)) / 100;
  const k = Math.min(100, Math.max(0, cmyk[3] ?? 0)) / 100;
  return [
    Math.round(255 * (1 - c) * (1 - k)),
    Math.round(255 * (1 - m) * (1 - k)),
    Math.round(255 * (1 - y) * (1 - k)),
  ];
}

/** RGB (0..255) → HSL (H 0..360, S/L 0..100). */
export function rgbToHsl(rgb: number[]): [number, number, number] {
  const r = (rgb[0] ?? 0) / 255;
  const g = (rgb[1] ?? 0) / 255;
  const b = (rgb[2] ?? 0) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

/** WCAG relative luminance (0..1) — light-vs-dark label contrast
 *  on colour chips. */
export function luminance(rgb: number[]): number {
  const f = (v: number) => {
    const n = Math.min(255, Math.max(0, v)) / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * f(rgb[0] ?? 0) + 0.7152 * f(rgb[1] ?? 0) + 0.0722 * f(rgb[2] ?? 0)
  );
}
