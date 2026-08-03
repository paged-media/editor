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
