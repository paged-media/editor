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

// ADR 323 — the host side of `host.objects` in the panel tree.
//
// The app builds ONE shared object registry (the same instance it injects
// into every bundle host as `objects`) and publishes it here through
// `<PagedShell objectModel>`. `useObjectProperty` is what a schema-driven
// field (`PropertyField`) reads and writes through:
//
//   · its TARGETS are the selection's addresses (ADR 131), or an explicit
//     address list (a plugin object, the document);
//   · its TYPE is the target kind's schema row (ADR 132) — the field never
//     guesses a type from a path name;
//   · a commit is ONE `batch` over every target = one undo step;
//   · ADR 023's binding-provider lane still wins while a plugin's edit
//     context claims the path (that lane speaks wire values; the app
//     supplies the wire variant per path), so migrating a panel onto
//     PropertyField keeps every retarget the composition renderer had.
//
// Absent (`null`) is first-class: the field renders disabled, exactly
// like a leaf with no write path.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import type { ElementId, Value } from "@paged-media/client";

import { useCanvasClient } from "../state/canvas-client-context";
import { useSelection } from "../state/selection-context";
import { useContentSelection } from "../state/content-selection-context";
import {
  resolveSelectionProperty,
  useBindingProviderHost,
  writeSelectionProperty,
  type SelectionResolution,
} from "./binding-providers";
import type {
  ShellObjectModelHost,
  ShellObjectWriteResult,
  ShellPropertySchema,
} from "./object-model-types";
import {
  boundProbeSelector,
  reduceValues,
  setOps,
  type FieldState,
} from "./property-field-model";

const Context = createContext<ShellObjectModelHost | null>(null);

export function ObjectModelProvider({
  host,
  children,
}: PropsWithChildren<{ host: ShellObjectModelHost | null }>) {
  return <Context.Provider value={host}>{children}</Context.Provider>;
}

/** The shared object model, or `null` when the app wired none. */
export function useObjectModel(): ShellObjectModelHost | null {
  return useContext(Context);
}

export interface ObjectPropertyRequest {
  path: string;
  /** `element` (default): the selected page items; `content`: the text
   *  selection as a story range. Ignored when `targets` is given. */
  scope?: "element" | "content";
  /** Explicit addresses (a plugin object, `doc`, a page). */
  targets?: readonly string[];
  /** Which kind's schema to read when nothing is targeted, so the field
   *  still knows its type (`frame` / `story` by scope otherwise). */
  schemaKind?: string;
}

export interface ObjectProperty {
  row: ShellPropertySchema | null;
  state: FieldState;
  /** The addresses a commit writes. */
  addresses: readonly string[];
  /** Address → the selection element it came from (for label reads). */
  elementOf(address: string): ElementId | null;
  /** `null` = nothing to write to (no target, read-only, refused). */
  commit: ((value: unknown) => Promise<ShellObjectWriteResult>) | null;
  /** The last refused commit, cleared by the next successful one. */
  error: string | null;
  /** A paged.data binding targets this path on (one of) the targets. */
  bound: boolean;
  /** ADR 023 — the plugin whose edit context answered, else null. */
  provider: string | null;
  inferred: boolean;
}

const NONE: FieldState = { state: "none" };

function storyRangeId(c: { storyId: string; start: number; end: number }): ElementId {
  return {
    kind: "storyRange",
    id: { story_id: c.storyId, start: c.start, end: c.end },
  } as ElementId;
}

export function useObjectProperty(req: ObjectPropertyRequest): ObjectProperty {
  const model = useObjectModel();
  const providerHost = useBindingProviderHost();
  const { elementSelection } = useSelection();
  const { contentSelection } = useContentSelection();
  const scope = req.scope ?? "element";

  // ------------------------------------------------------- targets
  const targetIds = useMemo((): ElementId[] => {
    if (req.targets) return [];
    if (scope === "content") return contentSelection ? [storyRangeId(contentSelection)] : [];
    return elementSelection;
  }, [req.targets, scope, contentSelection, elementSelection]);
  const addresses = useMemo((): string[] => {
    if (req.targets) return [...req.targets];
    if (!model) return [];
    return targetIds.map((id) => model.addressOf(id));
  }, [req.targets, model, targetIds]);
  const addressesKey = JSON.stringify(addresses);
  const elementOf = useCallback(
    (address: string): ElementId | null => {
      const i = addresses.indexOf(address);
      return i >= 0 ? (targetIds[i] ?? null) : null;
    },
    [addresses, targetIds],
  );

  // ---------------------------------------------- change ticks
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!model) return;
    const d = model.objects.onDidChange(() => setTick((n) => n + 1));
    return () => d.dispose();
  }, [model]);
  const [providerTick, setProviderTick] = useState(0);
  useEffect(() => {
    if (!providerHost) return;
    const d = providerHost.onDidChange(() => setProviderTick((n) => n + 1));
    return () => d.dispose();
  }, [providerHost]);

  // --------------------------------------------------------- schema
  const schemaKey =
    addresses[0] ?? req.schemaKind ?? (scope === "content" ? "story" : "frame");
  const [row, setRow] = useState<ShellPropertySchema | null>(null);
  useEffect(() => {
    if (!model) {
      setRow(null);
      return;
    }
    let cancelled = false;
    void model.objects
      .schema(schemaKey)
      .then((rows) => {
        if (!cancelled) setRow(rows.find((r) => r.path === req.path) ?? null);
      })
      .catch(() => {
        if (!cancelled) setRow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [model, schemaKey, req.path]);

  // --------------------------------------------------------- values
  const [state, setState] = useState<FieldState>(NONE);
  useEffect(() => {
    const list = JSON.parse(addressesKey) as string[];
    if (!model || list.length === 0) {
      setState(NONE);
      return;
    }
    let cancelled = false;
    void Promise.all(list.map((a) => model.objects.get(a, req.path))).then(
      (values) => {
        if (!cancelled) setState(reduceValues(values));
      },
      (err: unknown) => {
        if (!cancelled) setState({ state: "refused", code: "failed", reason: String(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [model, addressesKey, req.path, tick]);

  // ------------------------------------- ADR 023 provider claim
  const wire = model?.wireOf?.(req.path) ?? null;
  const [claim, setClaim] = useState<SelectionResolution>({ source: "core" });
  useEffect(() => {
    if (!providerHost || !wire || req.targets) {
      setClaim((prev) => (prev.source === "core" ? prev : { source: "core" }));
      return;
    }
    let cancelled = false;
    void resolveSelectionProperty(providerHost, req.path as never, scope).then((r) => {
      if (!cancelled) setClaim(r);
    });
    return () => {
      cancelled = true;
    };
  }, [providerHost, wire, req.targets, req.path, scope, providerTick, tick, addressesKey]);

  // ---------------------------------------------------------- bound
  const [bound, setBound] = useState(false);
  useEffect(() => {
    const list = JSON.parse(addressesKey) as string[];
    if (!model || list.length === 0) {
      setBound(false);
      return;
    }
    let cancelled = false;
    void Promise.all(
      list.map((a) =>
        model.objects.query(boundProbeSelector(a, req.path)).catch(() => [] as string[]),
      ),
    ).then((hits) => {
      if (!cancelled) setBound(hits.some((h) => h.length > 0));
    });
    return () => {
      cancelled = true;
    };
  }, [model, addressesKey, req.path, tick]);

  // --------------------------------------------------------- commit
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [addressesKey, req.path]);

  const claimed = claim.source === "provider" ? claim : null;
  const readOnly = row?.access === "readOnly" || row?.access === "derived";

  const commit = useMemo(() => {
    if (claimed) {
      if (!claimed.writable || !providerHost || !wire) return null;
      return async (value: unknown): Promise<ShellObjectWriteResult> => {
        const handled = await writeSelectionProperty(
          providerHost,
          req.path as never,
          scope,
          { type: wire, value } as unknown as Value,
        );
        return handled
          ? { applied: true, undoSteps: 1 }
          : { applied: false, undoSteps: 0, code: "failed", reason: "the edit context did not take the write" };
      };
    }
    if (!model || addresses.length === 0 || readOnly) return null;
    return async (value: unknown): Promise<ShellObjectWriteResult> => {
      const ops = setOps(addresses, req.path, value);
      const r =
        ops.length === 1
          ? await model.objects.set(addresses[0], req.path, value, { label: req.path })
          : await model.objects.batch(ops, { label: req.path });
      setError(r.applied ? null : `${r.code ?? "failed"}: ${r.reason ?? "refused"}`);
      return r;
    };
  }, [claimed, providerHost, wire, model, addresses, readOnly, req.path, scope]);

  const shown: FieldState = claimed
    ? claimed.read.kind === "value"
      ? { state: "value", value: (claimed.read.value as { value?: unknown }).value ?? null }
      : claimed.read.kind === "mixed"
        ? { state: "mixed" }
        : { state: "absent" }
    : state;

  return {
    row,
    state: shown,
    addresses,
    elementOf,
    commit,
    error,
    bound,
    provider: claimed ? claimed.provider : null,
    inferred: !!(row && model?.isInferred?.(row)),
  };
}

/** Read the element's IDML name and existing `x-paged:oid` label — the
 *  inputs of the durable bind target. */
export function useElementLabels() {
  const client = useCanvasClient();
  return useCallback(
    async (id: ElementId | null) => {
      if (!id) return { name: null as string | null, oid: null as string | null };
      const props = await client.elementProperties(id).catch(() => null);
      const meta = props?.entries.find(
        (e) =>
          e.value?.type === "pluginMetadata" &&
          (e.value.value as { key?: string }).key === "x-paged:oid",
      );
      const raw = meta?.value as { value?: { value?: string | null } } | undefined;
      return {
        name: props?.name ?? null,
        oid: raw?.value?.value ?? null,
      };
    },
    [client],
  );
}
