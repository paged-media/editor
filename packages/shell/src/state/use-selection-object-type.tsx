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

// Selection-time object-type classification. Until now a plugin's
// ObjectTypeContribution was consulted ONLY on double-click (the edit-
// context entry chain); merely SELECTING a plugin-owned object changed
// nothing. This hook runs the same per-namespace metadata claim against
// the CURRENT single selection so inspectors can show the owning
// bundle's surface (the properties panel's objectType branch).
//
// Same trust line as the entry hook: each contribution's `matches` sees
// ONLY its own `x-paged:<plugin id>` envelope.

import { useEffect, useRef, useState } from "react";

import { useCanvasClient } from "./canvas-client-context";
import { useSelection } from "./selection-context";
import { useRegistries } from "./registries-context";
import { readEnvelope } from "./use-edit-context-entry";
import type {
  EditContextContribution,
  ObjectTypeContribution,
} from "../registries/edit-context";

export interface SelectionObjectType {
  objectType: ObjectTypeContribution;
  /** The context a double-click would enter — its `panelIds` are the
   *  owning bundle's inspector surface. Null when the type declares no
   *  editContextType (or the context is not registered). */
  editContext: EditContextContribution | null;
}

export function useSelectionObjectType(): SelectionObjectType | null {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const { editContexts, objectTypes } = useRegistries();
  const [resolved, setResolved] = useState<SelectionObjectType | null>(null);
  // Monotonic request stamp — a stale properties read must never clobber
  // the classification of a newer selection.
  const requestRef = useRef(0);

  useEffect(() => {
    const req = ++requestRef.current;
    if (elementSelection.length !== 1 || objectTypes.list().length === 0) {
      setResolved(null);
      return;
    }
    const element = elementSelection[0];
    const kind = (element as unknown as { kind?: string }).kind;
    void (async () => {
      let entries: ReadonlyArray<{ value?: unknown }> = [];
      try {
        const props = await client.elementProperties(element);
        if (props) entries = props.entries as ReadonlyArray<{ value?: unknown }>;
      } catch {
        // Property read failed — unclassified, not an error state.
      }
      if (req !== requestRef.current) return;
      for (const ot of objectTypes.list()) {
        const candidate = {
          id: element,
          kind,
          groupChain: [] as readonly string[],
          metadata: ot.metadataKey ? readEnvelope(entries, ot.metadataKey) : null,
        };
        try {
          if (ot.matches(candidate)) {
            setResolved({
              objectType: ot,
              editContext: ot.editContextType
                ? (editContexts.get(ot.editContextType) ?? null)
                : null,
            });
            return;
          }
        } catch {
          // A throwing plugin matcher must not break the inspector.
        }
      }
      setResolved(null);
    })();
    // Registry churn after a selection (a bundle activating late) is not
    // re-observed — the next selection change re-classifies. v1 depth.
  }, [elementSelection, client, objectTypes, editContexts]);

  return resolved;
}

/**
 * The edit context a double-click on the current single selection would
 * ENTER — the full entry resolution (object types first, then contexts
 * claimed by kind or by their own metadata), not only the object-type
 * lane above. The menu bar uses it to bring a plugin's menu forward
 * while its content is selected (a path → Draw, a raster frame → Image),
 * before the user has entered anything.
 */
export function useSelectionEditContext(): EditContextContribution | null {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const { editContexts, objectTypes } = useRegistries();
  const [resolved, setResolved] = useState<EditContextContribution | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const req = ++requestRef.current;
    if (elementSelection.length !== 1 || editContexts.list().length === 0) {
      setResolved(null);
      return;
    }
    const element = elementSelection[0];
    const kind = (element as unknown as { kind?: string }).kind;
    void (async () => {
      let entries: ReadonlyArray<{ value?: unknown }> = [];
      try {
        const props = await client.elementProperties(element);
        if (props) entries = props.entries as ReadonlyArray<{ value?: unknown }>;
      } catch {
        // Unreadable — classify by kind alone.
      }
      if (req !== requestRef.current) return;
      const candidate = (metadataKey?: string) => ({
        id: element,
        kind,
        groupChain: [] as readonly string[],
        metadata: metadataKey ? readEnvelope(entries, metadataKey) : null,
      });
      const safe = (fn: () => boolean) => {
        try {
          return fn();
        } catch {
          return false; // A throwing plugin matcher claims nothing.
        }
      };
      for (const ot of objectTypes.list()) {
        if (!ot.editContextType) continue;
        if (!safe(() => ot.matches(candidate(ot.metadataKey)))) continue;
        const ctx = editContexts.get(ot.editContextType);
        if (ctx) return setResolved(ctx);
      }
      for (const ec of editContexts.list()) {
        if (ec.entry !== "doubleClick" || !ec.matches) continue;
        if (safe(() => ec.matches!(candidate(ec.metadataKey)))) return setResolved(ec);
      }
      setResolved(null);
    })();
  }, [elementSelection, client, objectTypes, editContexts]);

  return resolved;
}

/**
 * The edit context whose plugin OWNS the current single selection by
 * metadata — the element carries that context's `x-paged:<plugin>`
 * envelope (draw-made artwork: a repeat, a blend, a styled path). Unlike
 * `useSelectionEditContext` (which also answers a kind claim — any path is
 * "vectorGraphic"), this answers only for objects a plugin actually made
 * or annotated, so the Properties panel can show that plugin's surface for
 * them without showing it for every rectangle.
 */
export function useSelectionMetadataOwner(): EditContextContribution | null {
  const client = useCanvasClient();
  const { elementSelection } = useSelection();
  const { editContexts } = useRegistries();
  const [owner, setOwner] = useState<EditContextContribution | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const req = ++requestRef.current;
    const keyed = editContexts.list().filter((c) => c.metadataKey && c.panelIds?.length);
    if (elementSelection.length !== 1 || keyed.length === 0) {
      setOwner(null);
      return;
    }
    const element = elementSelection[0];
    void (async () => {
      let entries: ReadonlyArray<{ value?: unknown }> = [];
      try {
        const props = await client.elementProperties(element);
        if (props) entries = props.entries as ReadonlyArray<{ value?: unknown }>;
      } catch {
        // Unreadable — no owner.
      }
      if (req !== requestRef.current) return;
      setOwner(keyed.find((c) => readEnvelope(entries, c.metadataKey!) !== null) ?? null);
    })();
  }, [elementSelection, client, editContexts]);

  return owner;
}
