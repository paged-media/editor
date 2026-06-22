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

// Gallery pixel-parity — the kit `Num` metric (gallery-deep1.jsx):
// h28, radius 6, mono 11.5 value, optional glyph/text chip (the scrub
// handle), and the kit's in-field value language — prefixes ("W",
// "gutter") and suffixes ("pt", "%") render INSIDE the field, never
// as a separate unit dropdown. `value: null` is the mixed / no-value
// state: the field shows an em-dash (and carries `data-mixed`); a
// typed commit write-replaces (the binding layer fans out).

import { useEffect, useRef, useState } from "react";
import { Icon, useScrubGesture } from "@paged-media/shell";

export interface NumberInputProps {
  /** Current value. `null` = mixed/no value (shows an em-dash). */
  value: number | null;
  /** Fires on every change (scrub update + keyboard edit + commit). */
  onChange: (value: number) => void;
  /** Optional final-value notifier for keyboard "Enter" / blur and
   * for scrub commits. Useful when the caller wants to debounce
   * non-final updates differently. */
  onCommit?: (value: number) => void;
  /** Document-space units per pixel of scrub-drag. Default 1. */
  step?: number;
  /** Clamp range. */
  min?: number;
  max?: number;
  /** Decimal places. Default 2. */
  precision?: number;
  /** Optional label shown on the drag handle (the small chip on the
   * left of the input). Typical values: "X", "Y", "W", "Pt". */
  label?: string;
  /** Optional glyph name rendered on the drag handle instead of a
   * text label — the kit's `Metric` look. Takes precedence over
   * `label`. */
  icon?: string;
  /** Mono text rendered inside the field BEFORE the value
   * ("W", "gutter", "dash" — the kit's in-value prefixes). */
  prefix?: string;
  /** Unit text appended to the displayed value when not editing
   * ("pt", "%", "mm"). Stripped for editing/parsing. */
  suffix?: string;
  /** Full display override (read-only text like "Metrics") — used
   * by seams whose placeholder isn't numeric. */
  displayText?: string;
  /** Disabled flag — disables both the input and the scrub handle. */
  disabled?: boolean;
  /** Extra className applied to the wrapper. */
  className?: string;
  /** Aria-label for accessibility. */
  "aria-label"?: string;
}

function fmt(v: number, precision: number): string {
  const factor = Math.pow(10, precision);
  return String(Math.round(v * factor) / factor);
}

/**
 * Numeric input + scrub handle. Drag the leading chip horizontally
 * to scrub the value; type into the input to edit directly. Both
 * paths fire `onChange`; `onCommit` fires on Enter/blur/scrub-end.
 *
 * Held Shift = fine increments (×0.1). Held Alt = coarse (×10).
 * Escape during a scrub cancels and snaps back to the pre-scrub value.
 */
export function NumberInput(props: NumberInputProps) {
  const {
    value,
    onChange,
    onCommit,
    step = 1,
    min,
    max,
    precision = 2,
    label = "",
    icon,
    prefix,
    suffix,
    displayText,
    disabled = false,
    className = "",
  } = props;

  const mixed = value === null && displayText == null;

  const displayFor = (v: number | null): string => {
    if (displayText != null) return displayText;
    if (v === null) return "—";
    return suffix ? `${fmt(v, precision)} ${suffix}` : fmt(v, precision);
  };

  // Mirror the controlled value into a local text-state so the user
  // can type a partial number ("3.") without us snapping it back.
  // When NOT focused the text carries the display form (suffix
  // included); focusing swaps to the raw number for editing.
  const [text, setText] = useState<string>(() => displayFor(value));
  const lastCommittedRef = useRef<number | null>(value);

  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(displayFor(value));
      lastCommittedRef.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, suffix, displayText]);

  const scrub = useScrubGesture({
    initial: value ?? 0,
    step,
    min,
    max,
    precision,
    onUpdate: (next) => {
      setText(String(next));
      onChange(next);
    },
    onCommit: (next, initial) => {
      lastCommittedRef.current = next;
      onCommit?.(next);
      // Notify even if onChange already fired during the drag; the
      // explicit commit is part of the API contract.
      if (next !== initial) onChange(next);
    },
    onCancel: () => {
      setText(displayFor(value));
      if (value !== null) onChange(value);
    },
  });

  const commitText = () => {
    const parsed = Number.parseFloat(text);
    if (!Number.isFinite(parsed)) {
      // Snap back to the last committed display on garbage input.
      setText(displayFor(lastCommittedRef.current));
      return;
    }
    let v = parsed;
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    const factor = Math.pow(10, precision);
    v = Math.round(v * factor) / factor;
    setText(displayFor(v));
    // Enter commits AND blurs — without this guard the blur handler
    // committed the same value a second time, landing a junk
    // duplicate entry on the undo stack for every panel edit (found
    // by the E2E sandwich's single-undo restore check).
    if (v === lastCommittedRef.current) return;
    lastCommittedRef.current = v;
    onChange(v);
    onCommit?.(v);
  };

  const readOnly = displayText != null;

  return (
    <div
      className={`inline-flex items-stretch overflow-hidden rounded-[6px] border border-input bg-background h-[28px] ${className}`}
      data-disabled={disabled || undefined}
      data-mixed={mixed ? "" : undefined}
    >
      {(icon || label) && (
        <span
          ref={disabled || mixed ? undefined : scrub.bind}
          className="px-[7px] inline-flex items-center select-none text-muted-foreground bg-muted border-r border-input font-medium text-[11px]"
          aria-hidden="true"
          style={{
            touchAction: "none",
            cursor: disabled || mixed ? "default" : "ew-resize",
          }}
        >
          {icon ? <Icon name={icon} size={13} /> : label}
        </span>
      )}
      {prefix && (
        <span
          className="pl-2 inline-flex items-center select-none text-[11.5px]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--pg-fg)" }}
          aria-hidden="true"
        >
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        readOnly={readOnly}
        className={`flex-1 min-w-0 ${prefix ? "pl-1" : "pl-2"} pr-2 bg-transparent outline-none text-[11.5px] focus:ring-1 focus:ring-ring focus:ring-inset disabled:text-muted-foreground`}
        style={{
          fontFamily: "var(--font-mono)",
          color: mixed || readOnly ? "var(--pg-muted-fg)" : undefined,
        }}
        aria-label={props["aria-label"]}
        onFocus={() => {
          if (readOnly || disabled) return;
          // Swap to the raw number for clean editing.
          setText(value === null ? "" : fmt(value, precision));
        }}
        onChange={(e) => {
          setText(e.target.value);
          // Live-update if the partial value parses cleanly.
          const parsed = Number.parseFloat(e.target.value);
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
        onBlur={() => {
          if (readOnly) return;
          if (text.trim() === "" && value === null) {
            // Mixed field left untouched — restore the em-dash.
            setText(displayFor(null));
            return;
          }
          commitText();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitText();
            inputRef.current?.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setText(displayFor(lastCommittedRef.current));
            inputRef.current?.blur();
          }
        }}
      />
      {scrub.isScrubbing && (
        <span className="sr-only" aria-live="polite">
          scrubbing: {scrub.value}
        </span>
      )}
    </div>
  );
}
