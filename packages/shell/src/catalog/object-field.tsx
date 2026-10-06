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

// ADR 323 — the object-model field WITHOUT a widget.
//
// `PropertyField` picks a widget from the schema row. Some panel controls
// are bespoke on purpose — a font-family select over the `fonts`
// collection, OpenType chips that toggle tags inside one string, the
// reference-point resize that writes `frameBounds`, an effect's enable
// pill. Those keep their widget, but they get the same three things a
// schema-driven field gets:
//
//   · reads and writes through `host.objects` (`useObjectField`): the
//     selection's addresses, ONE batch per commit = one undo step, the
//     ADR 023 provider claim still first;
//   · "Bind to data…" on right-click and the bound / inferred badges
//     (`<ObjectFieldFrame field>`);
//   · the same DOM verdict hooks (`data-control`, `data-binding-source`,
//     `data-binding-state`) the composition renderer stamps.
//
// `useObjectBindings` is the drop-in for `useBindings` over
// `selectionProperty` maps: the same `{ value, onCommit, state,
// provider }` shape, so a bespoke panel swaps one hook and wraps its
// controls in frames. Its map must be a module-level constant (one hook
// per key, in key order).

import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { Value } from "@paged-media/client";

import { Icon } from "../icons";
import { useRegistries } from "../state/registries-context";
import { useCanvasClient } from "../state/canvas-client-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  useElementLabels,
  useObjectModel,
  useObjectProperty,
  type ObjectProperty,
  type ObjectPropertyRequest,
} from "./object-model";
import type { ShellPropertySchema, ShellValueType } from "./object-model-types";
import {
  BIND_PROPERTY_ARGS,
  BIND_PROPERTY_COMMAND_IDS,
  OID_LABEL_KEY,
  checkArgs,
  oidFromEnvelope,
  resolveBindTarget,
} from "./property-field-model";

/** The wire `Value` variant a schema type reads back as, for paths the
 *  app names no wire for (plugin rows). */
export function wireTypeFor(type: ShellValueType | undefined): string {
  switch (type?.kind) {
    case "bool":
      return "bool";
    case "number":
    case "length":
      return "length";
    case "color":
      return "colorRef";
    case "bounds":
      return "bounds";
    case "transform":
      return "transform";
    default:
      return "text";
  }
}

export type ObjectBindingState = "value" | "mixed" | "absent" | "none";

/** One object-model field, in both shapes a control may want. */
export interface ObjectField extends ObjectProperty {
  path: string;
  /** `useBindings`-shaped value: the read wrapped in its wire variant. */
  value: Value | null;
  /** `useBindings`-shaped commit: a wire `Value` in, its `.value` written
   *  through `host.objects`. `null` = nothing to write to. */
  onCommit: ((next: Value) => void) | null;
  /** `useBindings`' four-state verdict (a refusal reads as `absent`: the
   *  control cannot work here, and its title says why). */
  bindingState: ObjectBindingState;
  /** Who answered: the edit-context provider, the plugin that owns the
   *  address, or `core`. */
  source: string;
}

function ownerOf(address: string | undefined): string | null {
  if (!address?.startsWith("plugin:")) return null;
  const slash = address.indexOf("/");
  return slash > 7 ? address.slice(7, slash) : null;
}

export function useObjectField(req: ObjectPropertyRequest): ObjectField {
  const field = useObjectProperty(req);
  const model = useObjectModel();
  const wire = model?.wireOf?.(req.path) ?? wireTypeFor(field.row?.type);
  const s = field.state;
  const value: Value | null =
    s.state === "value" && s.value !== undefined
      ? ({ type: wire, value: s.value } as unknown as Value)
      : null;
  const commit = field.commit;
  const onCommit = commit
    ? (next: Value) => {
        void commit((next as { value?: unknown }).value ?? null);
      }
    : null;
  // A refusal reads as `absent` (the control cannot work here); core's
  // own `absent` (no such entry on this kind) reads as `mixed`, exactly
  // as the selection binding reported it — `absent` stays the ADR 023
  // provider verdict.
  const bindingState: ObjectBindingState =
    s.state === "refused"
      ? "absent"
      : s.state === "absent" && !field.provider
        ? "mixed"
        : s.state;
  return {
    ...field,
    path: req.path,
    value,
    onCommit,
    bindingState,
    source: field.provider ?? ownerOf(field.addresses[0]) ?? "core",
  };
}

type ObjectBindingSpec = {
  path: string;
  scope?: "element" | "content";
  targets?: readonly string[];
  schemaKind?: string;
};

/** `useBindings` over a `selectionProperty` map, routed through
 *  `host.objects`. `map` MUST be a module-level constant. */
export function useObjectBindings<K extends string>(
  map: Readonly<Record<K, ObjectBindingSpec>>,
): Record<K, ObjectField> {
  const out = {} as Record<K, ObjectField>;
  for (const key of Object.keys(map) as K[]) {
    const spec = map[key];
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed key set
    out[key] = useObjectField({
      path: spec.path,
      scope: spec.scope,
      targets: spec.targets,
      schemaKind: spec.schemaKind,
    });
  }
  return out;
}

export function Badges({ bound, inferred }: { bound: boolean; inferred: boolean }) {
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
export function useBindToData(field: ReturnType<typeof useObjectProperty>, path: string) {
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

export function BindNoticeDialog({ notice, onClose }: { notice: BindNotice | null; onClose: () => void }) {
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

export function FieldMenu({
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


// ------------------------------------------------- the frame

/** Can this field offer "Bind to data…"? */
export function canBindField(field: ObjectProperty, bindable?: boolean): boolean {
  const row = field.row;
  return (
    (bindable ?? true) &&
    row !== null &&
    (row.bindable ?? (row.access ?? "readWrite") === "readWrite") &&
    field.addresses.length > 0 &&
    !field.provider
  );
}

/**
 * The chrome every object-model field shares, around ANY control: the
 * verdict hooks, the right-click "Bind to data…", the badges, the last
 * refusal. `PropertyField` renders its schema widget inside one; a
 * bespoke control renders itself inside one.
 */
export function ObjectFieldFrame({
  field,
  bindable,
  className = "relative min-w-0",
  badges = true,
  children,
  ...rest
}: {
  field: ObjectField;
  bindable?: boolean;
  className?: string;
  /** Draw the corner badge (off when the control shows them itself,
   *  e.g. next to its label). */
  badges?: boolean;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const bind = useBindToData(field, field.path);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const canBind = canBindField(field, bindable);
  const s = field.state;
  return (
    <div
      className={className}
      data-property-field={field.path}
      data-control={field.path}
      data-binding-source={field.source}
      data-binding-state={field.bindingState}
      data-value-type={field.row ? field.row.type.kind : undefined}
      data-inferred={field.inferred ? "" : undefined}
      data-bound={field.bound ? "" : undefined}
      title={s.state === "refused" ? s.reason : undefined}
      onContextMenu={(e) => {
        if (!canBind) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      {...rest}
    >
      {children}
      {badges && (field.bound || field.inferred) ? (
        <span className="pointer-events-auto absolute -top-[3px] right-0">
          <Badges bound={field.bound} inferred={field.inferred} />
        </span>
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
