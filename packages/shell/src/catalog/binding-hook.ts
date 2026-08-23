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

// SDK Phase 3 — binding resolver hook.
//
// Given a `Binding`, returns the current resolved value and an
// `onCommit` callback that writes through the apply layer. The
// hook subscribes to selection changes + `mutationApplied` so the
// rendered leaf stays live.
//
// ADR 023 phase C/D — AND THIS IS WHERE THE VALUE AXIS RETARGETS.
//
// The Layers slice put the collection retarget in the PLATFORM rather
// than in the panel, so every schema list inherited it from one change.
// The same applies here, one layer down and with more reach: every
// `selectionProperty` binding in the app resolves through this hook, so
// routing it through the binding-provider seam retargets Character,
// Paragraph and every other composition panel WITHOUT ONE LINE CHANGING
// IN ANY OF THEM. The declaration is unchanged (`path:
// "characterFontSize"`, `scope: "content"`); only WHO ANSWERS moves.
//
// Three rules this file must hold, all from phase A:
//
//   1. FALL-THROUGH ON A REFUSAL. `{source:"core"}` means nobody
//      claimed, and the core lane below answers exactly as it always
//      has. It runs UNCONDITIONALLY so it is warm the instant a context
//      exits.
//   2. `absent` MUST NOT FALL THROUGH. A provider that owns the
//      selection and has no such property is ANSWERING. The two
//      selections are independent — entering a plugin's edit context
//      does not clear the text caret — so falling through here shows a
//      spreadsheet cell the leading of whatever text was last touched.
//      That is the expensive conflation this axis exists to prevent.
//   3. MIXED IS NOT ABSENT AND NEITHER IS "NO SELECTION". See
//      `ResolvedBinding.state`.
//
// NO IDENTITY BRANCHING, here or in any panel downstream: nothing in
// this file asks WHICH plugin answered. `provider` is carried for the
// DOM hook and tests only.

import { useEffect, useMemo, useState } from "react";
import type {
  Binding,
  SelectionPropertyBinding,
} from "@paged-media/catalog";
import type {
  CanvasClient,
  ElementId,
  ElementProperties,
  PropertyPath,
  Value,
} from "@paged-media/client";

import { useCanvasClient } from "../state/canvas-client-context";
import { useSelection } from "../state/selection-context";
import { useContentSelection } from "../state/content-selection-context";
import {
  resolveSelectionProperty,
  useBindingProviderHost,
  writeSelectionProperty,
  type SelectionResolution,
  type ShellBindingProviderHost,
} from "./binding-providers";
import { useReportBindingSurface } from "./panel-binding-surface";

/** Stable empty literal — this hook reports PATHS only; a composition leaf
 *  never binds a collection. */
const NO_COLLECTIONS: readonly never[] = [];

/**
 * What a binding resolved to, beyond its value. FOUR states, because
 * every pair of them is a different thing to show a user and collapsing
 * any two produces a lie:
 *
 *   · `value`  — a definite value.
 *   · `mixed`  — the target spans SEVERAL values (a multi-format
 *     character range, a multi-element selection). Show "mixed"; never
 *     pick a winner. Core signals this too — `PropertyEntry.value` is
 *     `Value | null` and its own wire comment says `None` means "a
 *     StoryRange whose CharacterRuns carry conflicting values".
 *   · `absent` — an ACTIVE PROVIDER owns the selection and this path
 *     does not apply to it. The control is read-only and BLANK, and
 *     core is not consulted (rule 2 above).
 *   · `none`   — nothing addressable is selected at all.
 *
 * `mixed` (the boolean) is kept for the Concept-2 colour wells that
 * already read it; `state` is the full verdict.
 */
export type BindingState = "value" | "mixed" | "absent" | "none";

/** Result of resolving a binding: `null` value = mixed /
 *  indeterminate / no selection. */
export interface ResolvedBinding {
  value: Value | null;
  onCommit?: (next: Value) => void;
  /** Concept 2 — disambiguates `value: null`: `true` means a
   *  heterogeneous MULTI-selection (the values disagree), as
   *  opposed to "uniformly null" (e.g. every fill is None) or "no
   *  selection". Colour wells render a split-diagonal mixed face on
   *  this; a commit still write-replaces across the selection. */
  mixed?: boolean;
  /** The full verdict — see {@link BindingState}. */
  state?: BindingState;
  /** ADR 023 — which plugin ANSWERED, or `null`/absent for core.
   *  Diagnostics + the DOM hook ONLY: no control flow anywhere may
   *  branch on it. */
  provider?: string | null;
}

/**
 * Hook returning resolved values + commit callbacks for the bindings
 * declared on a CompositionNode. Element-scope bindings read from
 * the visual element selection; content-scope bindings read from
 * the text content selection (constructed as
 * `ElementId::StoryRange` for the apply boundary). Both subscribe
 * to mutationApplied so the displayed values stay live (A1
 * invariant from docs/old/inspector.md §A1-A4).
 *
 * The returned map is keyed by the binding name in the composition
 * node — usually `"value"` for the leaf's primary binding, but a
 * leaf can declare multiple bindings (e.g. a BoundsInput with one
 * per cell).
 */
export function useBindings(
  bindings: Record<string, Binding>,
): Record<string, ResolvedBinding> {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const { contentSelection } = useContentSelection();
  const providerHost = useBindingProviderHost();

  // Compute the canonical address for each binding's scope. Cache
  // the JSON-stringified shape so the dependency arrays don't
  // re-trigger on every render.
  const addresses = useMemo(
    () => computeAddresses(bindings, elementSelection, contentSelection),
    [bindings, elementSelection, contentSelection],
  );

  const [snapshot, setSnapshot] = useState<Map<string, ElementProperties | null>>(
    new Map(),
  );

  // ADR 023 follow-up — report the PATHS this composition node binds, so
  // the shell can tell whether entering an edit context would displace a
  // panel that context serves. Every Character / Paragraph / Properties
  // leaf goes through here, so the whole VALUE axis is covered by one
  // call and no panel declares anything (panel-binding-surface.tsx).
  useReportBindingSurface(
    NO_COLLECTIONS,
    selectionPaths(bindings).map(([, path]) => path),
  );

  // Fetch the snapshot for every distinct ElementId referenced by
  // the bindings. Re-fetch on `mutationApplied` / `undoApplied` /
  // `redoApplied` so values stay live.
  useEffect(() => {
    const distinct = dedupeAddresses(addresses);
    if (distinct.length === 0) {
      setSnapshot(new Map());
      return;
    }
    let cancelled = false;
    const refetch = () => {
      Promise.all(
        distinct.map(async (id) => {
          try {
            return [JSON.stringify(id), await client.elementProperties(id)] as const;
          } catch {
            return [JSON.stringify(id), null] as const;
          }
        }),
      ).then((pairs) => {
        if (cancelled) return;
        setSnapshot(new Map(pairs));
      });
    };
    refetch();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied"
      ) {
        refetch();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client, addressesJson(addresses)]); // eslint-disable-line react-hooks/exhaustive-deps

  // ADR 023 — the PROVIDER lane, resolved beside the core one.
  //
  // It is deliberately INDEPENDENT of `addresses`: a provider answers
  // `{kind:"selection"}` in ITS OWN realm — it already knows which cell
  // / raster layer / DOCX run is selected — so it must be consulted even
  // when core can address nothing at all. That case is not exotic; it is
  // the normal one inside a plugin's modal edit session, where there is
  // no core text caret and these panels are dead today.
  const [claims, setClaims] = useState<Map<string, SelectionResolution>>(
    new Map(),
  );
  const providerPathsKey = JSON.stringify(selectionPaths(bindings));
  const [providerTick, setProviderTick] = useState(0);
  useEffect(() => {
    if (!providerHost) return;
    const d = providerHost.onDidChange(() => setProviderTick((n) => n + 1));
    return () => d.dispose();
  }, [providerHost]);
  useEffect(() => {
    const wanted = JSON.parse(providerPathsKey) as Array<
      [string, PropertyPath, "element" | "content"]
    >;
    if (!providerHost || wanted.length === 0) {
      setClaims((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    let cancelled = false;
    void Promise.all(
      wanted.map(
        async ([name, path, scope]) =>
          [
            name,
            await resolveSelectionProperty(providerHost, path, scope),
          ] as const,
      ),
    ).then((pairs) => {
      if (cancelled) return;
      const claimed = pairs.filter(([, r]) => r.source === "provider");
      // Keep the SAME empty map when nobody claims. That is the common
      // case — no plugin context active — and it runs on every applied
      // mutation for every mounted panel, so minting a fresh Map here
      // would cost a wasted re-render of the whole composition each time.
      setClaims((prev) =>
        claimed.length === 0 && prev.size === 0 ? prev : new Map(claimed),
      );
    });
    return () => {
      cancelled = true;
    };
    // `snapshot` is in the deps for the reason `useProvidedCollection`
    // keeps `core` in its own: a provider whose values derive from
    // engine state has no other signal on a plain mutation, and
    // `invalidate()` (→ `providerTick`) covers only the changes the
    // engine never sees. `elementSelection`/`contentSelection` likewise
    // — a provider may narrow ITS selection from the host's.
  }, [
    providerHost,
    providerPathsKey,
    providerTick,
    snapshot,
    elementSelection,
    contentSelection,
  ]);

  return useMemo(
    () => buildResolved(bindings, addresses, snapshot, client, claims, providerHost),
    [bindings, addresses, snapshot, client, claims, providerHost],
  );
}

// ----------------------------------------------------------------
// internals
// ----------------------------------------------------------------

/** The address each binding reads from / writes to. Element-scope
 *  bindings resolve to the selected ElementIds (array — multi-select
 *  supported; the binding hook fetches all of them and collapses to
 *  Some(uniform) or null (mixed) per the §5.6 "mixed" sentinel).
 *  Content-scope to a `StoryRange` derived from the content
 *  selection. Literal bindings have no address. */
type Address =
  | { kind: "element"; ids: ElementId[] }
  | { kind: "content"; id: ElementId }
  | { kind: "literal"; value: unknown }
  | null;

function computeAddresses(
  bindings: Record<string, Binding>,
  elementSelection: ElementId[],
  contentSelection: { storyId: string; start: number; end: number } | null,
): Record<string, Address> {
  const out: Record<string, Address> = {};
  for (const [name, binding] of Object.entries(bindings)) {
    if (binding.kind === "literal") {
      out[name] = { kind: "literal", value: binding.value };
      continue;
    }
    // selectionProperty
    const scope = binding.scope ?? "element";
    if (scope === "element") {
      if (elementSelection.length === 0) {
        out[name] = null;
        continue;
      }
      // Multi-element selection: keep the full array; the resolver
      // fetches snapshots for each and collapses values per binding
      // path. Single-element is just the degenerate case.
      out[name] = { kind: "element", ids: elementSelection };
    } else {
      // content
      if (!contentSelection) {
        out[name] = null;
        continue;
      }
      out[name] = {
        kind: "content",
        id: {
          kind: "storyRange",
          id: {
            story_id: contentSelection.storyId,
            start: contentSelection.start,
            end: contentSelection.end,
          },
        } as ElementId,
      };
    }
  }
  return out;
}

function dedupeAddresses(addresses: Record<string, Address>): ElementId[] {
  const seen = new Map<string, ElementId>();
  for (const addr of Object.values(addresses)) {
    if (!addr || addr.kind === "literal") continue;
    if (addr.kind === "element") {
      for (const id of addr.ids) {
        seen.set(JSON.stringify(id), id);
      }
    } else {
      seen.set(JSON.stringify(addr.id), addr.id);
    }
  }
  return Array.from(seen.values());
}

function addressesJson(addresses: Record<string, Address>): string {
  return JSON.stringify(addresses);
}

/** ADR 023 — the `(name, path, scope)` triples the provider lane asks
 *  about: every `selectionProperty` binding, literals excluded (they
 *  address nothing, so consulting a provider about one would be work
 *  nobody can see). Stringified by the caller as an effect key. */
function selectionPaths(
  bindings: Record<string, Binding>,
): Array<[string, PropertyPath, "element" | "content"]> {
  const out: Array<[string, PropertyPath, "element" | "content"]> = [];
  for (const [name, binding] of Object.entries(bindings)) {
    if (binding.kind === "literal") continue;
    const sb = binding as SelectionPropertyBinding;
    out.push([name, sb.path as PropertyPath, sb.scope ?? "element"]);
  }
  return out;
}

function buildResolved(
  bindings: Record<string, Binding>,
  addresses: Record<string, Address>,
  snapshot: Map<string, ElementProperties | null>,
  client: CanvasClient,
  claims: Map<string, SelectionResolution>,
  providerHost: ShellBindingProviderHost | null,
): Record<string, ResolvedBinding> {
  const out: Record<string, ResolvedBinding> = {};
  for (const [name, binding] of Object.entries(bindings)) {
    const addr = addresses[name];
    // ADR 023 — a CLAIM wins over everything below, including the
    // "nothing addressable" short-circuit: the provider addressed the
    // selection in its own realm, which is the whole point of the
    // `{kind:"selection"}` target.
    const claim = claims.get(name);
    if (claim && claim.source === "provider" && binding.kind !== "literal") {
      const sb = binding as SelectionPropertyBinding;
      out[name] = providerBinding(
        claim,
        sb.path as PropertyPath,
        sb.scope ?? "element",
        providerHost,
      );
      continue;
    }
    if (!addr) {
      out[name] = { value: null, state: "none", provider: null };
      continue;
    }
    if (addr.kind === "literal") {
      out[name] = { value: addr.value as Value };
      continue;
    }
    const sb = binding as SelectionPropertyBinding;
    if (addr.kind === "element") {
      // Multi-element resolution + the "mixed" sentinel
      // (panel-catalog-and-sdk-extension.md §5.6): fetch each id's
      // snapshot, collect the values for this binding's path,
      // collapse via uniformity. Any disagreement → null (the
      // catalog leaves render this as em-dash). Empty → null.
      const values: Array<Value | null> = addr.ids.map((id) => {
        const props = snapshot.get(JSON.stringify(id));
        return props?.entries.find((e) => e.path === sb.path)?.value ?? null;
      });
      const collapsed = collapseValues(values);
      // Write fan-out: commit to every selected id. The apply
      // layer treats the writes as a Batch implicitly (each id
      // gets its own SetProperty); a future polish can wrap them
      // in an explicit Operation::Batch for one undo entry.
      const mixed = valuesAreMixed(values);
      out[name] = {
        value: collapsed,
        onCommit: makeOnCommitMany(client, addr.ids, sb.path),
        mixed,
        state: mixed ? "mixed" : collapsed === null ? "none" : "value",
        provider: null,
      };
    } else {
      // Content scope — a single StoryRange address, and the one place
      // core's own MIXED signal lives.
      //
      // The distinction is on the wire and was being thrown away here.
      // `story_range_properties` builds a FIXED entry list and fills
      // each value with `collapse_uniform(...)`, so for a range:
      //   · an ENTRY with a null value  = the runs DISAGREE (mixed) —
      //     core's wire comment says exactly this;
      //   · NO ENTRY at all             = the range is empty / models
      //     nothing (an empty StoryRange returns `entries: []`).
      // `entry?.value ?? null` collapsed both to the same em-dash. They
      // are different facts and this axis is where it shows.
      const props = snapshot.get(JSON.stringify(addr.id));
      const entry = props?.entries.find((e) => e.path === sb.path);
      const mixed = entry != null && entry.value == null;
      out[name] = {
        value: entry?.value ?? null,
        onCommit: makeOnCommit(client, addr.id, sb.path),
        mixed,
        state: mixed ? "mixed" : entry == null ? "none" : "value",
        provider: null,
      };
    }
  }
  return out;
}

/**
 * ADR 023 — turn one provider CLAIM into a resolved binding.
 *
 * The two rules that make this more than a mapping:
 *
 *   · `absent` yields NO value and NO commit, and core is never
 *     consulted. A control that cannot work here renders read-only and
 *     blank, rather than showing the value of something the user is not
 *     looking at.
 *   · a claimed path whose provider does not declare it WRITABLE gets no
 *     `onCommit` either. Not because writing is hard, but because the
 *     alternative — offering the control and letting the write fall
 *     through on refusal — lands the commit on core's selection. Same
 *     lie, write side.
 */
function providerBinding(
  claim: Extract<SelectionResolution, { source: "provider" }>,
  path: PropertyPath,
  scope: "element" | "content",
  host: ShellBindingProviderHost | null,
): ResolvedBinding {
  const base = { provider: claim.provider } as const;
  if (claim.read.kind === "absent") {
    return { ...base, value: null, state: "absent" };
  }
  const commit =
    claim.writable && host
      ? (next: Value) => {
          void writeSelectionProperty(host, path, scope, next);
        }
      : undefined;
  if (claim.read.kind === "mixed") {
    return { ...base, value: null, mixed: true, state: "mixed", onCommit: commit };
  }
  return { ...base, value: claim.read.value, state: "value", onCommit: commit };
}

/** Collapse a list of `Value | null` to a single representative or
 *  null (= "mixed"). All-null = null. All equal = that value. */
function collapseValues(values: Array<Value | null>): Value | null {
  if (values.length === 0) return null;
  const first = values[0];
  if (first === null) {
    // Mixed if any non-null exists; otherwise consistently null.
    return values.every((v) => v === null) ? null : null;
  }
  for (const v of values.slice(1)) {
    if (v === null) return null;
    if (!sameValue(first, v)) return null;
  }
  return first;
}

/** Concept 2 — true when the per-element values DISAGREE (≥2
 *  distinct), as opposed to agreeing on null/a value. */
function valuesAreMixed(values: Array<Value | null>): boolean {
  if (values.length < 2) return false;
  const first = values[0];
  return values.slice(1).some((v) => {
    if (first === null || v === null) return first !== v;
    return !sameValue(first, v);
  });
}

function sameValue(a: Value, b: Value): boolean {
  if (a.type !== b.type) return false;
  // Comparing primitive payloads via JSON stringify is cheap +
  // covers Length / ColorRef / Bounds / Transform / Bool / Text;
  // the wire shape is structurally simple.
  return JSON.stringify(a.value) === JSON.stringify(b.value);
}

function makeOnCommit(
  client: CanvasClient,
  id: ElementId,
  path: string,
): (next: Value) => void {
  return (next) => {
    void client.mutate({
      op: "setElementProperty",
      args: { elementId: id, path: path as never, value: next },
    });
  };
}

/** Multi-target write — fan one Value out to every selected id.
 *  Each id receives its own SetProperty mutation. Future polish:
 *  wrap in an Operation::Batch so a single undo restores the
 *  whole multi-write. For now the user undoes once per id. */
function makeOnCommitMany(
  client: CanvasClient,
  ids: ElementId[],
  path: string,
): (next: Value) => void {
  return (next) => {
    for (const id of ids) {
      void client.mutate({
        op: "setElementProperty",
        args: { elementId: id, path: path as never, value: next },
      });
    }
  };
}
