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

// ADR 323 — PLUGIN object properties through the ONE PropertyField.
//
// A plugin declares a property row (`{ field: "property", address, path,
// kind }`, plugin-api panel schema v1.2) or renders `host.widgets.
// PropertyField` in its own React panel. Both land here: the address is
// resolved to the object addresses the field edits, then the shared
// `PropertyField` renders the schema row's widget over `host.objects` —
// the same read/write path, undo step, "Bind to data…" and badge as a
// core field.
//
// Address forms (all LOOKUPS, never expressions):
//   · "selection"          — the selected objects; with `kind`, the objects
//                            of that kind each selected object HOSTS
//                            (`<selected> > <kind>`, one registry query);
//   · a selector           — `host.objects.query(selector)`, re-run on change;
//   · { bind: name }       — an address / list the plugin publishes;
//   · { addresses: [...] } — as given.
//
// "Bind to data…" gets a DURABLE target: a declared selector (narrowed
// with `:nth`), or the selected host's durable core target `> kind`.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ElementId } from "@paged-media/client";

import { useSelection } from "../state/selection-context";
import { ObjectFieldFrame, useObjectField, type BindScope, type BindScopeOf } from "./object-field";
import { useObjectModel } from "./object-model";
import { PropertyField } from "./property-field";
import type { ListPresentation, SubFieldPresentation } from "./property-field-model";
import type { BindingsSurface, PanelSchemaPropertyRow, PropertyFieldAddress } from "./schema-panel-types";

/** What a resolved address hands the field. `targets: undefined` = the
 *  plain selection (PropertyField's own default). */
export interface ResolvedFieldTargets {
  targets: readonly string[] | undefined;
  bindScope: BindScopeOf | undefined;
}

const sameList = (a: readonly string[] | undefined, b: readonly string[] | undefined) =>
  a === b || (!!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]));

function asAddressList(v: unknown): string[] {
  if (typeof v === "string") return v ? [v] : [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x !== "");
  return [];
}

/**
 * Resolve a property-field address to the addresses it edits, live: the
 * selection, object-model changes and published bindings re-resolve it.
 */
export function useFieldTargets(
  address: PropertyFieldAddress,
  kind: string | undefined,
  bindings?: BindingsSurface,
): ResolvedFieldTargets {
  const model = useObjectModel();
  const { elementSelection } = useSelection();
  const addressKey = typeof address === "string" ? address : JSON.stringify(address);

  // Change ticks: the object model (a layer added, a frame removed) and
  // the plugin's published bindings.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!model) return;
    const d = model.objects.onDidChange(() => setTick((n) => n + 1));
    return () => d.dispose();
  }, [model]);
  const bindName = typeof address === "object" && "bind" in address ? address.bind : null;
  const [bound, setBound] = useState<string[]>(() =>
    bindName && bindings ? asAddressList(bindings.get(bindName)) : [],
  );
  useEffect(() => {
    if (!bindName || !bindings) {
      setBound([]);
      return;
    }
    const read = () => {
      const next = asAddressList(bindings.get(bindName));
      setBound((prev) => (sameList(prev, next) ? prev : next));
    };
    read();
    const d = bindings.onDidChange((name) => {
      if (name === bindName) read();
    });
    return () => d.dispose();
  }, [bindName, bindings]);

  // Selection hosts (core addresses + their elements), for a scoped kind.
  const scopedToKind = address === "selection" && !!kind;
  const hosts = useMemo((): { address: string; element: ElementId }[] => {
    if (!scopedToKind || !model) return [];
    return elementSelection.map((id) => ({ address: model.addressOf(id), element: id }));
  }, [scopedToKind, model, elementSelection]);
  const hostsKey = hosts.map((h) => h.address).join("\n");
  // Every selected object as a possible host (for `{ bind }` addresses).
  const selectionHosts = useMemo(
    (): { address: string; element: ElementId }[] =>
      model ? elementSelection.map((id) => ({ address: model.addressOf(id), element: id })) : [],
    [model, elementSelection],
  );

  // Query-resolved forms: a selector, or the selection scoped to a kind.
  const [queried, setQueried] = useState<{ list: string[]; hostOf: Map<string, number> }>({
    list: [],
    hostOf: new Map(),
  });
  const isSelector = typeof address === "string" && address !== "selection";
  useEffect(() => {
    if (!model || (!isSelector && !scopedToKind)) {
      setQueried((prev) => (prev.list.length === 0 ? prev : { list: [], hostOf: new Map() }));
      return;
    }
    let cancelled = false;
    void (async () => {
      const list: string[] = [];
      const hostOf = new Map<string, number>();
      if (isSelector) {
        list.push(...(await model.objects.query(address as string).catch(() => [] as string[])));
      } else {
        const hostList = hostsKey ? hostsKey.split("\n") : [];
        for (let i = 0; i < hostList.length; i++) {
          const hits = await model.objects.query(`${hostList[i]} > ${kind}`).catch(() => [] as string[]);
          for (const h of hits) {
            if (!hostOf.has(h)) {
              hostOf.set(h, i);
              list.push(h);
            }
          }
        }
      }
      if (!cancelled) {
        setQueried((prev) => (sameList(prev.list, list) ? prev : { list, hostOf }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // `addressKey` stands for `address`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, addressKey, isSelector, scopedToKind, hostsKey, kind, tick]);

  return useMemo((): ResolvedFieldTargets => {
    if (address === "selection" && !kind) return { targets: undefined, bindScope: undefined };
    if (typeof address === "object" && "addresses" in address) {
      return { targets: [...address.addresses], bindScope: undefined };
    }
    if (bindName) {
      // A published address (the picked layer): durable through the
      // selected object that hosts it, when one does.
      return {
        targets: bound,
        bindScope: (a: string): BindScope | null => {
          const m = /^(plugin:[^/]+\/[^/]+)\//.exec(a);
          return m && selectionHosts.length ? { kind: m[1], hostCandidates: selectionHosts } : null;
        },
      };
    }
    if (isSelector) {
      const selector = address as string;
      return {
        targets: queried.list,
        bindScope: () => ({ selector, ...(kind ? { kind } : {}) }),
      };
    }
    // Selection scoped to a plugin kind.
    return {
      targets: queried.list,
      bindScope: (a: string): BindScope | null => {
        const i = queried.hostOf.get(a);
        const host = i === undefined ? undefined : hosts[i];
        return host ? { host, kind } : null;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressKey, kind, bindName, bound, isSelector, queried, hosts, selectionHosts]);
}

export interface ObjectPropertyFieldProps {
  address: PropertyFieldAddress;
  path: string;
  kind?: string;
  label?: string;
  style?: "select" | "segments" | "collection";
  options?: readonly { value: string; label?: string; icon?: string }[];
  bindable?: boolean;
  disabled?: boolean;
  /** §12.8 — a struct path's fields / a list path's item presentation
   *  (`widgets.propertyField.values@1`). */
  fields?: readonly (string | SubFieldPresentation)[];
  items?: ListPresentation;
  props?: Record<string, unknown>;
  /** The bundle's published bindings (schema rows naming `{ bind }`). */
  bindings?: BindingsSurface;
}

/** One plugin (or core) object property, rendered by the shared
 *  `PropertyField`. This is the host's `widgets.PropertyField`. */
export function ObjectPropertyField(p: ObjectPropertyFieldProps) {
  const { targets, bindScope } = useFieldTargets(p.address, p.kind, p.bindings);
  const field = (
    <PropertyField
      path={p.path}
      label={p.label}
      autoLabel
      targets={targets}
      schemaKind={p.kind}
      options={p.options}
      style={p.style}
      bindable={p.bindable}
      bindScope={bindScope}
      fields={p.fields}
      items={p.items}
      chrome={p.props}
    />
  );
  return (
    <div
      data-plugin-property-field={p.path}
      data-property-kind={p.kind}
      data-property-targets={targets === undefined ? "selection" : String(targets.length)}
    >
      {p.disabled ? (
        <div data-schema-disabled="true" style={{ opacity: 0.5, pointerEvents: "none" }}>
          {field}
        </div>
      ) : (
        field
      )}
    </div>
  );
}

/** The schema row form (`{ field: "property" }`). */
export function SchemaPropertyRow({
  row,
  bindings,
  disabled,
}: {
  row: PanelSchemaPropertyRow;
  bindings: BindingsSurface;
  disabled?: boolean;
}) {
  return (
    <ObjectPropertyField
      address={row.address}
      path={row.path}
      kind={row.kind}
      label={row.label}
      style={row.style}
      options={row.options}
      bindable={row.bindable}
      fields={row.fields}
      items={row.items}
      props={row.props}
      bindings={bindings}
      disabled={disabled}
    />
  );
}

export interface ObjectPropertyFrameProps {
  address: PropertyFieldAddress;
  path: string;
  kind?: string;
  bindable?: boolean;
  children: ReactNode;
}

/** The field chrome without a widget, around a control the plugin keeps
 *  (the host's `widgets.PropertyFrame`): verdict hooks, "Bind to data…",
 *  badges. The control writes through its own door. */
export function ObjectPropertyFrame(p: ObjectPropertyFrameProps) {
  const { targets, bindScope } = useFieldTargets(p.address, p.kind);
  const field = useObjectField({ path: p.path, targets, schemaKind: p.kind });
  return (
    <ObjectFieldFrame field={field} bindable={p.bindable} bindScope={bindScope}>
      {p.children}
    </ObjectFieldFrame>
  );
}
