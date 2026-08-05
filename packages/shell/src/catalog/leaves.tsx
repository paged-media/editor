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

// SDK Phase 3 — primitive catalog leaves.
//
// Wraps `@paged-media/ui` widgets with the LeafProps shape the catalog
// renderer hands them. Each leaf reads its primary value from the
// `value` prop (already resolved by the binding hook) and writes
// back via `onCommit`. The leaves are intentionally tiny — the
// design-system widgets in @paged-media/ui do the heavy lifting.
//
// Gallery pixel-parity: the leaves speak the kit's exact control
// grammar (gallery-deep1.jsx) —
//   - the control is ALWAYS rendered: `value: null` shows an em-dash
//     INSIDE the control (`data-mixed`), disabled when there is no
//     write path (empty selection), editable when mixed so a commit
//     write-replaces across the multi-selection;
//   - three row grammars: label-left (84px), stacked (11.5px label
//     above), and bare full-width metric grids with in-field
//     prefixes/suffixes and 8.5px sub-labels;
//   - HONEST SEAMS (`seam: true`) render disabled and NEUTRAL — no
//     active segment, pills off — showing `placeholder` text only
//     in value fields. A seam is never fake-interactive.

import { useState } from "react";

import type { LeafProps } from "@paged-media/catalog";
import type { CollectionName, Value } from "@paged-media/client";
import {
  BoundsInput,
  KitSelect,
  LengthInput,
  ColorPicker,
  NumberInput,
} from "@paged-media/ui";

import { Icon } from "../icons";
import { useCollection } from "./use-collection";

// ---------------------------------------------------------------- helpers

/** Unwraps a `Value::Length` to a number or null (mixed / absent /
 *  non-length variant). `Length(None)` reads as 0 — the "inherit
 *  default" convention the inspector established. */
function unwrapLength(v: Value | null): number | null {
  if (v == null) return null;
  if (v.type !== "length") return null;
  return v.value ?? 0;
}

function unwrapColorRef(v: Value | null): {
  resolved: boolean;
  ref: string | null;
} {
  if (v == null) return { resolved: false, ref: null };
  if (v.type !== "colorRef") return { resolved: false, ref: null };
  return { resolved: true, ref: v.value ?? null };
}

function labelFromProps(props: Record<string, unknown>): string | undefined {
  return typeof props.label === "string" ? props.label : undefined;
}

function iconFromProps(props: Record<string, unknown>): string | undefined {
  return typeof props.icon === "string" ? props.icon : undefined;
}

function strFromProps(
  props: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof props[key] === "string" ? (props[key] as string) : undefined;
}

/** The honest-seam test — the explicit `seam: true` prop ONLY.
 *  (A missing `onCommit` means "no selection" — the control renders
 *  disabled either way, but seams additionally neutralise state.) */
function isSeam(props: Record<string, unknown>): boolean {
  return props.seam === true;
}

/** Strips the raw IDML `$ID/` prefix from display names
 *  ("$ID/[No paragraph style]" → "[No paragraph style]"). */
export function displayName(name: string): string {
  return name.startsWith("$ID/") ? name.slice(4) : name;
}

// ---------------------------------------------------------------- rows

/** The kit's three row grammars (gallery-deep1 `Fld`):
 *  - default: `84px 1fr` grid, 12px muted label
 *  - `stack`: 11.5px muted label ABOVE the control
 *  - no label: bare control (full-width metric grids) */
function LeafRow({
  label,
  stack,
  children,
}: {
  label?: string;
  stack?: boolean;
  children: React.ReactNode;
}) {
  if (!label) return <>{children}</>;
  if (stack) {
    return (
      <div className="mb-px">
        <div
          className="text-[11.5px] mb-[5px]"
          style={{ color: "var(--pg-muted-fg)" }}
        >
          {label}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[84px_1fr] items-center gap-2">
      <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function rowProps(props: Record<string, unknown>) {
  return {
    label: labelFromProps(props),
    stack: props.labelPosition === "stack",
  };
}

// ---------------------------------------------------------------- leaves

/** Numeric metric bound to a `Value::Length` — the kit `Num`: h28,
 *  mono value with the unit INSIDE ("16 pt"), optional glyph chip
 *  (the scrub handle) and in-field `prefix`. `null` shows the
 *  em-dash inside the control; seams show `placeholder` text. */
export function LengthLeaf({ value, onCommit, props }: LeafProps) {
  const icon = iconFromProps(props);
  const seam = isSeam(props);
  const pointValue = unwrapLength(value);
  return (
    <LeafRow {...rowProps(props)}>
      <span data-seam={seam ? "true" : undefined} className="contents">
        <LengthInput
          valuePt={seam ? null : pointValue}
          icon={icon}
          prefix={strFromProps(props, "prefix")}
          showUnit={props.showUnit !== false}
          displayText={
            seam ? (strFromProps(props, "placeholder") ?? "—") : undefined
          }
          disabled={seam || onCommit == null}
          onChangePt={() => {
            /* live updates ignored; commit on blur */
          }}
          onCommitPt={(next) => {
            onCommit?.({ type: "length", value: next } as Value);
          }}
        />
      </span>
    </LeafRow>
  );
}

/** Raw scrubbable numeric (no unit suffix). Binds `Value::Length`. */
export function NumericScrubLeaf({ value, onCommit, props }: LeafProps) {
  const icon = iconFromProps(props);
  const seam = isSeam(props);
  const pointValue = unwrapLength(value);
  return (
    <LeafRow {...rowProps(props)}>
      <span data-seam={seam ? "true" : undefined} className="contents">
        <NumberInput
          value={seam ? null : pointValue}
          icon={icon}
          prefix={strFromProps(props, "prefix")}
          suffix={strFromProps(props, "suffix")}
          displayText={
            seam ? (strFromProps(props, "placeholder") ?? "—") : undefined
          }
          disabled={seam || onCommit == null}
          onChange={() => {
            /* live updates ignored; commit on blur */
          }}
          onCommit={(next) => {
            onCommit?.({ type: "length", value: next } as Value);
          }}
        />
      </span>
    </LeafRow>
  );
}

/** Colour swatch picker bound to a `Value::ColorRef`. Unresolved →
 *  the kit swatch-button chrome with an em-dash (disabled without a
 *  write path). */
export function ColorSwatchLeaf({ value, onCommit, props }: LeafProps) {
  const { resolved, ref } = unwrapColorRef(value);
  const seam = isSeam(props);
  if (!resolved) {
    return (
      <LeafRow {...rowProps(props)}>
        <span
          // A SEAM is not mixed — it is a control that cannot work here.
          // Every other leaf already made that distinction; this one
          // stamped `data-mixed` unconditionally, which the ADR-023
          // `absent` state (rendered as a seam) turned into a live lie.
          data-mixed={seam ? undefined : ""}
          data-seam={seam ? "true" : undefined}
          className="flex h-[28px] w-full items-center gap-2 rounded-[6px] border border-input bg-background px-2 opacity-55"
        >
          <span className="h-4 w-4 shrink-0 rounded border border-input" />
          <span
            className="flex-1 text-left text-xs"
            style={{ color: "var(--pg-muted-fg)" }}
          >
            —
          </span>
          <Icon
            name="ui-chevron-down"
            size={12}
            style={{ color: "var(--pg-muted-fg)" }}
          />
        </span>
      </LeafRow>
    );
  }
  return (
    <LeafRow {...rowProps(props)}>
      <ColorPicker
        value={ref}
        onCommit={(next) => {
          onCommit?.({ type: "colorRef", value: next } as Value);
        }}
      />
    </LeafRow>
  );
}

/** Titled section. Layout-only — the kit's section grammar:
 *  full-bleed hairline border-top (the panel pads 12px; the section
 *  pulls -12px to span edge-to-edge) with the 10px uppercase kicker
 *  BELOW the line. `heading: false` keeps only the `data-section`
 *  hook; `collapsible` renders the PK.Section disclosure header
 *  (12.5px semibold + chevron) instead of the kicker. */
export function LayoutSectionLeaf({ props }: LeafProps) {
  const title = typeof props.title === "string" ? props.title : undefined;
  const heading = props.heading !== false;
  const collapsible = props.collapsible === true;
  const [open, setOpen] = useState(props.defaultOpen !== false);
  if (!heading) {
    return (
      <div className="flex flex-col gap-[9px]" data-section={title}>
        {(props.children as React.ReactNode) ?? null}
      </div>
    );
  }
  if (collapsible) {
    return (
      <div className="-mx-3 border-t border-input px-3" data-section={title}>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent py-[9px] text-left"
          data-section-toggle
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span
            className="whitespace-nowrap text-[12.5px] font-semibold"
            style={{ color: "var(--pg-fg)", fontFamily: "var(--font-sans)" }}
          >
            {title}
          </span>
          <Icon
            name={open ? "ui-chevron-down" : "ui-chevron-right"}
            size={14}
            style={{ color: "var(--pg-muted-fg)" }}
          />
        </button>
        {open && (
          <div className="flex flex-col gap-[9px] pb-3">
            {(props.children as React.ReactNode) ?? null}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="-mx-3 border-t border-input px-3 pt-2" data-section={title}>
      {title ? <div className="pg-label mb-2">{title}</div> : null}
      <div className="flex flex-col gap-[9px]">
        {(props.children as React.ReactNode) ?? null}
      </div>
    </div>
  );
}

/** Multi-control metric row — the kit's bare 2-up/3-up grids.
 *  Props: `count` (columns), optional `sublabels` (8.5px centred
 *  labels under each cell), optional `caption` (10.5px muted text
 *  after the grid — "Drop cap"), optional `label` (stacked above). */
export function LayoutClusterLeaf({ props }: LeafProps) {
  const count =
    typeof props.count === "number" && props.count > 0
      ? (props.count as number)
      : 2;
  const sublabels = Array.isArray(props.sublabels)
    ? (props.sublabels as string[])
    : null;
  const caption = strFromProps(props, "caption");
  // The renderer forwards the raw child array as `childNodes`
  // (the `children` fragment can't be wrapped per cell).
  const childNodes = props.childNodes as React.ReactNode[] | undefined;
  const cells = Array.isArray(childNodes)
    ? childNodes
    : [(props.children as React.ReactNode) ?? null];

  const grid = (
    <div
      className="grid min-w-0 flex-1 gap-2"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      data-cluster={labelFromProps(props)}
    >
      {sublabels
        ? cells.map((cell, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-[3px]">
              {cell}
              <span
                className="select-none text-center text-[8.5px]"
                style={{ color: "var(--pg-muted-fg)" }}
              >
                {sublabels[i] ?? ""}
              </span>
            </div>
          ))
        : cells}
    </div>
  );

  const content = caption ? (
    <div className="flex items-center gap-2">
      {grid}
      <span
        className="shrink-0 text-[10.5px]"
        style={{ color: "var(--pg-muted-fg)" }}
      >
        {caption}
      </span>
    </div>
  ) : (
    grid
  );

  const label = labelFromProps(props);
  if (!label) return content;
  return (
    <LeafRow label={label} stack={props.labelPosition !== "left"}>
      {content}
    </LeafRow>
  );
}

function unwrapBoundsValue(
  v: Value | null,
): [number, number, number, number] | null {
  if (v == null) return null;
  if (v.type !== "bounds") return null;
  return v.value as [number, number, number, number];
}

/** 4-cell bounds editor `[top, left, bottom, right]` in points.
 *  `layout: "row4"` is the kit's compact 4-across grid with 8.5px
 *  labels below. `null` renders the same grid with em-dash cells. */
export function BoundsLeaf({ value, onCommit, props }: LeafProps) {
  const labels = (
    Array.isArray(props.labels)
      ? (props.labels as [string, string, string, string])
      : ["T", "L", "B", "R"]
  ) as [string, string, string, string];
  const layout = props.layout === "row4" ? "row4" : "grid2";
  const seam = isSeam(props);
  const bounds = unwrapBoundsValue(value);

  if (seam || bounds === null) {
    // Em-dash cells in the same grid chrome (disabled).
    return (
      <LeafRow {...rowProps(props)}>
        <div
          className={
            layout === "row4"
              ? "grid grid-cols-4 gap-[5px]"
              : "grid grid-cols-2 gap-1"
          }
          data-bounds-input
          data-mixed={seam ? undefined : ""}
          data-seam={seam ? "true" : undefined}
        >
          {labels.map((l) => (
            <div key={l} className="flex flex-col gap-[2px]">
              <NumberInput
                value={null}
                disabled
                onChange={() => {}}
                aria-label={l}
                className="w-full [&>input]:px-1 [&>input]:text-center"
              />
              {layout === "row4" && (
                <span
                  className="select-none text-center text-[8.5px]"
                  style={{ color: "var(--pg-muted-fg)" }}
                >
                  {l}
                </span>
              )}
            </div>
          ))}
        </div>
      </LeafRow>
    );
  }

  return (
    <LeafRow {...rowProps(props)}>
      <BoundsInput
        valuePt={bounds}
        labels={labels}
        layout={layout}
        disabled={onCommit == null}
        onChangePt={() => {
          /* live updates ignored; commit on Enter / blur */
        }}
        onCommitPt={(next) => {
          onCommit?.({ type: "bounds", value: next } as Value);
        }}
      />
    </LeafRow>
  );
}

/** Generic summary shape expected from every named document
 *  collection. `selfId` is the IDML `Self` id (used as the commit
 *  payload + react-key); `name` is the human-readable label. */
interface CollectionRow {
  selfId: string;
  name: string;
}

/** Reads a Value as either Text or ColorRef payload (the two
 *  string-id-carrying Value variants). */
function unwrapIdValue(v: Value | null): {
  resolved: boolean;
  id: string;
  source: "text" | "colorRef";
} {
  if (v == null) return { resolved: false, id: "", source: "text" };
  if (v.type === "text") {
    return { resolved: true, id: (v.value as string) ?? "", source: "text" };
  }
  if (v.type === "colorRef") {
    return {
      resolved: true,
      id: (v.value as string | null) ?? "",
      source: "colorRef",
    };
  }
  return { resolved: false, id: "", source: "text" };
}

/**
 * SDK Phase 5 (D7) — apply-an-entity selector over a named document
 * collection (kit Select chrome). On change →
 * `onCommit({ type: <valueType>, value: selfId })`; `valueType`
 * defaults to `"text"` (applied styles); Swatches/Gradients pass
 * `"colorRef"`. Mixed / no-selection keeps the select rendered with
 * the em-dash sentinel selected.
 */
export function CollectionSelectLeaf({ value, onCommit, props }: LeafProps) {
  const collectionName =
    typeof props.collectionName === "string"
      ? (props.collectionName as CollectionName)
      : null;
  const valueType: "text" | "colorRef" =
    props.valueType === "colorRef" ? "colorRef" : "text";
  // Hook must run unconditionally; safe fallback when the
  // composition doesn't declare a `collectionName`.
  const items = useCollection<CollectionRow>(
    (collectionName ?? "swatches") as CollectionName,
  );
  if (collectionName === null) {
    return (
      <LeafRow {...rowProps(props)}>
        <span className="text-xs text-destructive">
          missing collectionName prop
        </span>
      </LeafRow>
    );
  }
  const { resolved, id } = unwrapIdValue(value);
  if (items === null) {
    return (
      <LeafRow {...rowProps(props)}>
        <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
          loading…
        </span>
      </LeafRow>
    );
  }
  const showMixed = !resolved && value === null;
  return (
    <LeafRow {...rowProps(props)}>
      <KitSelect
        value={resolved ? id : "__mixed__"}
        soft={showMixed}
        disabled={onCommit == null}
        data-mixed={showMixed ? "true" : "false"}
        data-collection={collectionName}
        data-value-type={valueType}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "__mixed__") return;
          if (valueType === "colorRef") {
            // Empty string maps to "no fill" — Value::ColorRef(None).
            onCommit?.({
              type: "colorRef",
              value: next === "" ? null : next,
            } as Value);
          } else {
            onCommit?.({ type: "text", value: next } as Value);
          }
        }}
      >
        {showMixed && (
          <option value="__mixed__" disabled>
            —
          </option>
        )}
        <option value="">[None]</option>
        {items.map((row) => (
          <option key={row.selfId} value={row.selfId}>
            {displayName(row.name)}
          </option>
        ))}
      </KitSelect>
    </LeafRow>
  );
}

/** Option row for `SelectLeaf`. */
interface SelectOption {
  value: string;
  label: string;
}

function parseSelectOptions(props: Record<string, unknown>): SelectOption[] {
  const raw = Array.isArray(props.options) ? props.options : null;
  if (!raw) return [];
  return (raw as SelectOption[]).filter(
    (o): o is SelectOption =>
      !!o &&
      typeof o === "object" &&
      typeof (o as SelectOption).value === "string" &&
      typeof (o as SelectOption).label === "string",
  );
}

/**
 * Generic enum select (static option list) bound to `Value::Text`,
 * in the kit Select chrome. Seam: disabled, showing `placeholder`.
 * Null: em-dash sentinel selected, disabled without a write path.
 */
export function SelectLeaf({ value, onCommit, props }: LeafProps) {
  const options = parseSelectOptions(props);
  const seam = isSeam(props);
  if (seam) {
    const ph = strFromProps(props, "placeholder") ?? "—";
    return (
      <LeafRow {...rowProps(props)}>
        <KitSelect value="" soft disabled data-seam>
          <option value="">{ph}</option>
        </KitSelect>
      </LeafRow>
    );
  }
  const { resolved, id } = unwrapIdValue(value);
  const showMixed = !resolved;
  return (
    <LeafRow {...rowProps(props)}>
      <KitSelect
        value={showMixed ? "__mixed__" : id}
        soft={showMixed}
        disabled={onCommit == null}
        data-select-leaf
        data-mixed={showMixed ? "" : undefined}
        onChange={(e) => {
          if (e.target.value === "__mixed__") return;
          onCommit?.({ type: "text", value: e.target.value } as Value);
        }}
      >
        {showMixed && (
          <option value="__mixed__" disabled>
            —
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        {/* Keep an out-of-catalog current value visible rather than
            snapping the select to the first option. */}
        {resolved && options.every((o) => o.value !== id) ? (
          <option value={id}>{id}</option>
        ) : null}
      </KitSelect>
    </LeafRow>
  );
}

function unwrapBoolValue(v: Value | null): boolean | null {
  if (v == null) return null;
  if (v.type !== "bool") return null;
  return v.value === true;
}

/** The kit Toggle pill (30×17, knob 13). */
export function TogglePill({
  checked,
  disabled,
  mixed,
  onToggle,
  testId,
}: {
  checked: boolean;
  disabled?: boolean;
  mixed?: boolean;
  onToggle?: (next: boolean) => void;
  testId?: string;
}) {
  const inert = disabled || onToggle == null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={inert}
      data-toggle-switch={testId}
      data-on={checked ? "true" : "false"}
      data-mixed={mixed ? "" : undefined}
      className="relative w-[30px] h-[17px] shrink-0 cursor-pointer rounded-full border-0 disabled:cursor-default"
      style={{
        background: checked ? "var(--pg-primary)" : "var(--chrome-divider)",
        opacity: inert ? 0.55 : 1,
      }}
      onClick={() => onToggle?.(!checked)}
    >
      <span
        className="absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white shadow transition-[left]"
        style={{ left: checked ? 15 : 2 }}
      />
    </button>
  );
}

/**
 * On/off check row — the kit `CheckRow`: full-width flex, 12px FG
 * label left, Toggle pill right (space-between), padding 6px 0.
 * `labelPosition: "left"` renders the deep1 `Fld`+Toggle variant
 * instead (84px muted label, pill in the control column — the
 * "Balance" row). Binds `Value::Bool`. Seams render the pill OFF
 * and disabled (neutral — never an invented on-state). Null =
 * mixed: pill off, `data-mixed`; toggling write-replaces when a
 * commit path exists.
 */
export function ToggleSwitchLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props) ?? "";
  const seam = isSeam(props);
  const on = unwrapBoolValue(value);
  const pill = (
    <TogglePill
      checked={seam ? false : (on ?? false)}
      mixed={!seam && on === null}
      disabled={seam || onCommit == null}
      onToggle={(next) => {
        onCommit?.({ type: "bool", value: next } as Value);
      }}
    />
  );
  if (props.labelPosition === "left") {
    return (
      <div
        className="grid grid-cols-[84px_1fr] items-center gap-2"
        data-check-row={label}
        data-seam={seam ? "true" : undefined}
      >
        <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
          {label}
        </span>
        {pill}
      </div>
    );
  }
  return (
    <label
      className="flex items-center justify-between py-[6px]"
      data-check-row={label}
      data-seam={seam ? "true" : undefined}
    >
      <span className="text-xs" style={{ color: "var(--pg-fg)" }}>
        {label}
      </span>
      {pill}
    </label>
  );
}

/** Formats any resolved `Value` as the readout's mono text. */
function formatReadoutValue(v: Value): string {
  switch (v.type) {
    case "length": {
      if (v.value == null) return "—";
      const n = Math.round(v.value * 100) / 100;
      return `${n} pt`;
    }
    case "text":
      return v.value === "" ? "—" : v.value;
    case "bool":
      return v.value ? "true" : "false";
    case "colorRef":
      return v.value ?? "—";
    case "bounds":
      return `[${(v.value as number[]).map((n) => Math.round(n * 100) / 100).join(" ")}]`;
    case "transform":
      return v.value == null
        ? "—"
        : `[${v.value.map((n) => Math.round(n * 1000) / 1000).join(" ")}]`;
    default:
      return "—";
  }
}

/** Read-only mono value row. `text` renders a literal when no
 *  binding is wired. No write surface by design. */
export function ReadoutLeaf({ value, props }: LeafProps) {
  const literal = typeof props.text === "string" ? props.text : null;
  const display = value != null ? formatReadoutValue(value) : (literal ?? "—");
  return (
    <LeafRow {...rowProps(props)}>
      <span
        className="pg-value text-xs"
        data-readout
        data-mixed={value == null && literal == null ? "" : undefined}
      >
        {display}
      </span>
    </LeafRow>
  );
}

/** Option row for `ToggleGroupLeaf` — `label` is text OR a glyph
 *  name (`ui-`/`tool-`/`panel-` prefixes render as icons). */
interface ToggleGroupOption {
  value: string;
  label: string;
}

const ICON_OPTION = /^(ui|tool|panel)-/;

/**
 * Segmented multi-state toggle bound to a `Value::Text` enum (the
 * kit `Seg`: h28, joined segments, icons w32, active = dark slot).
 * The segments ALWAYS render: null = none active + `data-mixed`,
 * disabled without a write path; seams render neutral (no active)
 * and disabled.
 */
export function ToggleGroupLeaf({ value, onCommit, props }: LeafProps) {
  const optionsRaw = Array.isArray(props.options) ? props.options : null;
  const options: ToggleGroupOption[] = optionsRaw
    ? (optionsRaw as ToggleGroupOption[]).filter(
        (o): o is ToggleGroupOption =>
          !!o &&
          typeof o === "object" &&
          typeof (o as ToggleGroupOption).value === "string" &&
          typeof (o as ToggleGroupOption).label === "string",
      )
    : [];
  const seam = isSeam(props);
  const { resolved, text } = unwrapTextValueForToggle(value);
  const inert = seam || onCommit == null;
  const icons = options.length > 0 && ICON_OPTION.test(options[0].label);
  return (
    <LeafRow {...rowProps(props)}>
      <div
        className="inline-flex overflow-hidden rounded-[6px] border border-input"
        role="group"
        data-toggle-group
        data-seam={seam ? "true" : undefined}
        data-mixed={!seam && !resolved ? "" : undefined}
        style={{
          width: icons ? "fit-content" : "100%",
          opacity: inert ? 0.55 : 1,
        }}
      >
        {options.map((opt, i) => {
          // Seams stay NEUTRAL — no active segment on a seam.
          const active = !seam && resolved && text === opt.value;
          return (
            <button
              type="button"
              key={opt.value}
              disabled={inert}
              data-option-value={opt.value}
              data-active={active ? "true" : "false"}
              title={opt.value}
              className="flex h-[28px] cursor-pointer items-center justify-center border-0 text-[11px] disabled:cursor-default"
              style={{
                flex: icons ? "none" : 1,
                width: icons ? 32 : "auto",
                padding: icons ? 0 : "0 8px",
                fontFamily: "var(--font-sans)",
                borderRight:
                  i < options.length - 1
                    ? "1px solid var(--pg-border)"
                    : "none",
                background: active
                  ? "var(--chrome-slot-active)"
                  : "var(--pg-bg)",
                color: active
                  ? "var(--chrome-icon-active)"
                  : "var(--pg-muted-fg)",
              }}
              onClick={() => {
                onCommit?.({ type: "text", value: opt.value } as Value);
              }}
            >
              {icons ? <Icon name={opt.label} size={15} /> : opt.label}
            </button>
          );
        })}
      </div>
    </LeafRow>
  );
}

function unwrapTextValueForToggle(v: Value | null): {
  resolved: boolean;
  text: string;
} {
  if (v == null) return { resolved: false, text: "" };
  if (v.type !== "text") return { resolved: false, text: "" };
  return { resolved: true, text: (v.value as string) ?? "" };
}

/** Plain label (literal text). */
export function LabelLeaf({ props }: LeafProps) {
  const text = typeof props.text === "string" ? props.text : "";
  return (
    <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
      {text}
    </span>
  );
}

// ---------------------------------------------------------------- list

/**
 * Render WINDOW, not a cap (schema v1.2 revision of the B-01 rule).
 *
 * `packages/ui` still ships NO virtualized list primitive, and this
 * pass deliberately does not add one — see the note on `ListLeaf`. But
 * a hard cap and a paged window are not the same honesty: a cap makes
 * row 501 UNREACHABLE, which a tree makes worse rather than better,
 * while a window makes it one click away. The leaf renders this many
 * rows, then offers a "Show N more" button that adds another window's
 * worth, and keeps the `data-list-overflow` marker so the truncation
 * stays machine-visible.
 *
 * For a TREE the window applies to the VISIBLE (expanded) rows —
 * collapsing is the tree's own answer to size, and the two compose.
 */
const LIST_ROW_PAGE = 500;

/** A resolved per-row action the renderer (or an expert composition)
 *  hands the leaf via props — label + invoke callback; the SCHEMA
 *  side (`SchemaListAction` command/applyEntity dispatch) is resolved
 *  by the schema-panel renderer before it reaches the leaf. */
export interface ListLeafAction {
  /** Stable key; the row button's `data-list-action` hook. */
  key: string;
  label: string;
  disabled?: boolean;
  onInvoke: (rowId: string) => void;
}

/** Resolved TREE structure for the rows the leaf was handed. The
 *  schema renderer owns the flattening (`schema-tree.ts`) and hands
 *  down only what the leaf needs to draw: how far to indent, which
 *  rows own a disclosure control, and which are open. `items` arrives
 *  pre-flattened in visible order. */
export interface ListLeafTree {
  /** Indent level by row id (0 = root). */
  depth: Map<string, number>;
  /** Rows that own a disclosure twisty. */
  expandable: Set<string>;
  /** Rows currently open. */
  expanded: Set<string>;
  onToggle: (rowId: string) => void;
}

/** Resolved DRAG-REORDER. The leaf owns only the pointer mechanics
 *  and reports "row A was dropped on row B"; ALL index arithmetic —
 *  sibling resolution, the same-parent rule, which op to emit — stays
 *  in the schema renderer, which is the layer that knows the tree. */
export interface ListLeafReorder {
  onDrop: (draggedId: string, targetId: string) => void;
  disabled?: boolean;
}

/** Resolved INLINE RENAME. `field` seeds the draft (defaults to the
 *  label the leaf already computed); `onCommit` fires only for a
 *  non-empty, changed value. */
export interface ListLeafRename {
  field?: string;
  onCommit: (rowId: string, name: string) => void;
  disabled?: boolean;
}

/** Reads a dot-path ("name", "meta.kind") out of a row object. */
function fieldAt(row: unknown, path: string): unknown {
  let cur: unknown = row;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function fieldText(row: unknown, path: string | undefined): string | null {
  if (!path) return null;
  const v = fieldAt(row, path);
  if (v == null) return null;
  return displayName(String(v));
}

function parseListActions(props: Record<string, unknown>): ListLeafAction[] {
  const raw = Array.isArray(props.actions) ? props.actions : null;
  if (!raw) return [];
  return (raw as ListLeafAction[]).filter(
    (a): a is ListLeafAction =>
      !!a &&
      typeof a === "object" &&
      typeof a.key === "string" &&
      typeof a.label === "string" &&
      typeof a.onInvoke === "function",
  );
}

// The v1.2 props arrive as RESOLVED objects carrying callbacks (the
// `actions` convention) rather than schema data, because the tree
// arithmetic and the op choice belong to the schema renderer. Each
// parser is a structural guard so a malformed expert composition
// degrades to "no tree / no drag / no rename" instead of throwing
// mid-render.

function parseListTree(props: Record<string, unknown>): ListLeafTree | null {
  const t = props.tree as ListLeafTree | undefined;
  if (
    !t ||
    typeof t !== "object" ||
    !(t.depth instanceof Map) ||
    !(t.expandable instanceof Set) ||
    !(t.expanded instanceof Set) ||
    typeof t.onToggle !== "function"
  ) {
    return null;
  }
  return t;
}

function parseListReorder(
  props: Record<string, unknown>,
): ListLeafReorder | null {
  const r = props.reorder as ListLeafReorder | undefined;
  if (!r || typeof r !== "object" || typeof r.onDrop !== "function") return null;
  return r;
}

function parseListRename(props: Record<string, unknown>): ListLeafRename | null {
  const r = props.rename as ListLeafRename | undefined;
  if (!r || typeof r !== "object" || typeof r.onCommit !== "function")
    return null;
  return r;
}

/**
 * B-01 — the `paged.list` collection-list leaf. Renders rows from a
 * COLLECTION (props.items pre-resolved by the schema renderer, or
 * self-resolved from `props.collectionName` through the same
 * `useCollection` lane the collection-select leaf uses), with the
 * kit list-row grammar (12.5px primary, 10.5px mono secondary,
 * `--selected-bg` selection) and optional per-row action buttons.
 *
 * NOT built on the cockpit `ListRows` archetype on purpose: its
 * interactive row IS a `<button>`, so per-row action buttons would
 * nest buttons (invalid HTML). The leaf renders a div row with a
 * select button + sibling action buttons instead, speaking the same
 * visual vocabulary.
 *
 * Selection is CONTROLLED when `props.onSelect` is supplied (the
 * schema renderer publishes the id back through the panel's
 * bindings); otherwise the leaf keeps private selection state.
 *
 * v1.2 adds the three things B-01/G3 left open — TREE indentation +
 * disclosure (`props.tree`), DRAG-REORDER (`props.reorder`) and
 * INLINE RENAME (`props.rename`) — all optional, all off by default,
 * so a v1.1 list renders byte-identically.
 *
 * NOT VIRTUALIZED, deliberately. `@paged-media/ui` has no windowing
 * primitive, and one that stays correct while a drag auto-scrolls,
 * while row heights vary with the secondary line, and while a rename
 * input must survive its row scrolling out is a bigger, separately
 * testable piece of work than these three capabilities. What this
 * pass DOES fix is the honesty of the limit: the old hard cap made
 * row 501 unreachable, which a tree would have made worse; the window
 * plus "Show N more" makes it one click away, and a collapsed subtree
 * costs no rows at all.
 */
export function ListLeaf({ props }: LeafProps) {
  const collectionName =
    typeof props.collectionName === "string" &&
    !Array.isArray(props.items)
      ? (props.collectionName as CollectionName)
      : null;
  // Hook must run unconditionally — same safe-fallback idiom as
  // CollectionSelectLeaf.
  const fetched = useCollection<Record<string, unknown>>(
    (collectionName ?? "swatches") as CollectionName,
  );
  const [privateSelected, setPrivateSelected] = useState<string | null>(null);
  const [shown, setShown] = useState(LIST_ROW_PAGE);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const items: unknown[] = Array.isArray(props.items)
    ? (props.items as unknown[])
    : collectionName
      ? (fetched ?? [])
      : [];
  const labelField =
    typeof props.labelField === "string" ? props.labelField : "name";
  const secondaryField =
    typeof props.secondaryField === "string" ? props.secondaryField : undefined;
  const idField = typeof props.idField === "string" ? props.idField : "selfId";
  const onSelect =
    typeof props.onSelect === "function"
      ? (props.onSelect as (id: string) => void)
      : null;
  const selectedId = onSelect
    ? typeof props.selectedId === "string"
      ? (props.selectedId as string)
      : null
    : privateSelected;
  const actions = parseListActions(props);
  const tree = parseListTree(props);
  const reorder = parseListReorder(props);
  const rename = parseListRename(props);
  const draggable = reorder != null && !reorder.disabled;

  // ADR 023 phase C — WHO answered this collection. The schema renderer
  // resolves `documentCollection` lists through the binding-provider
  // seam and passes the answering plugin id down; absent = core. The
  // leaf renders provider rows and core rows with the SAME renderer (the
  // vocabulary rule is what makes that possible), so this is a DOM hook
  // and a diagnostic — it must never reach a conditional.
  const provider =
    typeof props.provider === "string" ? (props.provider as string) : null;
  const visible = items.slice(0, shown);
  return (
    <LeafRow {...rowProps(props)}>
      <div
        className="flex flex-col"
        data-list={collectionName ?? "items"}
        data-list-provider={provider ?? "core"}
      >
        {visible.length === 0 && (
          <div
            className="pg-ui-xs px-[9px] py-[7px]"
            style={{ color: "var(--pg-muted-fg)", fontStyle: "italic" }}
            data-list-empty
          >
            No entries
          </div>
        )}
        {visible.map((row, i) => {
          const id = fieldText(row, idField) ?? String(i);
          const label = fieldText(row, labelField) ?? id;
          const secondary = fieldText(row, secondaryField);
          const selected = selectedId === id;
          const depth = tree?.depth.get(id) ?? 0;
          const expandable = tree?.expandable.has(id) ?? false;
          const expanded = tree?.expanded.has(id) ?? false;
          const editing = editingId === id;
          const commitRename = () => {
            const next = draft.trim();
            setEditingId(null);
            // No-ops are swallowed rather than spending an undo step.
            if (next === "" || next === label) return;
            rename?.onCommit(id, next);
          };
          return (
            <div
              key={id}
              className="mb-px flex items-center gap-[6px] rounded-[7px] pr-[6px]"
              data-list-row={id}
              data-list-depth={tree ? depth : undefined}
              data-selected={selected ? "true" : undefined}
              data-drop-target={dropId === id ? "true" : undefined}
              draggable={draggable && !editing}
              onDragStart={
                draggable
                  ? (e) => {
                      // Firefox refuses to start a drag without payload;
                      // the id itself rides in React state (the drop
                      // handler needs it synchronously anyway).
                      e.dataTransfer.setData("text/plain", id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(id);
                    }
                  : undefined
              }
              onDragEnd={
                draggable
                  ? () => {
                      setDragId(null);
                      setDropId(null);
                    }
                  : undefined
              }
              onDragOver={
                draggable
                  ? (e) => {
                      // Without preventDefault the browser never fires
                      // `drop` — the classic HTML5 DnD footgun.
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dropId !== id) setDropId(id);
                    }
                  : undefined
              }
              onDragLeave={
                draggable
                  ? () => setDropId((cur) => (cur === id ? null : cur))
                  : undefined
              }
              onDrop={
                draggable
                  ? (e) => {
                      e.preventDefault();
                      const from =
                        dragId ?? e.dataTransfer.getData("text/plain") ?? null;
                      setDragId(null);
                      setDropId(null);
                      if (from && from !== id) reorder.onDrop(from, id);
                    }
                  : undefined
              }
              style={{
                background: selected ? "var(--selected-bg)" : "transparent",
                outline:
                  dropId === id && dragId !== id
                    ? "1px solid var(--pg-primary)"
                    : undefined,
                opacity: dragId === id ? 0.5 : undefined,
              }}
            >
              {tree && (
                <button
                  type="button"
                  data-list-twisty={id}
                  data-expanded={expandable ? String(expanded) : undefined}
                  aria-label={
                    expandable
                      ? `${expanded ? "Collapse" : "Expand"}: ${label}`
                      : undefined
                  }
                  disabled={!expandable}
                  className="shrink-0 cursor-pointer border-0 bg-transparent disabled:cursor-default"
                  style={{
                    // Indent lives on the twisty so the label column
                    // stays a single truncating flex child.
                    marginLeft: depth * 12,
                    width: 16,
                    height: 16,
                    opacity: expandable ? 1 : 0,
                    color: "var(--pg-muted-fg)",
                  }}
                  onClick={() => expandable && tree.onToggle(id)}
                >
                  <Icon
                    name={expanded ? "ui-chevron-down" : "ui-chevron-right"}
                    size={13}
                  />
                </button>
              )}
              {editing ? (
                <input
                  autoFocus
                  data-list-rename={id}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === "Escape") {
                      setEditingId(null);
                    }
                  }}
                  className="min-w-0 flex-1 rounded-[6px] border px-[8px] py-[5px] text-[12.5px] outline-none"
                  style={{
                    fontFamily: "var(--font-sans)",
                    borderColor: "var(--pg-primary)",
                    background: "var(--pg-bg)",
                    color: "var(--pg-fg)",
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent px-[9px] py-[6px] text-left"
                  data-list-row-select
                  onClick={() => {
                    if (onSelect) onSelect(id);
                    else setPrivateSelected(id);
                  }}
                  onDoubleClick={
                    rename && !rename.disabled
                      ? () => {
                          setDraft(fieldText(row, rename.field) ?? label);
                          setEditingId(id);
                        }
                      : undefined
                  }
                >
                  <span
                    className="block truncate text-[12.5px]"
                    style={{
                      fontFamily: "var(--font-sans)",
                      color: selected ? "var(--pg-primary)" : "var(--pg-fg)",
                    }}
                  >
                    {label}
                  </span>
                  {secondary != null && (
                    <span
                      className="block truncate text-[10.5px]"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--pg-muted-fg)",
                      }}
                      data-list-secondary
                    >
                      {secondary}
                    </span>
                  )}
                </button>
              )}
              {actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  disabled={a.disabled}
                  aria-label={`${a.label}: ${label}`}
                  data-list-action={a.key}
                  className="shrink-0 cursor-pointer rounded-[6px] border px-[7px] text-[11px] leading-[22px] disabled:cursor-default"
                  style={{
                    fontFamily: "var(--font-sans)",
                    borderColor: "var(--pg-border)",
                    background: "var(--pg-bg)",
                    color: "var(--pg-muted-fg)",
                    opacity: a.disabled ? 0.45 : 1,
                  }}
                  onClick={() => a.onInvoke(id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          );
        })}
        {items.length > visible.length && (
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent px-[9px] py-[5px] text-left"
            data-list-overflow={items.length}
            data-list-more
            onClick={() => setShown((n) => n + LIST_ROW_PAGE)}
          >
            <span
              className="pg-ui-xs"
              style={{ color: "var(--pg-muted-fg)" }}
            >
              Show {Math.min(LIST_ROW_PAGE, items.length - visible.length)}{" "}
              more ({visible.length} of {items.length})
            </span>
          </button>
        )}
      </div>
    </LeafRow>
  );
}
