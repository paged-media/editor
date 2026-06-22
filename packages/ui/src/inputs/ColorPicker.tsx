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

// Gallery pixel-parity — the swatch-reference editor wearing the
// kit `Sw` chrome (deep1): a 28px button face with the 16px colour
// chip, the swatch ref and a chevron. Clicking the face discloses
// the v1 text editor inline (plus palette chips when provided) —
// the text-driven commit path is unchanged; the popover-with-
// swatch-grid stays the v2 seam.

import { useState } from "react";
import { Icon } from "@paged-media/shell";

export interface ColorPickerProps {
  /** Current swatch reference (e.g. `"Color/Red"`). `null` ⇒ unset. */
  value: string | null;
  /** Fires on Enter / blur / explicit clear with the new swatch ref. */
  onCommit: (value: string | null) => void;
  /** Optional palette to choose from. When provided the disclosure
   *  lists swatch chips above the text input. */
  palette?: Array<{ id: string; label: string; preview?: string }>;
  disabled?: boolean;
}

export function ColorPicker(props: ColorPickerProps) {
  const { value, onCommit, palette, disabled = false } = props;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string>(value ?? "");
  // Re-sync when controlled value changes from outside.
  if (text !== (value ?? "") && document.activeElement?.tagName !== "INPUT") {
    setText(value ?? "");
  }

  const preview =
    value !== null
      ? (palette?.find((p) => p.id === value)?.preview ?? null)
      : null;

  return (
    <div data-color-picker data-value={value ?? ""}>
      <button
        type="button"
        disabled={disabled}
        data-color-picker-face
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-[28px] w-full cursor-pointer items-center gap-2 rounded-[6px] border border-input bg-background px-2 disabled:cursor-default disabled:opacity-55"
      >
        <span
          className="h-4 w-4 shrink-0 rounded border border-input"
          style={{ background: preview ?? "transparent" }}
          aria-hidden="true"
          title={value ?? "no fill"}
        />
        <span
          className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-xs"
          style={{ color: value ? "var(--pg-fg)" : "var(--pg-muted-fg)" }}
        >
          {value ?? "[None]"}
        </span>
        <Icon
          name="ui-chevron-down"
          size={12}
          style={{ color: "var(--pg-muted-fg)", flexShrink: 0 }}
        />
      </button>
      {open && !disabled && (
        <div className="mt-1 flex flex-col gap-1" data-color-picker-editor>
          {palette && palette.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {palette.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.label}
                  data-palette-chip={p.id}
                  onClick={() => {
                    onCommit(p.id);
                    setOpen(false);
                  }}
                  className="h-[22px] w-[22px] cursor-pointer rounded-[4px] border border-input"
                  style={{ background: p.preview ?? "transparent" }}
                />
              ))}
            </div>
          )}
          <input
            type="text"
            value={text}
            autoFocus
            className="h-[26px] w-full min-w-0 rounded-[6px] border border-input bg-transparent px-2 text-[11.5px] outline-none focus:ring-1 focus:ring-ring focus:ring-inset"
            style={{ fontFamily: "var(--font-mono)" }}
            placeholder="swatch id (e.g. Color/Red)"
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              const trimmed = text.trim();
              const next = trimmed === "" ? null : trimmed;
              if (next !== value) onCommit(next);
              setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setText(value ?? "");
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="swatch reference"
          />
        </div>
      )}
    </div>
  );
}
