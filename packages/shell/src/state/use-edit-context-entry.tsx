// W3.2 — the canvas double-click ENTRY resolver (closes plugin-draw
// B-02 / plugin-web W-03). The canvas double-click handler calls
// `tryEnterEditContext(hit)` BEFORE descending into a group: it resolves
// the hit element's KIND + this-plugin metadata (per registered
// namespace), runs `resolveDoubleClick` against the edit-context /
// object-type registries, and — on a claim — SELECTS the element and
// ENTERS the context (object-type → its source context, or edit-context
// by kind). Returns `true` when it claimed the double-click (the caller
// then skips group descent), `false` to fall through.
//
// Metadata is resolved PER PLUGIN NAMESPACE: each contribution carries a
// host-stamped `metadataKey` (`x-paged:<plugin id>`); the resolver reads
// the element's properties ONCE and hands each contribution ONLY its own
// envelope (a plugin never sees a foreign namespace).

import { useCallback } from "react";

// eslint-disable-next-line import/no-relative-parent-imports
import type { ElementId } from "@paged-media/client";

import { useCanvasClient } from "./canvas-client-context";
import { useSelection } from "./selection-context";
import { useEditContextStack } from "./edit-context-stack";
import { useRegistries } from "./registries-context";
import {
  resolveDoubleClick,
  type EditContextCandidate,
} from "../registries/edit-context";

/** The minimal hit shape the canvas double-click entry passes in — the
 *  `element` it hit plus its `groupChain` (both already on the engine's
 *  `HitResult`). */
export interface DoubleClickHit {
  element: ElementId | null;
  groupChain: readonly string[];
}

type MetaEnvelope = {
  v: number;
  data: Record<string, unknown>;
  engine?: Record<string, string>;
};

/** Parse the `x-paged:<key>` metadata envelope out of an element's
 *  property entries (the `pluginMetadata` typed value). Returns null
 *  when the key is absent or the stored JSON is unparseable. */
function readEnvelope(
  entries: ReadonlyArray<{ value?: unknown }>,
  key: string,
): MetaEnvelope | null {
  for (const entry of entries) {
    const v = entry.value as
      | { type?: string; value?: { key?: string; value?: unknown } }
      | undefined;
    if (
      v &&
      v.type === "pluginMetadata" &&
      v.value?.key === key &&
      typeof v.value.value === "string"
    ) {
      try {
        return JSON.parse(v.value.value) as MetaEnvelope;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function useEditContextEntry() {
  const client = useCanvasClient();
  const { setElementSelection, setElementGeometry } = useSelection();
  const { enter } = useEditContextStack();
  const { editContexts, objectTypes } = useRegistries();

  /**
   * Try to enter an edit context for a double-clicked element. Resolves
   * to `true` when a context was entered (caller skips group descent),
   * `false` otherwise.
   */
  const tryEnterEditContext = useCallback(
    async (hit: DoubleClickHit, objectTypesOnly = false): Promise<boolean> => {
      const element = hit.element;
      if (!element) return false;
      // Nothing registered → no work (the common case stays cheap).
      if (editContexts.list().length === 0 && objectTypes.list().length === 0) {
        return false;
      }
      // KIND comes from the ElementId itself (lowercase: "rectangle",
      // "polygon", …) — NOT from `ElementProperties.kind`, which is the
      // CAPITALIZED display label. The metadata `entries` come from the
      // properties read.
      const kind = (element as unknown as { kind?: string }).kind;
      let entries: ReadonlyArray<{ value?: unknown }> = [];
      try {
        const props = await client.elementProperties(element);
        if (props) {
          entries = props.entries as ReadonlyArray<{ value?: unknown }>;
        }
      } catch {
        // Property read failed — fall through to group descent.
        return false;
      }

      // Build a per-contribution candidate (its OWN metadata only) and
      // run the shared resolver. The resolver checks object types first
      // (metadata-claimed), then edit contexts by kind.
      const candidateFor = (metadataKey?: string): EditContextCandidate => ({
        id: element,
        kind,
        groupChain: hit.groupChain,
        metadata: metadataKey ? readEnvelope(entries, metadataKey) : null,
      });

      // resolveDoubleClick iterates the registries; it needs each
      // contribution's own-namespace candidate. Because the matcher reads
      // `candidate.metadata`, we pass a candidate whose metadata is
      // resolved from THAT contribution's stamped key. We wrap the
      // registries' lists so each `matches` sees its own envelope.
      const resolution = resolveDoubleClick(
        // A representative candidate (kind + groupChain are namespace-
        // independent); the per-namespace metadata is injected by the
        // wrapped registries below.
        candidateFor(undefined),
        {
          ...editContexts,
          // C-4 — owned-content interception restricts resolution to the
          // OBJECT-TYPE lane (metadata-claimed = plugin-owned content):
          // kind-claimed contexts (vectorGraphic by kind) must never
          // hijack a Type-tool click on ordinary content.
          list: () =>
            objectTypesOnly
              ? []
              : editContexts.list().map((ec) => ({
                  ...ec,
                  matches: ec.matches
                    ? () => ec.matches!(candidateFor(ec.metadataKey))
                    : undefined,
                })),
        },
        {
          ...objectTypes,
          list: () =>
            objectTypes.list().map((ot) => ({
              ...ot,
              matches: () => ot.matches(candidateFor(ot.metadataKey)),
            })),
        },
      );
      if (!resolution) return false;

      // Select the element (the context's write-scope root) and enter.
      try {
        const ids = await client.setElementSelection([element], "replace");
        setElementSelection(ids);
        const geom = await client.elementGeometry(ids);
        setElementGeometry(geom);
      } catch {
        // Selection failed — still enter (the context is the point).
      }
      // resolution.context is the REPRESENTATIVE-candidate copy; enter the
      // REAL registered contribution by type so its hooks/metadataKey are
      // the live ones.
      const real = editContexts.get(resolution.contextType);
      if (!real) return false;
      enter(real, element);
      return true;
    },
    [
      client,
      editContexts,
      objectTypes,
      enter,
      setElementSelection,
      setElementGeometry,
    ],
  );

  /** C-4 — enter the OWNING plugin's edit context for a metadata-claimed
   *  element (the objectType lane only). The Type-tool entry path calls
   *  this before starting raw text editing on a frame, so manual edits
   *  on plugin-owned content (a lowered sheet table) route into the
   *  plugin's modal session instead of corrupting what it compiles. */
  const tryEnterOwnedContent = useCallback(
    (hit: DoubleClickHit): Promise<boolean> => tryEnterEditContext(hit, true),
    [tryEnterEditContext],
  );

  return { tryEnterEditContext, tryEnterOwnedContent };
}
