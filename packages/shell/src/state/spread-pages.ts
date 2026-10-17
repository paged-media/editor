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
// spread space has no place on it until it is tied to a page. Engine
// 0.71.13 says where every page sits on its page summary (`pageOrigin`,
// `spreadId`); before it, only `pageOrigin` on a page-owned item's
// geometry did. These helpers collect those origins, ask for them when a
// pasteboard item's spread has none yet, and re-express each pasteboard
// item against the nearest page of its spread. The result is page space
// that runs past the page's edges, which is what the chrome draws in and
// what a gesture's anchor speaks.

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

/** A page summary with the fields engine 0.71.13 added; older workers
 *  omit them. */
type PlacedPageSummary = PageSummary & {
  pageOrigin?: [number, number];
  spreadId?: string;
};

/** Every page whose summary says where it sits in its spread. */
export function spreadPagesFromSummaries(
  pages: readonly PlacedPageSummary[],
): SpreadPages {
  const out = new Map<string, PageInSpread[]>();
  for (const p of pages) {
    if (!p.spreadId || !p.pageOrigin) continue;
    const list = out.get(p.spreadId) ?? [];
    list.push({ pageId: p.selfId, origin: [p.pageOrigin[0], p.pageOrigin[1]] });
    out.set(p.spreadId, list);
  }
  return out;
}

/** `known` plus the pages `found` places; `found` wins for a page both
 *  name. Returns `known` itself when `found` is empty. */
export function mergeSpreadPages(known: SpreadPages, found: SpreadPages): SpreadPages {
  if (found.size === 0) return known;
  const next = new Map(known);
  for (const [spreadId, pages] of found) {
    const kept = (known.get(spreadId) ?? []).filter(
      (p) => !pages.some((q) => q.pageId === p.pageId),
    );
    next.set(spreadId, [...kept, ...pages]);
  }
  return next;
}

/** Larger than any pasteboard, smaller than f32 trouble. */
const EVERYWHERE = 1e6;

/**
 * Where the pages of `spreadId` sit. The page summaries say so for every
 * spread at once (engine 0.71.13). An older worker's do not; then the
 * page-owned items of the spread say it, through their `pageOrigin`: a
 * marquee on any page of a spread tests every item of that spread, so
 * one marquee over everything finds them. Empty when neither answers (a
 * spread with no page-owned item a marquee can reach — hidden and locked
 * layers are skipped).
 */
export async function probeSpreadPages(
  client: Pick<CanvasClient, "collection" | "marqueeHits" | "elementGeometry">,
  spreadId: string,
): Promise<SpreadPages> {
  const pages = await client.collection<PlacedPageSummary>("pages");
  const summarised = spreadPagesFromSummaries(pages);
  if (summarised.size > 0) return summarised;
  const spreads = await client.collection<SpreadSummary>("spreads");
  // Both collections run in document order; a spread's pages follow the
  // pages of the spreads before it.
  let first = 0;
  for (const spread of spreads) {
    if (spread.selfId !== spreadId) {
      first += spread.pageCount;
      continue;
    }
    const pageId = pages[first]?.selfId;
    if (!pageId || spread.pageCount === 0) return NO_SPREAD_PAGES;
    const ids = await client.marqueeHits(pageId, [
      -EVERYWHERE,
      -EVERYWHERE,
      EVERYWHERE,
      EVERYWHERE,
    ]);
    if (ids.length === 0) return NO_SPREAD_PAGES;
    return learnSpreadPages(NO_SPREAD_PAGES, await client.elementGeometry(ids));
  }
  return NO_SPREAD_PAGES;
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
