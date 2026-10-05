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

// v66 — the host colour picker behind `host.widgets.ColorPicker`
// (`widgets.colorPicker@1`). A plugin that needs a colour that is NOT a
// document swatch (paged.image's foreground/background, a brush tint)
// gets the same mixer the Swatches and Color panels use — colour-managed
// preview, out-of-gamut warning, CMYK/RGB/Lab/HSB tabs — instead of a
// browser `<input type=color>`. It never writes the document: the
// contract speaks `#rrggbb`, and the "Add to Swatches" / "Apply"
// affordances are deliberately not offered here.

import { useEffect, useRef, useState } from "react";

import {
  ColorMixer,
  hexToRgb,
  rgbToHex,
  useColorCompute,
  type MixerValue,
} from "@paged-media/ui";

export interface HostColorPickerProps {
  /** `#rrggbb` (sRGB). */
  value: string;
  onChange(next: string): void;
  onCommit?(next: string): void;
  disabled?: boolean;
  ariaLabel?: string;
}

function toMixer(hex: string): MixerValue {
  return { space: "RGB", value: hexToRgb(hex) ?? [0, 0, 0], tint: 100 } as MixerValue;
}

export function HostColorPicker(props: HostColorPickerProps) {
  const { value, onChange, onCommit, disabled, ariaLabel } = props;
  // The mixer's canonical state. RGB edits map to hex directly; an edit
  // in another space (CMYK, Lab) is answered by the engine's colour
  // management, so its hex arrives asynchronously through the compute.
  const [mixer, setMixer] = useState<MixerValue>(() => toMixer(value));
  const pendingCommit = useRef(false);
  const lastHex = useRef(value.toLowerCase());

  // Follow an outside change (the plugin swapped colours).
  useEffect(() => {
    if (value.toLowerCase() !== lastHex.current) {
      lastHex.current = value.toLowerCase();
      setMixer(toMixer(value));
    }
  }, [value]);

  const compute = useColorCompute(mixer.space === "RGB" ? null : mixer);
  useEffect(() => {
    if (mixer.space === "RGB" || compute.pending) return;
    const hex = compute.rgbHex.toLowerCase();
    if (hex === lastHex.current && !pendingCommit.current) return;
    lastHex.current = hex;
    onChange(hex);
    if (pendingCommit.current) {
      pendingCommit.current = false;
      onCommit?.(hex);
    }
  }, [compute.rgbHex, compute.pending, mixer.space, onChange, onCommit]);

  const emit = (next: MixerValue, commit: boolean) => {
    setMixer(next);
    if (next.space !== "RGB") {
      pendingCommit.current = pendingCommit.current || commit;
      return;
    }
    const hex = rgbToHex(next.value).toLowerCase();
    lastHex.current = hex;
    onChange(hex);
    if (commit) onCommit?.(hex);
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? "Colour"}
      aria-disabled={disabled || undefined}
      data-host-color-picker
      style={disabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}
    >
      <ColorMixer
        value={mixer}
        compact
        showTint={false}
        onChange={(next) => emit(next, false)}
        onCommit={(next) => emit(next, true)}
      />
    </div>
  );
}
