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

// ADR 323 — the ONE schema-driven property field.
//
// `<PropertyField path="frameStrokeWeight" />` reads its target's schema
// row (ADR 132) and renders the widget its `ValueType` calls for, reading
// and writing through `host.objects` (`useObjectProperty`). A core path
// and a plugin path render through the same component, so every panel
// built from it gets the same three affordances for free:
//
//   · "Bind to data…" (context menu) — hands paged.data a DURABLE target
//     (a selector over a Name or an `x-paged:oid` label, ADR 558/559),
//     the path and the schema row;
//   · a binding badge when a paged.data recipe targets the path;
//   · an "inferred" badge when the row's type was inferred rather than
//     probed (the SDK seam marks those until core publishes its schemas).
//
// Widgets REUSE the catalog leaves (same chrome, same `data-mixed` /
// seam semantics) for the types they already render; the remaining types
// (transform, point, list, ref, text, struct) get a typed text field that
// refuses input it cannot parse rather than coercing it.

import { useEffect, useState } from "react";

import type { LeafProps } from "@paged-media/catalog";
import type { Value } from "@paged-media/client";

import { Input } from "../components/ui/input";
import {
  BoundsLeaf,
  CollectionSelectLeaf,
  ColorSwatchLeaf,
  LengthLeaf,
  NumericScrubLeaf,
  SelectLeaf,
  ToggleGroupLeaf,
  ToggleSwitchLeaf,
} from "./leaves";
import { Badges, ObjectFieldFrame, useObjectField } from "./object-field";
import type { ShellPropertySchema, ShellValueType } from "./object-model-types";
import {
  formatValue,
  optionsFor,
  parseInput,
  widgetFor,
  type FieldPresentation,
  type FieldState,
} from "./property-field-model";

export interface PropertyFieldProps extends FieldPresentation {
  /** The ADR 132 path on the target's address kind. */
  path: string;
  label?: string;
  labelPosition?: "left" | "stack";
  scope?: "element" | "content";
  /** Explicit addresses instead of the selection (plugin objects, `doc`). */
  targets?: readonly string[];
  schemaKind?: string;
  /** Leaf chrome passthrough (icon, prefix, suffix, placeholder, layout,
   *  labels, count …). */
  chrome?: Record<string, unknown>;
  /** Offer "Bind to data…" (default: when the row is bindable). */
  bindable?: boolean;
}

const UNIT_SUFFIX: Record<string, string> = { percent: "%", deg: "°" };

function leafValue(type: ShellValueType, widget: string, value: unknown): Value | null {
  if (value === undefined) return null;
  // A definite NULL is a value, not "mixed": an unset length
  // (`Value::Length(None)`) or "no colour" — the same wire shapes the
  // selection binding handed the leaves, so they keep their null-vs-mixed
  // distinction. Other widgets have no null face and show the em-dash.
  if (value === null) {
    switch (widget) {
      case "length":
      case "number":
        return { type: "length", value: null } as unknown as Value;
      case "color":
        return { type: "colorRef", value: null } as Value;
      case "collection":
        return (type.kind === "color"
          ? { type: "colorRef", value: null }
          : { type: "text", value: "" }) as Value;
      default:
        return null;
    }
  }
  switch (widget) {
    case "length":
    case "number":
      return { type: "length", value } as Value;
    case "color":
      return { type: "colorRef", value } as Value;
    case "collection":
      return (type.kind === "color"
        ? { type: "colorRef", value }
        : { type: "text", value: String(value) }) as Value;
    case "toggle":
      return { type: "bool", value } as Value;
    case "bounds":
      return { type: "bounds", value } as Value;
    case "select":
    case "segments":
      return { type: "text", value: String(value) } as Value;
    default:
      void type;
      return null;
  }
}

/** The typed text field for the types no catalog leaf renders. */
function TypedTextField({
  type,
  row,
  state,
  onCommit,
  disabled,
  placeholder,
}: {
  type: ShellValueType;
  row: ShellPropertySchema | null;
  state: FieldState;
  onCommit: ((value: unknown) => void) | null;
  disabled: boolean;
  placeholder?: string;
}) {
  const shown = state.state === "value" ? formatValue(type, state.value) : "";
  const [draft, setDraft] = useState(shown);
  const [invalid, setInvalid] = useState<string | null>(null);
  useEffect(() => {
    setDraft(shown);
    setInvalid(null);
  }, [shown]);
  const commit = () => {
    if (!onCommit || draft === shown) return;
    const r = parseInput(type, draft, row ?? undefined);
    if (!r.ok) {
      setInvalid(r.reason);
      return;
    }
    setInvalid(null);
    onCommit(r.value);
  };
  return (
    <Input
      value={draft}
      disabled={disabled}
      placeholder={state.state === "mixed" ? "—" : (placeholder ?? "")}
      data-mixed={state.state === "mixed" || state.state === "none" ? "" : undefined}
      data-invalid={invalid ? "" : undefined}
      aria-invalid={invalid ? true : undefined}
      title={invalid ?? undefined}
      className="h-[28px] font-mono text-xs"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(shown);
      }}
    />
  );
}

// ------------------------------------------------------- the field

export function PropertyField(props: PropertyFieldProps) {
  const { path, scope = "element" } = props;
  const field = useObjectField({
    path,
    scope,
    targets: props.targets,
    schemaKind: props.schemaKind,
  });

  const row = field.row;
  // No row yet (schema loading, or no model): render as the field's
  // nominal widget, disabled — never a guessed type that might write.
  const type: ShellValueType = row?.type ?? { kind: "text" };
  const widget = widgetFor(type, props);
  const options = optionsFor(type, props);
  const state = field.state;

  const seam = state.state === "absent" || state.state === "refused";
  const write = row && field.commit && !seam ? field.commit : null;
  const commitLeaf = write
    ? (v: Value) => {
        void write((v as { value?: unknown }).value ?? null);
      }
    : undefined;

  const adornment = <Badges bound={field.bound} inferred={field.inferred} />;
  const chrome: Record<string, unknown> = {
    ...(props.chrome ?? {}),
    ...(props.label ? { label: props.label } : {}),
    ...(props.labelPosition ? { labelPosition: props.labelPosition } : {}),
    ...(props.label ? { labelAdornment: adornment } : {}),
    ...(seam ? { seam: true } : {}),
  };
  if (widget === "number" && type.kind === "number" && type.unit && !chrome.suffix) {
    const suffix = UNIT_SUFFIX[type.unit];
    if (suffix) chrome.suffix = suffix;
  }
  if (widget === "select" || widget === "segments") chrome.options = options;
  if (widget === "collection") {
    chrome.collectionName = props.collection;
    chrome.valueType = type.kind === "color" ? "colorRef" : "text";
  }

  const value =
    state.state === "value" ? leafValue(type, widget, state.value) : null;
  const leafProps: LeafProps = { value, onCommit: commitLeaf, props: chrome };

  let control: React.ReactNode;
  switch (widget) {
    case "length":
      control = <LengthLeaf {...leafProps} />;
      break;
    case "number":
      control = <NumericScrubLeaf {...leafProps} />;
      break;
    case "color":
      control = <ColorSwatchLeaf {...leafProps} />;
      break;
    case "collection":
      control = <CollectionSelectLeaf {...leafProps} />;
      break;
    case "toggle":
      control = <ToggleSwitchLeaf {...leafProps} />;
      break;
    case "bounds":
      control = <BoundsLeaf {...leafProps} />;
      break;
    case "select":
      control = <SelectLeaf {...leafProps} />;
      break;
    case "segments":
      control = <ToggleGroupLeaf {...leafProps} />;
      break;
    default:
      control = (
        <LabelledRow label={props.label} adornment={adornment}>
          <TypedTextField
            type={type}
            row={row}
            state={state}
            onCommit={write ? (v) => void write(v) : null}
            disabled={!write}
            placeholder={typeof props.chrome?.placeholder === "string" ? props.chrome.placeholder : undefined}
          />
        </LabelledRow>
      );
  }

  return (
    <ObjectFieldFrame field={field} bindable={props.bindable} badges={!props.label}>
      {control}
    </ObjectFieldFrame>
  );
}

function LabelledRow({
  label,
  adornment,
  children,
}: {
  label?: string;
  adornment: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!label) return <>{children}</>;
  return (
    <div className="grid grid-cols-[84px_1fr] items-center gap-2">
      <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
        {label}
        {adornment}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** The catalog leaf (`paged.input.property`): a composition node names
 *  the PATH in props, not a `selectionProperty` binding — the type comes
 *  from the schema, the value from `host.objects`. */
export function PropertyFieldLeaf({ props }: LeafProps) {
  const {
    path,
    label,
    labelPosition,
    scope,
    targets,
    schemaKind,
    options,
    style,
    bindable,
    collectionName,
    ...chrome
  } = props as Record<string, unknown>;
  if (typeof path !== "string") {
    return (
      <span className="text-xs text-destructive" data-catalog-invalid="paged.input.property">
        paged.input.property needs a path
      </span>
    );
  }
  return (
    <PropertyField
      path={path}
      label={typeof label === "string" ? label : undefined}
      labelPosition={labelPosition === "stack" || labelPosition === "left" ? labelPosition : undefined}
      scope={scope === "content" ? "content" : "element"}
      targets={Array.isArray(targets) ? (targets as string[]) : undefined}
      schemaKind={typeof schemaKind === "string" ? schemaKind : undefined}
      options={Array.isArray(options) ? (options as FieldPresentation["options"]) : undefined}
      style={
        style === "segments" || style === "select" || style === "collection" ? style : undefined
      }
      collection={typeof collectionName === "string" ? collectionName : undefined}
      bindable={typeof bindable === "boolean" ? bindable : undefined}
      chrome={chrome}
    />
  );
}
