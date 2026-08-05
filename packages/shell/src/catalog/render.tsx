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

// SDK Phase 3 — composition renderer.
//
// Walks a `CompositionNode` tree, looks up each catalog reference,
// resolves its bindings against the current selection state, and
// renders the corresponding leaf or descends into a composition
// sub-tree. The renderer is the single React entry point a
// declarative-panel registration uses — see
// docs/paged/sdk-implementation-plan.md §3a.

import { createContext, useContext, type ReactElement } from "react";
import type {
  CatalogRegistry,
  CompositionNode,
  LeafProps,
} from "@paged-media/catalog";

import { useBindings, type ResolvedBinding } from "./binding-hook";

/** Provides the catalog registry to nested CompositionRenderer
 *  instances. Apps register their primitives once on mount and
 *  pass the registry through this provider. */
const CatalogRegistryContext = createContext<CatalogRegistry | null>(null);

export function CatalogRegistryProvider(props: {
  registry: CatalogRegistry;
  children: React.ReactNode;
}) {
  return (
    <CatalogRegistryContext.Provider value={props.registry}>
      {props.children}
    </CatalogRegistryContext.Provider>
  );
}

function useCatalogRegistry(): CatalogRegistry {
  const r = useContext(CatalogRegistryContext);
  if (!r) {
    throw new Error(
      "CompositionRenderer rendered outside CatalogRegistryProvider",
    );
  }
  return r;
}

/** Top-level entry. Renders one composition tree; subscribes via
 *  the binding hook to selection + mutationApplied so the leaves
 *  stay live. */
export function CompositionRenderer({
  composition,
}: {
  composition: CompositionNode;
}): ReactElement {
  return <Node node={composition} />;
}

function Node({ node }: { node: CompositionNode }): ReactElement {
  const registry = useCatalogRegistry();
  const entry = registry.get(node.catalogId);
  const resolved = useBindings(node.bindings);

  if (!entry) {
    return (
      <span
        className="text-xs text-destructive"
        data-catalog-unknown={node.catalogId}
      >
        unknown catalog entry: {node.catalogId}
      </span>
    );
  }

  if (entry.kind === "leaf" && entry.leaf) {
    const Leaf = entry.leaf;
    // Primary binding is `"value"` by convention; leaves with
    // multi-binding shapes (BoundsInput, etc.) read additional
    // bindings from `props` if their schema declares them. The
    // renderer doesn't enforce a fixed name; it just forwards
    // every resolved binding plus the static props.
    const value = resolved.value?.value ?? null;
    const onCommit = resolved.value?.onCommit;
    // Layout leaves (section, row, etc.) receive their composition
    // children pre-rendered as a React node under `props.children`
    // so they can wrap them in chrome (fieldset, flex row, etc.)
    // without re-implementing the catalog walk.
    const childElements =
      node.children && node.children.length > 0
        ? node.children.map((child, idx) => (
            <Node key={`${child.catalogId}-${idx}`} node={child} />
          ))
        : undefined;
    // ADR 023 — an ABSENT claim renders as an HONEST SEAM, and that is a
    // reuse rather than a new presentation vocabulary. `seam: true`
    // already means, in every leaf: disabled, NEUTRAL (no active
    // segment, pills off), placeholder text instead of state, and —
    // load-bearing here — `data-mixed` SUPPRESSED. That is exactly the
    // right rendering for "an active provider owns this selection and
    // has no such property": it cannot work, and it is not mixed.
    // Reusing the flag means every existing leaf handles the new state
    // with no change, and the leaves stay ignorant of the seam entirely.
    const absent = resolved.value?.state === "absent";
    const leafProps: LeafProps = {
      value,
      onCommit,
      props: {
        ...node.props,
        ...(absent ? { seam: true } : {}),
        ...(childElements ? { children: <>{childElements}</> } : {}),
        // Layout leaves that wrap EACH child (the cluster's
        // sub-labelled cells) need the array, not the opaque
        // fragment — forward it alongside.
        ...(childElements ? { childNodes: childElements } : {}),
        // Forward all non-primary resolved bindings under the same
        // name so leaves can read them by name (e.g.
        // `props.fillColor` for a multi-bind leaf).
        ...resolvedExtras(resolved),
      },
    };
    // Address composition-rendered controls by their binding PATH (e.g.
    // `characterFontSize`, `frameStrokeWeight`) — composition leaves
    // carry only an icon, no aria-label, so tests + a11y need a stable
    // hook. Only VALUE-bearing input leaves get it (layout leaves —
    // section/cluster/row — have no `value` binding); the `contents`
    // span is layout-neutral.
    const valueBinding = node.bindings?.value as
      | { path?: string }
      | undefined;
    const controlPath =
      valueBinding && typeof valueBinding.path === "string"
        ? valueBinding.path
        : undefined;
    const leaf = <Leaf {...leafProps} />;
    // ADR 023 — the platform-level truth about this control, on the
    // wrapper the renderer already stamps. Two facts the leaf cannot
    // carry because it never learns them:
    //
    //   · `data-binding-source` — CORE or the plugin id that answered.
    //     Provenance, exactly like the Layers list's
    //     `data-list-provider`. A DOM hook and a diagnostic; the only
    //     thing that reads it is a test.
    //   · `data-binding-state`  — value | mixed | absent | none. The
    //     leaves' own `data-mixed` means "no definite value to show",
    //     which is three of those four; this says which.
    //
    // Stamped for CORE-answered controls too, on purpose: a signal that
    // appears only when a plugin is active would make "core answered"
    // indistinguishable from "the seam is not wired".
    const bound = resolved.value;
    return controlPath ? (
      <span
        data-control={controlPath}
        data-binding-source={bound ? (bound.provider ?? "core") : undefined}
        data-binding-state={bound?.state}
        className="contents"
      >
        {leaf}
      </span>
    ) : (
      leaf
    );
  }

  // Composition. Render the children — either inline children on
  // this node OR the inlined composition of the catalog entry
  // itself (rare; only used when a composition catalog entry is
  // pre-built and registered without inlining via JSON).
  const children = node.children ?? entry.composition?.children ?? [];
  return (
    <div className="flex flex-col gap-2" data-catalog-id={node.catalogId}>
      {children.map((child, idx) => (
        <Node key={`${child.catalogId}-${idx}`} node={child} />
      ))}
    </div>
  );
}

function resolvedExtras(
  resolved: Record<string, ResolvedBinding>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, r] of Object.entries(resolved)) {
    if (name === "value") continue;
    out[name] = r.value;
  }
  return out;
}
