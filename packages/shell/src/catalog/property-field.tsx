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

import { useCallback, useEffect, useState } from "react";

import type { LeafProps } from "@paged-media/catalog";
import type { Value } from "@paged-media/client";

import { Icon } from "../icons";
import { useRegistries } from "../state/registries-context";
import { useCanvasClient } from "../state/canvas-client-context";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  BoundsLeaf,
  ColorSwatchLeaf,
  LengthLeaf,
  NumericScrubLeaf,
  SelectLeaf,
  ToggleGroupLeaf,
  ToggleSwitchLeaf,
} from "./leaves";
import { useElementLabels, useObjectModel, useObjectProperty } from "./object-model";
import type { ShellPropertySchema, ShellValueType } from "./object-model-types";
import {
  BIND_PROPERTY_ARGS,
  BIND_PROPERTY_COMMAND_IDS,
  OID_LABEL_KEY,
  checkArgs,
  oidFromEnvelope,
  formatValue,
  optionsFor,
  parseInput,
  resolveBindTarget,
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
  if (value === null || value === undefined) return null;
  switch (widget) {
    case "length":
    case "number":
      return { type: "length", value } as Value;
    case "color":
      return { type: "colorRef", value } as Value;
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

function Badges({ bound, inferred }: { bound: boolean; inferred: boolean }) {
  if (!bound && !inferred) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-[3px] align-middle">
      {bound && (
        <span
          data-badge="bound"
          title="Bound to data"
          className="inline-flex"
          style={{ color: "var(--pg-primary)" }}
        >
          <Icon name="ui-database" size={10} />
        </span>
      )}
      {inferred && (
        <span
          data-badge="inferred"
          title="type inferred"
          className="inline-block h-[5px] w-[5px] rounded-full border"
          style={{ borderColor: "var(--pg-muted-fg)", opacity: 0.7 }}
        />
      )}
    </span>
  );
}

// ------------------------------------------------- Bind to data…

interface BindRequest {
  selector: string;
  path: string;
  schema: string;
}

type BindNotice = BindRequest & {
  /** Why nothing bound: no data plugin offers the command yet, or it
   *  refused. `null` with `command: null` = the not-yet case. */
  reason: string | null;
  command: string | null;
};

const mintOid = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * "Bind to data…": resolve a DURABLE target for the field's first object,
 * then hand paged.data `(selector, path, schema)` through its bindProperty
 * command. paged.data's universal binding arrives in Wave 5 (ADR 558);
 * until a bundle registers the command the editor shows the prefilled
 * request with a not-yet message — and writes nothing (no oid label is
 * minted for a binding that cannot be made).
 */
function useBindToData(field: ReturnType<typeof useObjectProperty>, path: string) {
  const model = useObjectModel();
  const client = useCanvasClient();
  const { commands } = useRegistries();
  const readLabels = useElementLabels();
  const [notice, setNotice] = useState<BindNotice | null>(null);

  const open = useCallback(async () => {
    if (!model || !field.row) return;
    const address = field.addresses[0];
    if (!address) return;
    const typed = await model.objects.commands().catch(() => []);
    const plain = BIND_PROPERTY_COMMAND_IDS.find((id) => commands.get(id)) ?? null;
    const typedId =
      BIND_PROPERTY_COMMAND_IDS.find((id) => typed.some((c) => c.id === id)) ?? null;
    const command = plain ?? typedId;
    const element = field.elementOf(address);
    const target = await resolveBindTarget(
      {
        objects: model.objects,
        readName: async () => (await readLabels(element)).name,
        readOid: async () => oidFromEnvelope((await readLabels(element)).oid),
        // `caller` omitted: the editor writes outside any plugin's own
        // namespace; the engine still gates the `x-paged:` prefix and the
        // `{v, data}` envelope. One undo step, like any label write.
        writeOid: async (_address, envelope) => {
          if (!element) throw new Error("no element to label");
          await client.mutate({
            op: "setPluginMetadata",
            args: { elementId: element, key: OID_LABEL_KEY, value: envelope },
          } as never);
        },
        mintOid,
      },
      address,
      { write: command !== null },
    );
    const request: BindRequest = {
      selector: target.selector,
      path,
      schema: JSON.stringify(field.row),
    };
    const bad = checkArgs(BIND_PROPERTY_ARGS, request);
    if (bad || !command) {
      setNotice({ ...request, reason: bad, command: null });
      return;
    }
    try {
      if (plain) await commands.invoke(plain, request);
      else await model.objects.invoke(command, request);
    } catch (err) {
      setNotice({ ...request, reason: String(err), command });
    }
  }, [model, client, field, commands, readLabels, path]);

  return { open, notice, close: () => setNotice(null) };
}

function BindNoticeDialog({ notice, onClose }: { notice: BindNotice | null; onClose: () => void }) {
  return (
    <Dialog open={notice !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-bind-to-data="" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bind to data</DialogTitle>
          <DialogDescription data-bind-notice="">
            {notice?.reason
              ? `The binding could not be made: ${notice.reason}`
              : "Property binding arrives with paged.data's universal binding. This is the request it will receive."}
          </DialogDescription>
        </DialogHeader>
        {notice && (
          <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-xs">
            <dt style={{ color: "var(--pg-muted-fg)" }}>Target</dt>
            <dd className="font-mono break-all" data-bind-selector={notice.selector}>
              {notice.selector}
            </dd>
            <dt style={{ color: "var(--pg-muted-fg)" }}>Property</dt>
            <dd className="font-mono" data-bind-path={notice.path}>
              {notice.path}
            </dd>
            <dt style={{ color: "var(--pg-muted-fg)" }}>Type</dt>
            <dd className="font-mono break-all" data-bind-schema="">
              {(JSON.parse(notice.schema) as ShellPropertySchema).type.kind}
            </dd>
          </dl>
        )}
        <DialogFooter>
          <button
            type="button"
            className="h-[28px] rounded-[6px] border border-input px-3 text-xs"
            onClick={onClose}
          >
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldMenu({
  at,
  onBind,
  onClose,
}: {
  at: { x: number; y: number };
  onBind: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);
  return (
    <div
      role="menu"
      data-property-field-menu=""
      className="fixed z-50 min-w-[150px] rounded-[6px] border border-input py-1 text-xs shadow-md"
      style={{ left: at.x, top: at.y, background: "var(--pg-bg)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        data-menu-item="bind-to-data"
        className="block w-full px-3 py-[5px] text-left hover:bg-[var(--chrome-slot-active)]"
        onClick={() => {
          onClose();
          onBind();
        }}
      >
        Bind to data…
      </button>
    </div>
  );
}

// ------------------------------------------------------- the field

export function PropertyField(props: PropertyFieldProps) {
  const { path, scope = "element" } = props;
  const field = useObjectProperty({
    path,
    scope,
    targets: props.targets,
    schemaKind: props.schemaKind,
  });
  const bind = useBindToData(field, path);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const row = field.row;
  // No row yet (schema loading, or no model): render as the field's
  // nominal widget, disabled — never a guessed type that might write.
  const type: ShellValueType = row?.type ?? { kind: "text" };
  const widget = widgetFor(type, props);
  const options = optionsFor(type, props);
  const state = field.state;
  const canBind =
    (props.bindable ?? true) &&
    row !== null &&
    (row.bindable ?? (row.access ?? "readWrite") === "readWrite") &&
    field.addresses.length > 0 &&
    !field.provider;

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
    <div
      className="relative min-w-0"
      data-property-field={path}
      data-control={path}
      data-binding-source={field.provider ?? "objects"}
      data-binding-state={state.state}
      data-value-type={row ? type.kind : undefined}
      data-inferred={field.inferred ? "" : undefined}
      data-bound={field.bound ? "" : undefined}
      title={state.state === "refused" ? state.reason : undefined}
      onContextMenu={(e) => {
        if (!canBind) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {control}
      {!props.label && (field.bound || field.inferred) ? (
        <span className="pointer-events-auto absolute -top-[3px] right-0">{adornment}</span>
      ) : null}
      {field.error ? (
        <div
          data-field-error=""
          className="mt-[2px] text-[10.5px]"
          style={{ color: "var(--status-error, var(--pg-destructive))" }}
        >
          {field.error}
        </div>
      ) : null}
      {menu && (
        <FieldMenu at={menu} onBind={() => void bind.open()} onClose={() => setMenu(null)} />
      )}
      <BindNoticeDialog notice={bind.notice} onClose={bind.close} />
    </div>
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
      style={style === "segments" || style === "select" ? style : undefined}
      bindable={typeof bindable === "boolean" ? bindable : undefined}
      chrome={chrome}
    />
  );
}
