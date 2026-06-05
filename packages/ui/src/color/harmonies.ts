// Panel-gallery pass — colour-theory harmonies for the colour
// wheel. Pure hue rotation over the UI's HSB affordance (hsb.ts;
// H 0..360, S/B 0..100) — the monochromatic set varies saturation
// and brightness instead. The product wires the generated palette
// into `createSwatch` (RGB SwatchSpecs); nothing here crosses the
// wire directly.

export type HarmonyName =
  | "Complementary"
  | "Analogous"
  | "Triadic"
  | "Split-Comp"
  | "Tetradic"
  | "Monochromatic";

export const HARMONY_NAMES: HarmonyName[] = [
  "Complementary",
  "Analogous",
  "Triadic",
  "Split-Comp",
  "Tetradic",
  "Monochromatic",
];

/** Hue offsets (degrees) per harmony; offset 0 is the main colour.
 *  Monochromatic carries no offsets — see `harmonySet`. */
const OFFSETS: Record<Exclude<HarmonyName, "Monochromatic">, number[]> = {
  Complementary: [0, 180],
  Analogous: [-30, 0, 30],
  Triadic: [0, 120, 240],
  "Split-Comp": [0, 150, 210],
  Tetradic: [0, 90, 180, 270],
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/**
 * The harmony set for a main colour, as HSB triples. For the
 * rotation harmonies index 0 is the main colour itself (the kit
 * marks it with a check); Monochromatic instead returns five
 * shadow-to-tint steps around the main hue.
 */
export function harmonySet(
  hsb: [number, number, number],
  harmony: HarmonyName,
): [number, number, number][] {
  const [h, s, v] = hsb;
  if (harmony === "Monochromatic") {
    // Five steps from shadow to tint around the main hue (the
    // kit's curve: saturation ramps with index, value walks up).
    return [0, 1, 2, 3, 4].map((i) => [
      h,
      clamp(s * (0.5 + i * 0.16), 8, 100),
      clamp(40 + i * 14, 12, 100),
    ]);
  }
  return OFFSETS[harmony].map((o) => [(((h + o) % 360) + 360) % 360, s, v]);
}
