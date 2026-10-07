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
import { Badges, ObjectFieldFrame, useObjectField, type BindScopeOf } from "./object-field";
import type { ShellObjectWriteResult, ShellPropertySchema, ShellValueEdit, ShellValueType } from "./object-model-types";
import {
  formatValue,
  itemTitle,
  listAffordances,
  listItems,
  optionsFor,
  parseInput,
  subFieldsOf,
  widgetFor,
  type FieldPresentation,
  type FieldState,
  type ListPresentation,
  type SubFieldPresentation,
} from "./property-field-model";

export interface PropertyFieldProps extends FieldPresentation {
  // `fields` (a struct row) and `items` (a list row) come with
  // FieldPresentation (§12.8).
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
  /** No `label`: label the row with the schema row's title (else the
   *  path). Plugin rows declared without a label use it. */
  autoLabel?: boolean;
  /** ADR 323 — how "Bind to data…" reaches a plugin object durably. */
  bindScope?: BindScopeOf;
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
  if (type.kind === "text" && type.multiline) {
    // A multi-line text row (HTML / CSS source, notes): a textarea that
    // commits on blur or Cmd/Ctrl+Enter, Escape reverts.
    return (
      <textarea
        value={draft}
        disabled={disabled}
        rows={4}
        placeholder={state.state === "mixed" ? "—" : (placeholder ?? "")}
        data-mixed={state.state === "mixed" || state.state === "none" ? "" : undefined}
        data-invalid={invalid ? "" : undefined}
        aria-invalid={invalid ? true : undefined}
        title={invalid ?? undefined}
        className="w-full resize-y rounded-[6px] border border-input bg-transparent px-2 py-1 font-mono text-xs"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
          if (e.key === "Escape") setDraft(shown);
        }}
      />
    );
  }
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

// ------------------------------------------- list / struct values (§12.8)

/** One value of a known type as its widget, outside a schema row: a
 *  struct's field, a list's scalar item. Commits the raw value. */
function ValueControl({
  type,
  presentation,
  value,
  onCommit,
  label,
  chromeProps,
}: {
  type: ShellValueType;
  presentation: FieldPresentation;
  value: unknown;
  onCommit: ((value: unknown) => void) | null;
  label?: string;
  chromeProps?: Record<string, unknown>;
}) {
  const widget = widgetFor(type, presentation);
  const chrome: Record<string, unknown> = {
    ...(chromeProps ?? {}),
    ...(label ? { label, labelPosition: "left" } : {}),
  };
  if (widget === "number" && type.kind === "number" && type.unit && !chrome.suffix) {
    const suffix = UNIT_SUFFIX[type.unit];
    if (suffix) chrome.suffix = suffix;
  }
  if (widget === "select" || widget === "segments") chrome.options = optionsFor(type, presentation);
  if (widget === "collection") {
    chrome.collectionName = presentation.collection;
    chrome.valueType = type.kind === "color" ? "colorRef" : "text";
  }
  const leafProps: LeafProps = {
    value: leafValue(type, widget, value),
    onCommit: onCommit ? (v: Value) => onCommit((v as { value?: unknown }).value ?? null) : undefined,
    props: chrome,
  };
  switch (widget) {
    case "length":
      return <LengthLeaf {...leafProps} />;
    case "number":
      return <NumericScrubLeaf {...leafProps} />;
    case "color":
      return <ColorSwatchLeaf {...leafProps} />;
    case "collection":
      return <CollectionSelectLeaf {...leafProps} />;
    case "toggle":
      return <ToggleSwitchLeaf {...leafProps} />;
    case "bounds":
      return <BoundsLeaf {...leafProps} />;
    case "select":
      return <SelectLeaf {...leafProps} />;
    case "segments":
      return <ToggleGroupLeaf {...leafProps} />;
    default:
      return (
        <LabelledRow label={label} adornment={null}>
          <TypedTextField
            type={type}
            row={null}
            state={value === undefined ? { state: "none" } : { state: "value", value }}
            onCommit={onCommit}
            disabled={!onCommit}
          />
        </LabelledRow>
      );
  }
}

type Edit = ((e: ShellValueEdit) => Promise<ShellObjectWriteResult>) | null;

/** The fields of ONE struct value, each committing a field edit. */
function StructFields({
  type,
  value,
  fields,
  onField,
}: {
  type: ShellValueType;
  value: unknown;
  fields?: readonly (string | SubFieldPresentation)[];
  onField: ((field: string, v: unknown) => void) | null;
}) {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return (
    <div className="flex flex-col gap-1">
      {subFieldsOf(type, fields, value).map((f) => (
        <div key={f.field} data-struct-field={f.field}>
          <ValueControl
            type={f.type}
            presentation={f.presentation}
            value={rec[f.field] ?? null}
            label={f.label}
            chromeProps={f.props}
            onCommit={onField ? (v) => onField(f.field, v) : null}
          />
        </div>
      ))}
    </div>
  );
}

const iconButton =
  "h-[22px] min-w-[22px] rounded-[4px] border border-input px-1 text-[11px] leading-none disabled:opacity-40";

/** A LIST value: its items (struct items as their fields, scalars as one
 *  widget), with add / remove / reorder. Every change is ONE edit = one
 *  batch = one undo step. */
function ItemsField({
  path,
  type,
  state,
  edit,
  items,
  label,
  adornment,
}: {
  path: string;
  type: ShellValueType;
  state: FieldState;
  edit: Edit;
  items?: ListPresentation;
  label?: string;
  adornment: React.ReactNode;
}) {
  const of: ShellValueType = type.kind === "list" ? type.of : { kind: "text" };
  const value = state.state === "value" ? state.value : state.state === "absent" ? [] : null;
  const shown = value === null ? [] : listItems(value, items);
  const length = Array.isArray(value) ? value.length : 0;
  const can = listAffordances(type, length, edit !== null && value !== null, items);
  const run = (e: ShellValueEdit) => {
    if (edit) void edit(e);
  };
  return (
    <div
      className="flex flex-col gap-1"
      data-property-list={path}
      data-list-length={value === null ? undefined : length}
      data-mixed={state.state === "mixed" || state.state === "none" ? "" : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }}>
          {label}
          {adornment}
        </span>
        {can.add ? (
          <button
            type="button"
            className={iconButton}
            data-list-add=""
            title="Add an item"
            onClick={() => run({ edit: "add", ...(items?.newItem !== undefined ? { item: structuredClone(items.newItem) } : {}) })}
          >
            +
          </button>
        ) : null}
      </div>
      {value === null ? (
        <span className="text-xs" data-list-empty="">
          —
        </span>
      ) : shown.length === 0 ? (
        <span className="text-xs" style={{ color: "var(--pg-muted-fg)" }} data-list-empty="">
          No items
        </span>
      ) : (
        shown.map(({ index, item }, pos) => {
          const above = pos > 0 ? shown[pos - 1]!.index : null;
          const below = pos < shown.length - 1 ? shown[pos + 1]!.index : null;
          return (
            <div
              key={index}
              data-list-item={index}
              className="flex flex-col gap-1 rounded-[6px] border border-input p-1"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-medium" data-list-item-title="">
                  {itemTitle(item, index, items)}
                </span>
                <span className="flex gap-1">
                  {can.reorder ? (
                    <>
                      <button
                        type="button"
                        className={iconButton}
                        data-list-move-up=""
                        title="Move up"
                        disabled={above === null}
                        onClick={() => above !== null && run({ edit: "move", from: index, to: above })}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        data-list-move-down=""
                        title="Move down"
                        disabled={below === null}
                        onClick={() => below !== null && run({ edit: "move", from: index, to: below })}
                      >
                        ↓
                      </button>
                    </>
                  ) : null}
                  {can.remove ? (
                    <button
                      type="button"
                      className={iconButton}
                      data-list-remove=""
                      title="Remove"
                      onClick={() => run({ edit: "remove", index })}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              </div>
              {of.kind === "struct" ? (
                <StructFields
                  type={of}
                  value={item}
                  fields={items?.fields}
                  onField={edit ? (field, v) => run({ edit: "itemSet", index, field, value: v }) : null}
                />
              ) : (
                <ValueControl
                  type={of}
                  presentation={{}}
                  value={item}
                  onCommit={edit ? (v) => run({ edit: "itemSet", index, value: v }) : null}
                />
              )}
            </div>
          );
        })
      )}
    </div>
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

  // ADR 023: `absent` is a SEAM only when an edit-context provider says
  // so. Core answering `absent` means "this kind carries no such entry"
  // (a text frame has no end cap): that reads as the em-dash, like the
  // selection binding always showed it, not as a disabled seam.
  const seam = state.state === "refused" || (state.state === "absent" && field.provider !== null);
  const write = row && field.commit && !seam ? field.commit : null;
  const commitLeaf = write
    ? (v: Value) => {
        void write((v as { value?: unknown }).value ?? null);
      }
    : undefined;

  const label = props.label ?? (props.autoLabel ? (row?.title ?? path) : undefined);
  const adornment = <Badges bound={field.bound} inferred={field.inferred} />;
  const chrome: Record<string, unknown> = {
    ...(props.chrome ?? {}),
    ...(label ? { label } : {}),
    ...(props.labelPosition ? { labelPosition: props.labelPosition } : {}),
    ...(label ? { labelAdornment: adornment } : {}),
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
    case "items":
      control = (
        <ItemsField
          path={path}
          type={type}
          state={state}
          edit={write ? field.edit : null}
          items={props.items}
          label={label}
          adornment={adornment}
        />
      );
      break;
    case "struct":
      control = (
        <LabelledRow label={label} adornment={adornment}>
          <div
            data-property-struct={path}
            data-mixed={state.state === "mixed" || state.state === "none" ? "" : undefined}
          >
            <StructFields
              type={type}
              value={state.state === "value" ? state.value : null}
              fields={props.fields}
              onField={
                write && field.edit && state.state !== "mixed"
                  ? (f, v) => void field.edit!({ edit: "fieldSet", field: f, value: v })
                  : null
              }
            />
          </div>
        </LabelledRow>
      );
      break;
    default:
      control = (
        <LabelledRow label={label} adornment={adornment}>
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
    <ObjectFieldFrame
      field={field}
      bindable={props.bindable}
      bindScope={props.bindScope}
      badges={!label}
    >
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
    fields,
    items,
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
      fields={Array.isArray(fields) ? (fields as FieldPresentation["fields"]) : undefined}
      items={items && typeof items === "object" ? (items as ListPresentation) : undefined}
      chrome={chrome}
    />
  );
}
