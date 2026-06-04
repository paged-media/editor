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
export function valueToSwatchSpec(
  v: MixerValue,
  name?: string,
): SwatchSpec {
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
