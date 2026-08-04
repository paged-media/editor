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

// ADR 023 phase C — the HOST side of the binding-provider seam.
//
// Phase A (plugin-sdk `ee778c5`) landed the contract and the shared
// registry: while a plugin's edit context is ACTIVE, that plugin
// resolves what the HOST's own panels bind to. This module is the other
// end of that wire — the hooks a host panel uses to read/write THROUGH
// the registry, with fall-through to core when nobody claims.
//
// THREE rules this file exists to enforce, all of them from phase A:
//
//   1. FALL-THROUGH IS THE HOST'S JOB. The registry answers a claim or a
//      typed `resolved:false` / `handled:false` refusal and holds no
//      engine handle — deliberately, so the isolate implementation can
//      be an RPC proxy of exactly that shape. So the "read core
//      instead" branch lives HERE, once, rather than in every panel.
//   2. `absent` MUST NOT FALL THROUGH. A provider answering
//      `{kind:"absent"}` OWNS the target and says the path does not
//      apply to it. Reading core at that point shows a raster layer the
//      leading of a core text frame. `readProvidedProperty` therefore
//      returns a THREE-state verdict and never silently substitutes.
//   3. NO IDENTITY BRANCHING. Nothing in this module (or in any panel
//      built on it) may look at WHICH plugin answered in order to decide
//      what to do. `provider` is carried for diagnostics, for a
//      "provided by" affordance and for tests — never for control flow.
//      A host panel containing `if (pluginId === …)` is the anti-pattern
//      ADR 023's Consequences section names, and it would make the whole
//      inversion pointless.
//
// WHY A STRUCTURAL MIRROR AND NOT AN IMPORT: the same reason
// `schema-panel-types.ts` mirrors the schema contract. `@paged-media/shell`
// sits BELOW `apps/canvas` in the consumer chain and does not depend on
// `@paged-media/plugin-api`/`plugin-sdk` — only the app does. The app
// builds the ONE registry (`createBindingProviderRegistry()`), asserts it
// satisfies this mirror at the injection point, and hands it down through
// `BindingProviderProvider`. A contract change therefore fails the
// EDITOR's typecheck at the seam, which is the plugin-api-compat
// discipline applied to phase A.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import type {
  CollectionName,
  ElementId,
  Mutation,
  PropertyPath,
  Value,
} from "@paged-media/client";

import { useCanvasClient } from "../state/canvas-client-context";
import { useCollection } from "./use-collection";

// --------------------------------------------------------------- mirror
//
// Structural mirror of the HOST-FACING slice of plugin-sdk's
// `BindingProviderBackend`. The adapter-facing half (`register`,
// `setContextActive`, `notifyChanged`) is deliberately NOT mirrored: the
// editor must never call it. Activation is written by the SDK adapter
// from the shell's own `onEnter`/`onExit`, so there is exactly ONE notion
// of "who is active" — a second writer here would be the drift phase A
// borrowed the lifetime to prevent.

/** What a provider addresses. Mirrors `BindingTarget`. */
export type ShellBindingTarget =
  | { kind: "selection"; scope: "element" | "content" }
  | { kind: "element"; id: ElementId }
  | { kind: "row"; collection: CollectionName; id: string };

/** The answers that CLAIM the target. Mirrors `BindingResolved`. */
export type ShellBindingResolved =
  | { kind: "value"; value: Value }
  | { kind: "mixed" }
  | { kind: "absent"; reason?: string };

export type ShellBindingReadResult =
  | { resolved: true; provider: string; read: ShellBindingResolved }
  | { resolved: false; reason: string };

export type ShellBindingWriteResult =
  | { handled: true; provider: string; outcome: unknown }
  | { handled: false; reason: string };

export type ShellBindingCollectionResult =
  | { resolved: true; provider: string; rows: readonly unknown[] }
  | { resolved: false; reason: string };

/** What a provider declares it serves. Mirrors `BindingProviderScope`. */
export interface ShellBindingProviderScope {
  paths?: readonly PropertyPath[];
  collections?: readonly CollectionName[];
  ops?: readonly string[];
}

/** One entry of the ACTIVE provider stack, innermost FIRST (= precedence
 *  order). Mirrors `ActiveBindingProvider`. */
export interface ShellActiveBindingProvider {
  plugin: string;
  contextType: string;
  elementId: string | null;
  provides: ShellBindingProviderScope;
}

/** The host-facing slice of the shared registry. */
export interface ShellBindingProviderHost {
  activeProviders(): readonly ShellActiveBindingProvider[];
  readProperty(request: {
    path: PropertyPath;
    target: ShellBindingTarget;
  }): Promise<ShellBindingReadResult>;
  writeProperty(request: {
    path: PropertyPath;
    target: ShellBindingTarget;
    value: Value;
  }): Promise<ShellBindingWriteResult>;
  readCollection(request: {
    collection: CollectionName;
  }): Promise<ShellBindingCollectionResult>;
  applyMutation(mutation: Mutation): Promise<ShellBindingWriteResult>;
  onDidChange(listener: () => void): { dispose(): void };
}

// -------------------------------------------------------------- context

const Context = createContext<ShellBindingProviderHost | null>(null);

/**
 * Publish the app's ONE shared binding-provider registry to the panel
 * tree. Absent (or `null`) is a first-class state, not a degraded one:
 * every hook below then answers "core", which is exactly right for a
 * host that loads no bundles (the styleguide, a headless render).
 */
export function BindingProviderProvider({
  host,
  children,
}: PropsWithChildren<{ host: ShellBindingProviderHost | null }>) {
  return <Context.Provider value={host}>{children}</Context.Provider>;
}

/** The shared registry, or `null` when the host wired none. */
export function useBindingProviderHost(): ShellBindingProviderHost | null {
  return useContext(Context);
}

/** Re-render whenever the active provider stack changes or a provider
 *  calls `invalidate()`. Returns a monotonic tick so callers can use it
 *  as an effect dependency. */
function useProviderTick(host: ShellBindingProviderHost | null): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!host) return;
    const d = host.onDidChange(() => setTick((n) => n + 1));
    return () => d.dispose();
  }, [host]);
  return tick;
}

/**
 * The ACTIVE provider stack, innermost first. A host panel reads this to
 * decide what it may OFFER at all — §18.10's "phase C must actually READ
 * `activeProviders()` and disable rather than assume". Empty when no
 * registry is wired or no plugin edit context is active.
 */
export function useActiveBindingProviders(): readonly ShellActiveBindingProvider[] {
  const host = useBindingProviderHost();
  const tick = useProviderTick(host);
  const [active, setActive] = useState<readonly ShellActiveBindingProvider[]>(
    [],
  );
  useEffect(() => {
    setActive(host ? host.activeProviders() : []);
  }, [host, tick]);
  return active;
}

/**
 * Does any ACTIVE provider own `collection`, and if so does it declare
 * `path`? Answers the only question a host panel legitimately asks about
 * provider identity — a CAPABILITY question, phrased so the answer is a
 * boolean rather than a plugin id.
 *
 *   · no active owner  → `true` (core answers; core serves the path)
 *   · an owner that declares the path → `true`
 *   · an owner that does NOT → `false` (blank/disable the control; do
 *     NOT show core's value for a row core has never heard of)
 */
export function useCollectionPathOffered(
  collection: CollectionName,
  path: PropertyPath,
): boolean {
  const active = useActiveBindingProviders();
  const owner = active.find((p) => p.provides.collections?.includes(collection));
  if (!owner) return true;
  return owner.provides.paths?.includes(path) ?? false;
}

// ---------------------------------------------------------- collections

/** A collection read resolved through the seam. `provider` is `null`
 *  when CORE answered — carried for diagnostics and tests, never for
 *  control flow (see rule 3 in the module header). */
export interface ProvidedCollection<T> {
  rows: T[] | null;
  provider: string | null;
}

/**
 * The retargeting collection read: ask the active providers first, fall
 * through to the engine collection when nobody claims it.
 *
 * This is the whole of ADR 023 for a list-shaped panel. The panel keeps
 * binding to `"layers"`; WHO answers changes with the selection, and the
 * panel never learns which plugin that was.
 *
 * The core lane runs UNCONDITIONALLY (hooks may not be conditional, and
 * the fall-through must be warm the instant a context exits). Its
 * re-fetch is also the provider re-read trigger: a provider whose rows
 * derive from engine state has no other signal on a plain mutation, and
 * `invalidate()` covers only the changes the engine never sees.
 */
export function useProvidedCollection<T>(
  name: CollectionName | null,
): ProvidedCollection<T> {
  // `null` = this list is not collection-backed at all (the published-
  // binding lane). The hook still runs — hooks may not be conditional —
  // but NO provider is consulted, because asking one for rows the panel
  // will discard is how a seam starts doing work nobody can see.
  const core = useCollection<T>((name ?? "swatches") as CollectionName);
  const host = useBindingProviderHost();
  const tick = useProviderTick(host);
  const [claim, setClaim] = useState<{
    provider: string;
    rows: readonly unknown[];
  } | null>(null);

  useEffect(() => {
    if (!host || name === null) {
      setClaim(null);
      return;
    }
    let cancelled = false;
    void host
      .readCollection({ collection: name })
      .then((r) => {
        if (cancelled) return;
        setClaim(r.resolved ? { provider: r.provider, rows: r.rows } : null);
      })
      .catch(() => {
        // A throwing provider must not wedge the panel; core answers.
        if (!cancelled) setClaim(null);
      });
    return () => {
      cancelled = true;
    };
    // `core` is in the deps on purpose — see the doc comment.
  }, [host, name, tick, core]);

  if (claim) return { rows: claim.rows as T[], provider: claim.provider };
  return { rows: core, provider: null };
}

// ------------------------------------------------------------ property

/** A property read resolved through the seam. THREE states, because
 *  collapsing any two of them produces a user-visible lie (phase A
 *  §18.3):
 *
 *    · `claimed`  — a provider answered; `read` is value | mixed | absent
 *    · `core`     — nobody claimed; the caller reads the engine
 *
 *  There is deliberately no fourth "absent, so read core" state. */
export type ProvidedProperty =
  | { source: "provider"; provider: string; read: ShellBindingResolved }
  | { source: "core" };

/** Resolve one typed path at one target through the seam. Returns
 *  `{source:"core"}` when no active provider claims it — the caller then
 *  reads the engine. An `absent` answer comes back as a PROVIDER answer
 *  and must be rendered as a blank control, never re-read from core. */
export function useProviderProperty(
  path: PropertyPath,
  target: ShellBindingTarget | null,
): ProvidedProperty {
  const host = useBindingProviderHost();
  const tick = useProviderTick(host);
  const [state, setState] = useState<ProvidedProperty>({ source: "core" });
  const key = target ? JSON.stringify(target) : "";
  useEffect(() => {
    if (!host || key === "") {
      setState({ source: "core" });
      return;
    }
    let cancelled = false;
    void host
      .readProperty({ path, target: JSON.parse(key) as ShellBindingTarget })
      .then((r) => {
        if (cancelled) return;
        setState(
          r.resolved
            ? { source: "provider", provider: r.provider, read: r.read }
            : { source: "core" },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ source: "core" });
      });
    return () => {
      cancelled = true;
    };
  }, [host, path, key, tick]);
  return state;
}

// --------------------------------------------------------------- writes

/** What a provider-first write did. `provider` is `null` when the write
 *  went to core. */
export interface ProvidedWrite {
  applied: boolean;
  provider: string | null;
  error?: unknown;
}

/**
 * The write half of the seam: offer a mutation to the active providers,
 * and send it to the engine only if nobody claimed it.
 *
 * The mutation is CORE'S OWN VOCABULARY, unchanged — a Layers panel
 * sends `layerMove` / `layerSetVisible` whoever is listening. A provider
 * that owns the current rows intercepts and honours it in its own realm;
 * that translation is the PROVIDER's business, never the panel's. This
 * is "no branching on plugin identity" applied to writes.
 *
 * Note the two refusals are different and both are reported honestly:
 * `handled:false` means nobody claimed (→ core), while a claimed write
 * that failed comes back `applied:false` WITH the provider named. The
 * caller can tell "core rejected this" from "the owner said no".
 */
export function useProviderFirstMutate(): (
  mutation: Mutation,
) => Promise<ProvidedWrite> {
  const host = useBindingProviderHost();
  const client = useCanvasClient();
  return useCallback(
    async (mutation: Mutation): Promise<ProvidedWrite> => {
      if (host) {
        let offered: ShellBindingWriteResult;
        try {
          offered = await host.applyMutation(mutation);
        } catch (err) {
          // A throwing provider is a bug in the provider, not a reason
          // to silently write core behind its back — it OWNED the op.
          return { applied: false, provider: null, error: err };
        }
        if (offered.handled) {
          const outcome = offered.outcome as
            | { applied: boolean; error?: unknown }
            | undefined;
          return {
            applied: outcome?.applied === true,
            provider: offered.provider,
            error: outcome?.error,
          };
        }
      }
      // Nobody claimed it — core answers.
      //
      // `client.mutate` RESOLVES on a rejected mutation (the failure
      // arrives as a `mutationFailed` reply, it does not throw), so the
      // reply is INSPECTED. A bare `.catch` here would swallow exactly
      // the loud rejection an absolute-index reorder exists to give.
      try {
        const reply = await client.mutate(mutation);
        if (reply.kind === "mutationFailed") {
          return {
            applied: false,
            provider: null,
            error: reply.payload.error,
          };
        }
        return { applied: true, provider: null };
      } catch (err) {
        return { applied: false, provider: null, error: err };
      }
    },
    [host, client],
  );
}
