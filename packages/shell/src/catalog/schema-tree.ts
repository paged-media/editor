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

// Schema v1.2 — the TREE-ROW arithmetic, kept PURE (no React, no
// client) so the flattening, the sibling indices and the cycle guard
// are one readable thing the renderer and any future virtualized
// primitive can share.
//
// The model is PARENT-ID rows, not nested objects — because that is
// the shape the engine actually hands us. `LayerSummary.parentId`
// (protocol 60) is a flat list with a parent pointer, and a plugin
// publishing rows through `bindings.publish` flattens whatever it has
// into the same shape. A nested-children wire form would force every
// producer to build a tree the widget immediately re-flattens.
//
// Two rules the rest of the tier depends on, both chosen so a row can
// never silently vanish:
//
//   · an ORPHAN (its `parentField` names an id that is not in the row
//     set) renders as a ROOT. A partial row set — a plugin publishing
//     one layer's items, a collection page — is the normal case, not
//     an error, and dropping those rows would show an empty panel over
//     a non-empty document;
//   · a CYCLE (a → b → a, which the wire does not forbid) is broken by
//     an emitted-set guard, and every row the depth-first walk could
//     not reach is appended at depth 0 in source order. Truncating the
//     cycle instead would hide document corruption behind a short list.

/** One flattened tree row: the source row plus the structure the leaf
 *  needs to indent it and the renderer needs to reorder it. */
export interface SchemaTreeRow<T> {
  id: string;
  row: T;
  /** 0 = root. */
  depth: number;
  /** Resolved parent id, or `null` for a root (including orphans). */
  parentId: string | null;
  /** Position among its siblings, in SOURCE order. This is the index
   *  the reorder lane speaks — see `schema-panel-renderer.tsx`. */
  siblingIndex: number;
  hasChildren: boolean;
}

/**
 * Flatten parent-id rows into depth-first order.
 *
 * `idOf` receives the source index so a producer with no stable id
 * can fall back to it (the list leaf's own `String(i)` convention).
 * `parentOf` returns `null` for a root; an unknown id is treated as
 * `null` (the orphan rule above).
 */
export function buildSchemaTreeRows<T>(
  items: readonly T[],
  idOf: (row: T, index: number) => string,
  parentOf: (row: T) => string | null,
): SchemaTreeRow<T>[] {
  const ids = items.map((row, i) => idOf(row, i));
  const known = new Set(ids);

  // Children in SOURCE order, keyed by resolved parent ("" = root
  // bucket — a real id can never be the empty string here because an
  // empty parent field resolves to null).
  const ROOT = "";
  const children = new Map<string, number[]>();
  const parentOfIndex: (string | null)[] = items.map((row) => {
    const raw = parentOf(row);
    return raw != null && raw !== "" && known.has(raw) ? raw : null;
  });
  items.forEach((_row, i) => {
    const key = parentOfIndex[i] ?? ROOT;
    const bucket = children.get(key);
    if (bucket) bucket.push(i);
    else children.set(key, [i]);
  });

  const out: SchemaTreeRow<T>[] = [];
  const emitted = new Set<number>();

  const walk = (indices: number[], depth: number) => {
    indices.forEach((index, siblingIndex) => {
      // Cycle guard — a row already placed is not placed twice.
      if (emitted.has(index)) return;
      emitted.add(index);
      const id = ids[index];
      const kids = children.get(id) ?? [];
      out.push({
        id,
        row: items[index],
        depth,
        parentId: parentOfIndex[index],
        siblingIndex,
        hasChildren: kids.length > 0,
      });
      if (kids.length > 0) walk(kids, depth + 1);
    });
  };
  walk(children.get(ROOT) ?? [], 0);

  // Anything the walk could not reach lives in a cycle. Surface it at
  // the root rather than dropping it.
  let stranded = 0;
  items.forEach((row, index) => {
    if (emitted.has(index)) return;
    out.push({
      id: ids[index],
      row,
      depth: 0,
      parentId: null,
      siblingIndex: (children.get(ROOT) ?? []).length + stranded++,
      hasChildren: false,
    });
  });

  return out;
}

/**
 * The subset of a flattened tree that is actually on screen: a row is
 * visible when every ancestor is expanded. Collapsed subtrees cost
 * nothing to render — which is the tree's own answer to list size, and
 * the reason the render window (`LIST_ROW_PAGE`) applies to the
 * VISIBLE rows rather than the whole set.
 */
export function visibleSchemaTreeRows<T>(
  rows: readonly SchemaTreeRow<T>[],
  isExpanded: (id: string) => boolean,
): SchemaTreeRow<T>[] {
  const out: SchemaTreeRow<T>[] = [];
  // Depth at which we started skipping; -1 = not skipping.
  let hiddenBelow = -1;
  for (const row of rows) {
    if (hiddenBelow >= 0) {
      if (row.depth > hiddenBelow) continue;
      hiddenBelow = -1;
    }
    out.push(row);
    if (row.hasChildren && !isExpanded(row.id)) hiddenBelow = row.depth;
  }
  return out;
}

/** A flat list rendered through the same lane: every row is a root at
 *  depth 0, so `siblingIndex` is the row index and the reorder
 *  arithmetic is identical for lists and trees. */
export function flatSchemaTreeRows<T>(
  items: readonly T[],
  idOf: (row: T, index: number) => string,
): SchemaTreeRow<T>[] {
  return items.map((row, i) => ({
    id: idOf(row, i),
    row,
    depth: 0,
    parentId: null,
    siblingIndex: i,
    hasChildren: false,
  }));
}
