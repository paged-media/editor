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

// WHERE THE SELECTION IS — the readout behind Transform ▸ X / Y and the
// Object section's Bounds, and the write that moves it there.
//
// Both used to project `frameBounds`, and `frameBounds` is the item's
// INNER box: the last step into spread space is its `ItemTransform`. So
// the numbers stood still while the object moved — after a nudge (which
// writes the transform, `object-commands.ts` fact 7), after a rotation,
// after a drag of a rotated frame — and on a document authored by
// InDesign, where frames routinely carry a translation, they never
// described the page at all. And typing into them wrote `frameBounds`
// back, which moves a rotated frame along its own axes and does not
// move a line or a pen path at all (engine-findings §14).
//
// Read and write now agree by construction:
//
//  · READ: the bounds' four corners through the item transform, boxed —
//    the footprint the selection chrome draws. A GROUP's `frameBounds`
//    is already that box (measured: it is the union of its members'
//    transformed boxes and moves with `setGroupTransform`), so a group
//    is read as it is.
//  · WRITE a position: the DIFFERENCE to the shown value, through
//    `translationPlan` — the nudge's own path, rigid for every kind,
//    groups and clipped content included. One batch, one undo step.
//  · WRITE an edge (Bounds ▸ T/L/B/R): only where an inner-box write IS
//    what the user sees — one rectangle, ellipse or text frame whose
//    transform is a pure translation. Anywhere else the edge readout is
//    read-only, rather than a write that lands somewhere else.
//
// THE SPACE these numbers are in is the engine's `elementGeometry`
// space. On a document made here (File ▸ New) and on the generated
// fixtures that is the page. On an InDesign-authored document it is the
// SPREAD: the page's own origin inside its spread is on no read the host
// has, so a page-relative number is not available (engine-findings §17).
// The selection chrome draws in the same space, for the same reason.

import { useCallback, useEffect, useState } from "react";
import type { ElementId, Mutation } from "@paged-media/client";
import { useCanvasClient, useSelection } from "@paged-media/shell";

import {
  asOneMutation,
  isPageItem,
  OBJECT_DIAGNOSTIC_SOURCE,
  refusalOf,
  translationPlan,
} from "../object-commands";
import {
  composedBox,
  edgesWritable,
  innerBoundsFor,
  unionBox,
  type PageBox,
  type PlacedLeaf,
} from "./page-box";
import { problemsSink } from "./problems-store";

export type { PageBox, PlacedLeaf } from "./page-box";

/** What the readout shows and what it can do. */
export interface PagePosition {
  /** The selection's footprint, or `null` (nothing placeable selected). */
  box: PageBox | null;
  /** The one selected leaf, when its edges can be written. */
  edgeLeaf: PlacedLeaf | null;
  /** Move the whole selection by `(dx, dy)`, rigidly, in one undo step. */
  moveBy: (dx: number, dy: number) => Promise<void>;
  /** Set the edges of `edgeLeaf` (a resize). No-op without one. */
  setEdges: (box: PageBox) => Promise<void>;
}

const EMPTY = { box: null, edgeLeaf: null } as const;

function report(message: string): void {
  problemsSink.publish(OBJECT_DIAGNOSTIC_SOURCE, "object", [
    { severity: "error", message, source: "object" },
  ]);
}

/**
 * The live footprint of the element selection, re-read whenever the
 * engine applies, undoes or redoes anything (or a gesture commits), and
 * the two writes that act on it.
 */
export function usePagePosition(): PagePosition {
  const client = useCanvasClient();
  const { elementSelection, elementGeometry, setElementGeometry } =
    useSelection();
  const [state, setState] = useState<{
    box: PageBox | null;
    edgeLeaf: PlacedLeaf | null;
  }>(EMPTY);
  const selectionKey = JSON.stringify(elementSelection);

  useEffect(() => {
    const ids = elementSelection.filter(isPageItem);
    if (ids.length === 0) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    const refetch = async () => {
      try {
        const leaves = ids.filter((id) => id.kind !== "group");
        const groups = ids.filter((id) => id.kind === "group");
        const geometry = leaves.length > 0 ? await client.elementGeometry(leaves) : [];
        // An id with no geometry is not a free page item (or is gone):
        // a box that silently left it out would be a wrong number.
        if (geometry.length !== leaves.length) {
          if (!cancelled) setState(EMPTY);
          return;
        }
        const boxes = geometry.map((g) => composedBox(g.bounds, g.itemTransform));
        for (const group of groups) {
          const entry = (await client.elementProperties(group))?.entries.find(
            (e) => e.path === "frameBounds",
          );
          if (entry?.value?.type !== "bounds") {
            if (!cancelled) setState(EMPTY);
            return;
          }
          boxes.push(composedBox(entry.value.value, null));
        }
        const only = ids.length === 1 && geometry.length === 1 ? geometry[0] : null;
        const leaf: PlacedLeaf | null =
          only && isPageItem(only.id)
            ? { id: only.id, bounds: only.bounds, transform: only.itemTransform ?? null }
            : null;
        if (!cancelled) {
          setState({ box: unionBox(boxes), edgeLeaf: edgesWritable(leaf) ? leaf : null });
        }
      } catch {
        if (!cancelled) setState(EMPTY);
      }
    };
    void refetch();
    const off = client.subscribe((msg) => {
      if (
        msg.kind === "mutationApplied" ||
        msg.kind === "undoApplied" ||
        msg.kind === "redoApplied" ||
        msg.kind === "gestureCommitted"
      ) {
        void refetch();
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [client, selectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Send one batch; report a refusal; re-read the selection chrome
   *  (it caches geometry and refreshes only on clicks and gestures). */
  const send = useCallback(
    async (verb: string, ops: Mutation[]) => {
      if (ops.length === 0) return;
      const refusal = refusalOf(await client.mutate(asOneMutation(ops)));
      if (refusal) {
        report(`${verb} refused: ${refusal}`);
        return;
      }
      const shown = elementGeometry.map((g) => g.id);
      const ids: ElementId[] = shown.length > 0 ? shown : elementSelection;
      if (ids.length === 0) return;
      try {
        setElementGeometry(await client.elementGeometry(ids));
      } catch {
        /* chrome only */
      }
    },
    [client, elementGeometry, elementSelection, setElementGeometry],
  );

  const moveBy = useCallback(
    async (dx: number, dy: number) => {
      problemsSink.clear(OBJECT_DIAGNOSTIC_SOURCE);
      if (dx === 0 && dy === 0) return;
      const plan = await translationPlan(client, elementSelection, dx, dy);
      if (!plan.ok) {
        report(`Move refused: ${plan.reason}`);
        return;
      }
      await send("Move", plan.ops);
    },
    [client, elementSelection, send],
  );

  const edgeLeaf = state.edgeLeaf;
  const setEdges = useCallback(
    async (box: PageBox) => {
      problemsSink.clear(OBJECT_DIAGNOSTIC_SOURCE);
      if (!edgeLeaf) return;
      await send("Resize", [
        {
          op: "setElementProperty",
          args: {
            elementId: edgeLeaf.id,
            path: "frameBounds",
            value: { type: "bounds", value: innerBoundsFor(edgeLeaf, box) },
          },
        },
      ]);
    },
    [edgeLeaf, send],
  );

  return { box: state.box, edgeLeaf, moveBy, setEdges };
}
