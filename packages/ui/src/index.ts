// @paged-media/ui — composite components and design-system primitives
// shared across the canvas app and (eventually) third-party
// bundles. Curated subset of shadcn primitives (re-exported from
// @paged-media/shell) plus DTP composites built on top.

export { NumberInput, type NumberInputProps } from "./inputs/NumberInput";
export { LengthInput, type LengthInputProps } from "./inputs/LengthInput";
export { ScrubField, type ScrubFieldProps } from "./inputs/ScrubField";
export { BoundsInput, type BoundsInputProps } from "./inputs/BoundsInput";
export { ColorPicker, type ColorPickerProps } from "./inputs/ColorPicker";
export { KitSelect, type KitSelectProps } from "./inputs/KitSelect";
export {
  SmartDialMicro,
  type SmartDialMicroProps,
} from "./inputs/SmartDialMicro";

export type { LengthUnit } from "./inputs/units";
export { convertLength, POINTS_PER_UNIT } from "./inputs/units";

// Concept 2 — the colour mixer + its helpers.
export { ColorMixer, type ColorMixerProps } from "./color/ColorMixer";
export {
  defaultValue as defaultMixerValue,
  hexToRgb,
  rgbToHex,
  rgbToCmyk,
  cmykToRgb,
  rgbToHsl,
  luminance,
  valueToSwatchSpec,
  SPACE_CHANNELS,
  type MixerValue,
} from "./color/color-space";
export { rgbToHsb, hsbToRgb } from "./color/hsb";
export { useColorCompute } from "./color/use-color-compute";

// Panel-gallery pass — the colour wheel + harmonies.
export { ColorWheel, type ColorWheelProps } from "./color/ColorWheel";
export { HARMONY_NAMES, harmonySet, type HarmonyName } from "./color/harmonies";
