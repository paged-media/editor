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

// paged.web W-04 — the host code-editor widget (line numbers, light
// HTML/CSS highlighting, diagnostics gutter) injected into bundles via
// `host.widgets.CodeEditor`.
export {
  CodeEditor,
  type CodeEditorProps,
  type CodeEditorDiagnostic,
} from "./code/CodeEditor";
export { highlight, escapeHtml, type CodeLanguage } from "./code/highlight";
