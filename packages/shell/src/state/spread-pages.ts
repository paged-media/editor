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

// Placing a pasteboard item next to a page.
//
// The engine gives an item to the page its centre sits on and answers its
// geometry in that page's space. An item whose centre is on the
// pasteboard belongs to no page: it answers in its SPREAD's space, with
// the spread's id (C-23). The canvas lays pages out one under another, so
// spread space has no place on it until it is tied to a page, and nothing
// in the engine's answers says where a page sits in its spread except
// `pageOrigin` on a page-owned item's geometry. These helpers collect
// those origins, ask for them when a pasteboard item's spread has none
// yet, and re-express each pasteboard item against the nearest page of
// its spread. The result is page space that runs past the page's edges,
// which is what the chrome draws in and what a gesture's anchor speaks.

import type {
  CanvasClient,
  ElementGeometryItem,
  PageId,
  PageSummary,
  SpreadSummary,
} from "@paged-media/client";

/** Where a page's top-left sits in its spread. */
export interface PageInSpread {
  pageId: PageId;
  origin: readonly [number, number];
}

/** Spread id → the pages of it whose origin is known. */
export type SpreadPages = ReadonlyMap<string, readonly PageInSpread[]>;

export const NO_SPREAD_PAGES: SpreadPages = new Map();

/** `known` plus every page origin `items` carry. Returns `known` itself
 *  when they add nothing, so a state setter can bail out. */
export function learnSpreadPages(
  known: SpreadPages,
  items: readonly ElementGeometryItem[],
): SpreadPages {
  let next: Map<string, readonly PageInSpread[]> | null = null;
  for (const g of items) {
    if (!g.pageId || !g.spreadId || !g.pageOrigin) continue;
    const list = (next ?? known).get(g.spreadId) ?? [];
    const had = list.find((p) => p.pageId === g.pageId);
    if (had && had.origin[0] === g.pageOrigin[0] && had.origin[1] === g.pageOrigin[1]) {
      continue;
    }
    next ??= new Map(known);
    next.set(g.spreadId, [
      ...list.filter((p) => p.pageId !== g.pageId),
      { pageId: g.pageId, origin: [g.pageOrigin[0], g.pageOrigin[1]] },
    ]);
  }
  return next ?? known;
}

/** The spreads of `items`' pasteboard items that have no known page. */
export function unplacedSpreads(
  items: readonly ElementGeometryItem[],
  known: SpreadPages,
): string[] {
  const out = new Set<string>();
  for (const g of items) {
    if (g.pageId || !g.spreadId) continue;
    if ((known.get(g.spreadId)?.length ?? 0) === 0) out.add(g.spreadId);
  }
  return [...out];
}

/** Larger than any pasteboard, smaller than f32 trouble. */
const EVERYWHERE = 1e6;

/**
 * The page-owned items of one spread, for their `pageOrigin`. A marquee
 * on any page of a spread tests every item of that spread, so one marquee
 * over everything finds them. Empty when the spread holds no page-owned
 * item that a marquee can reach (hidden and locked layers are skipped):
 * then nothing says where its pages sit.
 */
export async function probeSpreadPages(
  client: Pick<CanvasClient, "collection" | "marqueeHits" | "elementGeometry">,
  spreadId: string,
): Promise<ElementGeometryItem[]> {
  const [spreads, pages] = await Promise.all([
    client.collection<SpreadSummary>("spreads"),
    client.collection<PageSummary>("pages"),
  ]);
  // Both collections run in document order; a spread's pages follow the
  // pages of the spreads before it.
  let first = 0;
  for (const spread of spreads) {
    if (spread.selfId !== spreadId) {
      first += spread.pageCount;
      continue;
    }
    const pageId = pages[first]?.selfId;
    if (!pageId || spread.pageCount === 0) return [];
    const ids = await client.marqueeHits(pageId, [
      -EVERYWHERE,
      -EVERYWHERE,
      EVERYWHERE,
      EVERYWHERE,
    ]);
    if (ids.length === 0) return [];
    return (await client.elementGeometry(ids)).filter((g) => g.pageId && g.pageOrigin);
  }
  return [];
}

type Affine = [number, number, number, number, number, number];

/**
 * `items` with every pasteboard item re-expressed against the nearest
 * page of its spread whose origin is known: that page's id, and its
 * transform moved from spread space into the page's space. An item of a
 * spread with no known page stays as it is (and draws no chrome).
 */
export function placeOnPages(
  items: readonly ElementGeometryItem[],
  known: SpreadPages,
  pageSize: (pageId: PageId) => readonly [number, number] | null,
): ElementGeometryItem[] {
  if (!items.some((g) => !g.pageId && g.spreadId)) return items as ElementGeometryItem[];
  return items.map((g) => {
    if (g.pageId || !g.spreadId) return g;
    const pages = known.get(g.spreadId);
    if (!pages || pages.length === 0) return g;
    const m: Affine = g.itemTransform ? [...g.itemTransform] : [1, 0, 0, 1, 0, 0];
    const [top, left, bottom, right] = g.bounds;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const centre: [number, number] = [m[0] * cx + m[2] * cy + m[4], m[1] * cx + m[3] * cy + m[5]];
    let best = pages[0];
    let bestDistance = Infinity;
    for (const p of pages) {
      const [w, h] = pageSize(p.pageId) ?? [0, 0];
      const dx = Math.max(p.origin[0] - centre[0], 0, centre[0] - (p.origin[0] + w));
      const dy = Math.max(p.origin[1] - centre[1], 0, centre[1] - (p.origin[1] + h));
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        best = p;
        bestDistance = distance;
      }
    }
    return {
      ...g,
      pageId: best.pageId,
      itemTransform: [m[0], m[1], m[2], m[3], m[4] - best.origin[0], m[5] - best.origin[1]],
      pageOrigin: [best.origin[0], best.origin[1]],
    };
  });
}
