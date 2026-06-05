// SDK Phase 3 — primitive catalog leaves.
//
// Wraps `@paged-media/ui` widgets with the LeafProps shape the catalog
// renderer hands them. Each leaf reads its primary value from the
// `value` prop (already resolved by the binding hook) and writes
// back via `onCommit`. The leaves are intentionally tiny — the
// design-system widgets in @paged-media/ui do the heavy lifting.
//
// Panel-gallery pass: leaves carry the cockpit kit's field language
// (30px controls, 6px radius, 92px label column, kicker sections)
// and an explicit HONEST-SEAM state — `props.seam: true` renders
// the control visibly but disabled, showing `props.placeholder`.
// A seam is never fake-interactive.

import { useState } from "react";

import type { LeafProps } from "@paged-media/catalog";
import type { CollectionName, Value } from "@paged-media/client";
import {
  BoundsInput,
  LengthInput,
  ColorPicker,
  NumberInput,
} from "@paged-media/ui";

import { Icon } from "../icons";
import { useCollection } from "./use-collection";

// ---------------------------------------------------------------- helpers

/** Returns (resolved, value-in-points). `resolved` is false when the
 *  binding itself failed to resolve (mixed / no selection / non-
 *  length variant); `pointValue` is meaningless in that case. When
 *  `resolved` is true, `pointValue` is the displayable number — 0
 *  if the underlying `Value::Length(None)` is "inherit default"
 *  (matches the inspector's `value ?? 0` convention). */
function unwrapLengthValue(v: Value | null): {
  resolved: boolean;
  pointValue: number;
} {
  if (v == null) return { resolved: false, pointValue: 0 };
  if (v.type !== "length") return { resolved: false, pointValue: 0 };
  return { resolved: true, pointValue: v.value ?? 0 };
}

function unwrapColorRefValue(v: Value | null): {
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

/** The honest-seam test — the explicit `seam: true` prop ONLY.
 *  (A missing `onCommit` can NOT signal a seam: the binding hook
 *  returns no commit closure when the selection is empty, and a
 *  live field with nothing selected must show the em-dash, not a
 *  disabled control.) Seam nodes declare no bindings and the flag,
 *  so the composition source reads honestly. */
function isSeam(props: Record<string, unknown>): boolean {
  return props.seam === true;
}

function placeholderFromProps(props: Record<string, unknown>): string {
  return typeof props.placeholder === "string" ? props.placeholder : "";
}

/** Em-dash placeholder — the mixed / no-selection convention. */
function MixedDash() {
  return (
    <span className="text-xs text-muted-foreground" data-mixed>
      —
    </span>
  );
}

// ---------------------------------------------------------------- leaves

/** Numeric input with a unit picker. Binds to a `Value::Length`.
 *  Optional `icon` prop renders the kit's `Metric` look (glyph chip
 *  + value field; the chip is the scrub handle); `unitPicker: false`
 *  drops the unit select (compact cluster cells). */
export function LengthLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
  const icon = iconFromProps(props);
  const unitPicker = props.unitPicker !== false;
  if (isSeam(props)) {
    const ph = Number.parseFloat(placeholderFromProps(props));
    return (
      <LeafRow label={label}>
        <span data-seam>
          <LengthInput
            valuePt={Number.isFinite(ph) ? ph : 0}
            icon={icon}
            unitPicker={unitPicker}
            disabled
            onChangePt={() => {}}
          />
        </span>
      </LeafRow>
    );
  }
  const { resolved, pointValue } = unwrapLengthValue(value);
  if (!resolved) {
    return (
      <LeafRow label={label}>
        <MixedDash />
      </LeafRow>
    );
  }
  return (
    <LeafRow label={label}>
      <LengthInput
        valuePt={pointValue}
        icon={icon}
        unitPicker={unitPicker}
        onChangePt={(next) => {
          // Live updates are emitted; we only commit on blur via
          // onCommitPt below to avoid spamming the mutation channel.
          // Suppress the lint about the unused-variable.
          void next;
        }}
        onCommitPt={(next) => {
          onCommit?.({ type: "length", value: next } as Value);
        }}
      />
    </LeafRow>
  );
}

/** Color swatch picker. Binds to a `Value::ColorRef`. */
export function ColorSwatchLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
  const { resolved, ref } = unwrapColorRefValue(value);
  if (!resolved) {
    return (
      <LeafRow label={label}>
        <MixedDash />
      </LeafRow>
    );
  }
  return (
    <LeafRow label={label}>
      <ColorPicker
        value={ref}
        onCommit={(next) => {
          onCommit?.({ type: "colorRef", value: next } as Value);
        }}
      />
    </LeafRow>
  );
}

/** Raw scrubbable numeric (no unit). Binds to a `Value::Length`. */
export function NumericScrubLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
  const icon = iconFromProps(props);
  if (isSeam(props)) {
    const ph = Number.parseFloat(placeholderFromProps(props));
    return (
      <LeafRow label={label}>
        <span data-seam>
          <NumberInput
            value={Number.isFinite(ph) ? ph : 0}
            icon={icon}
            disabled
            onChange={() => {}}
          />
        </span>
      </LeafRow>
    );
  }
  const { resolved, pointValue } = unwrapLengthValue(value);
  if (!resolved) {
    return (
      <LeafRow label={label}>
        <MixedDash />
      </LeafRow>
    );
  }
  return (
    <LeafRow label={label}>
      <NumberInput
        value={pointValue}
        icon={icon}
        onChange={() => {
          /* live updates ignored; commit on blur */
        }}
        onCommit={(next) => {
          onCommit?.({ type: "length", value: next } as Value);
        }}
      />
    </LeafRow>
  );
}

/** Titled section. Layout-only — renders the catalog children
 *  under the kit's uppercase kicker label. Props:
 *   - `heading: false` — keep the `data-section` hook but render
 *     no border/legend (panel roots: the dock tab already titles
 *     the surface; the gallery body starts directly with fields).
 *   - `collapsible` + `defaultOpen` — disclosure sections
 *     ("Paragraph rules", "Dashes & arrows"). */
export function LayoutSectionLeaf({ props }: LeafProps) {
  const title = typeof props.title === "string" ? props.title : undefined;
  const heading = props.heading !== false;
  const collapsible = props.collapsible === true;
  const [open, setOpen] = useState(props.defaultOpen !== false);
  if (!heading) {
    return (
      <div className="flex flex-col gap-1.5" data-section={title}>
        {(props.children as React.ReactNode) ?? null}
      </div>
    );
  }
  if (collapsible) {
    return (
      <div className="border-t border-input pt-2" data-section={title}>
        <button
          type="button"
          className="pg-label flex w-full items-center justify-between bg-transparent border-0 px-1 cursor-pointer"
          data-section-toggle
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {title}
          <Icon
            name={open ? "ui-chevron-down" : "ui-chevron-right"}
            size={13}
            style={{ color: "var(--pg-muted-fg)" }}
          />
        </button>
        {open && (
          <div className="flex flex-col gap-1.5 pt-1">
            {(props.children as React.ReactNode) ?? null}
          </div>
        )}
      </div>
    );
  }
  return (
    <fieldset className="border-t border-input pt-2" data-section={title}>
      {title ? <legend className="pg-label px-1">{title}</legend> : null}
      <div className="flex flex-col gap-1.5 pt-1">
        {(props.children as React.ReactNode) ?? null}
      </div>
    </fieldset>
  );
}

/** Labelled multi-control row — the gallery's paired/tripled field
 *  rows ("Style + Size", "L / R / 1st indent"). Layout-only: one
 *  row label on the left, the pre-rendered children in an even
 *  grid. Child leaves omit their `label` (they render bare) and
 *  carry an `icon` chip instead. */
export function LayoutClusterLeaf({ props }: LeafProps) {
  const label = labelFromProps(props);
  const count =
    typeof props.count === "number" && props.count > 0
      ? (props.count as number)
      : 2;
  return (
    <LeafRow label={label}>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
        data-cluster={label}
      >
        {(props.children as React.ReactNode) ?? null}
      </div>
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
 *  Props: `labels` (cell labels, wire order), `layout` —
 *  `"grid2"` (default, 2×2 scrub chips) or `"row4"` (the gallery's
 *  compact 4-across row with labels below). */
export function BoundsLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
  const labels = Array.isArray(props.labels)
    ? (props.labels as [string, string, string, string])
    : undefined;
  const layout = props.layout === "row4" ? "row4" : "grid2";
  const bounds = unwrapBoundsValue(value);
  if (isSeam(props)) {
    return (
      <LeafRow label={label} stacked={layout === "row4"}>
        <span data-seam>
          <BoundsInput
            valuePt={bounds ?? [0, 0, 0, 0]}
            labels={labels}
            layout={layout}
            disabled
            onChangePt={() => {}}
          />
        </span>
      </LeafRow>
    );
  }
  if (bounds === null) {
    return (
      <LeafRow label={label}>
        <MixedDash />
      </LeafRow>
    );
  }
  return (
    <LeafRow label={label} stacked={layout === "row4"}>
      <BoundsInput
        valuePt={bounds}
        labels={labels}
        layout={layout}
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
 *  payload + react-key); `name` is the human-readable label.
 *  Additional collection-specific fields (e.g. swatch `kind`) are
 *  passed through but the v1 leaf doesn't render them. */
interface CollectionRow {
  selfId: string;
  name: string;
}

/** Reads a Value as either Text or ColorRef payload (the two
 *  string-id-carrying Value variants). Returns the unwrapped
 *  string + the originating variant so the commit path emits the
 *  matching shape on write. */
function unwrapIdValue(v: Value | null): {
  resolved: boolean;
  id: string;
  /** Source variant — informs which Value variant onCommit emits.
   *  Defaults to "text" for the "no-binding" case so the
   *  collection-select still works without explicit valueType. */
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

/** Shared kit styling for the native `<select>` controls. */
const SELECT_CLASS =
  "w-full text-xs h-[30px] px-2 rounded-[6px] border border-input bg-background text-foreground disabled:text-muted-foreground disabled:opacity-100";

/**
 * SDK Phase 5 (D7) — apply-an-entity selector. Reads
 * `props.collectionName` (a `CollectionName`) + `props.label`
 * (the row label), fetches the live array via `useCollection`,
 * renders a `<select>` whose options are the collection's
 * `selfId` + `name` pairs, plus a leading `[None]` entry for
 * clearing the override.
 *
 * On change → `onCommit({ type: <valueType>, value: selfId })`.
 * `valueType` defaults to `"text"` (the original applied-entity
 * shape used by Paragraph / Character / Object Styles); the
 * Swatches + Gradients panels pass `valueType: "colorRef"` so the
 * commit emits a `Value::ColorRef`. The bound binding's
 * `path` decides which apply arm consumes the commit, and the
 * panel author picks the `valueType` to match.
 *
 * Mixed / no-selection / non-text-or-colorRef binding → em-dash
 * placeholder (existing leaf convention).
 */
export function CollectionSelectLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
  const collectionName =
    typeof props.collectionName === "string"
      ? (props.collectionName as CollectionName)
      : null;
  const valueType: "text" | "colorRef" =
    props.valueType === "colorRef" ? "colorRef" : "text";
  // Hook must run unconditionally; pass a safe fallback when the
  // composition doesn't declare a `collectionName`. The follow-up
  // branch below renders the error placeholder.
  const items = useCollection<CollectionRow>(
    (collectionName ?? "swatches") as CollectionName,
  );
  if (collectionName === null) {
    return (
      <LeafRow label={label}>
        <span className="text-xs text-destructive">
          missing collectionName prop
        </span>
      </LeafRow>
    );
  }
  const { resolved, id } = unwrapIdValue(value);
  if (items === null) {
    return (
      <LeafRow label={label}>
        <span className="text-xs text-muted-foreground">loading…</span>
      </LeafRow>
    );
  }
  const showMixed = !resolved && value === null;
  return (
    <LeafRow label={label}>
      <select
        className={SELECT_CLASS}
        value={resolved ? id : ""}
        data-mixed={showMixed ? "true" : "false"}
        data-collection={collectionName}
        data-value-type={valueType}
        onChange={(e) => {
          const next = e.target.value;
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
        <option value="">[None]</option>
        {items.map((row) => (
          <option key={row.selfId} value={row.selfId}>
            {row.name}
          </option>
        ))}
        {/* "mixed" sentinel exposes the placeholder so the binding
            hook's multi-element collapse can show an em-dash without
            the select arbitrarily picking the first row. */}
        {showMixed ? (
          <option value="__mixed__" disabled>
            —
          </option>
        ) : null}
      </select>
    </LeafRow>
  );
}

/** Option row for `SelectLeaf`. `value` is the wire payload;
 *  `label` is the user-facing option text. */
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
 * Panel-gallery pass — generic enum select. Binds to a
 * `Value::Text` carrying a fixed enum string (unlike
 * `CollectionSelectLeaf`, the option list is static composition
 * data, not a document collection). Props:
 *   - `label` — row label.
 *   - `options: {value, label}[]` — the choices.
 *   - `seam` / `placeholder` — honest-seam rendering: a disabled
 *     select showing the placeholder text.
 */
export function SelectLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
  const options = parseSelectOptions(props);
  if (isSeam(props)) {
    const ph = placeholderFromProps(props);
    return (
      <LeafRow label={label}>
        <select className={SELECT_CLASS} value="" disabled data-seam>
          <option value="">{ph || "—"}</option>
        </select>
      </LeafRow>
    );
  }
  const { resolved, id } = unwrapIdValue(value);
  if (!resolved) {
    return (
      <LeafRow label={label}>
        <MixedDash />
      </LeafRow>
    );
  }
  return (
    <LeafRow label={label}>
      <select
        className={SELECT_CLASS}
        value={id}
        data-select-leaf
        onChange={(e) => {
          onCommit?.({ type: "text", value: e.target.value } as Value);
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        {/* Keep an out-of-catalog current value visible rather than
            snapping the select to the first option. */}
        {options.every((o) => o.value !== id) ? (
          <option value={id}>{id}</option>
        ) : null}
      </select>
    </LeafRow>
  );
}

function unwrapBoolValue(v: Value | null): {
  resolved: boolean;
  on: boolean;
} {
  if (v == null) return { resolved: false, on: false };
  if (v.type !== "bool") return { resolved: false, on: false };
  return { resolved: true, on: v.value === true };
}

/**
 * Panel-gallery pass — on/off switch pill (the kit `Toggle`).
 * Binds to a `Value::Bool`. Props:
 *   - `label` — row label.
 *   - `seam` / `placeholder` — honest seam; `placeholder: "on"`
 *     renders the disabled pill in the on position.
 */
export function ToggleSwitchLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
  const seam = isSeam(props);
  const { resolved, on } = unwrapBoolValue(value);
  if (!seam && !resolved) {
    return (
      <LeafRow label={label}>
        <MixedDash />
      </LeafRow>
    );
  }
  const checked = seam ? placeholderFromProps(props) === "on" : on;
  return (
    <LeafRow label={label}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={seam}
        data-toggle-switch
        data-on={checked ? "true" : "false"}
        data-seam={seam ? "true" : undefined}
        className="relative w-[30px] h-[17px] rounded-full border-0 shrink-0 disabled:cursor-default cursor-pointer"
        style={{
          background: checked ? "var(--pg-primary)" : "var(--chrome-divider)",
          opacity: seam ? 0.55 : 1,
        }}
        onClick={() => {
          if (seam) return;
          onCommit?.({ type: "bool", value: !checked } as Value);
        }}
      >
        <span
          className="absolute top-[2px] w-[13px] h-[13px] rounded-full bg-white shadow transition-[left]"
          style={{ left: checked ? 15 : 2 }}
        />
      </button>
    </LeafRow>
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

/**
 * Panel-gallery pass — read-only mono value row (the raw
 * inspector / Info readouts). Renders whatever `Value` variant
 * the binding resolves, formatted tabular-mono. No write path by
 * design. A `text` prop renders a literal when no binding is
 * wired (static readouts).
 */
export function ReadoutLeaf({ value, props }: LeafProps) {
  const label = labelFromProps(props);
  const literal = typeof props.text === "string" ? props.text : null;
  const display = value != null ? formatReadoutValue(value) : (literal ?? "—");
  return (
    <LeafRow label={label}>
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

/** Option row for `ToggleGroupLeaf`. `value` is the wire payload
 *  (e.g. `"LeftAlign"`); `label` is the user-facing button label —
 *  either text or a glyph name (`ui-*` / `tool-*` / `panel-*`
 *  prefixes render as icons, the gallery's own heuristic). */
interface ToggleGroupOption {
  value: string;
  label: string;
}

const ICON_OPTION = /^(ui|tool|panel)-/;

/**
 * SDK Phase 5 (v1 sweep) — segmented multi-state toggle. Binds
 * to a `Value::Text` carrying an IDML enum string. Props:
 *   - `label` — row label.
 *   - `options: ToggleGroupOption[]` — the segment definitions;
 *     `value` is the wire payload, `label` is the displayed
 *     text or a glyph name. Required.
 *   - `seam` / `placeholder` — honest seam; the placeholder names
 *     the option `value` rendered as selected.
 *
 * On change → `onCommit({ type: "text", value: option.value })`.
 * Kit visual: joined segments inside one hairline border, active
 * segment inverts to the dark chrome slot.
 */
export function ToggleGroupLeaf({ value, onCommit, props }: LeafProps) {
  const label = labelFromProps(props);
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
  // Follow the LengthLeaf / ColorSwatchLeaf convention: when the
  // binding doesn't resolve (no selection / mixed / wrong variant),
  // render the em-dash placeholder span with `data-mixed`. The
  // toggle buttons only show when there's a resolved value to
  // reflect; the user must establish a selection first. Seams
  // render regardless — visibly disabled.
  if (!seam && !resolved) {
    return (
      <LeafRow label={label}>
        <MixedDash />
      </LeafRow>
    );
  }
  const current = seam ? placeholderFromProps(props) : text;
  const icons = options.length > 0 && ICON_OPTION.test(options[0].label);
  return (
    <LeafRow label={label}>
      <div
        className="inline-flex overflow-hidden rounded-[6px] border border-input"
        role="group"
        data-toggle-group
        data-seam={seam ? "true" : undefined}
        style={{
          width: icons ? "fit-content" : "100%",
          opacity: seam ? 0.55 : 1,
        }}
      >
        {options.map((opt, i) => {
          const active = current === opt.value;
          return (
            <button
              type="button"
              key={opt.value}
              disabled={seam}
              data-option-value={opt.value}
              data-active={active ? "true" : "false"}
              title={opt.value}
              className="flex items-center justify-center text-xs h-[27px] border-0 disabled:cursor-default cursor-pointer"
              style={{
                flex: icons ? "none" : 1,
                width: icons ? 30 : "auto",
                padding: icons ? 0 : "0 8px",
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
                if (seam) return;
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
  return <span className="text-xs text-muted-foreground">{text}</span>;
}

function LeafRow({
  label,
  stacked,
  children,
}: {
  label?: string;
  /** Full-width control under the label (the 4-up bounds rows). */
  stacked?: boolean;
  children: React.ReactNode;
}) {
  if (stacked) {
    return (
      <div className="flex flex-col gap-1">
        {label ? (
          <label className="text-xs text-muted-foreground">{label}</label>
        ) : null}
        {children}
      </div>
    );
  }
  // No label → bare control (cluster children: the cluster row
  // carries the shared label; the child shows only its icon chip).
  if (!label) {
    return <>{children}</>;
  }
  return (
    <div className="grid grid-cols-[92px_1fr] items-center gap-2">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
