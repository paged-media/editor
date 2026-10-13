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

// Element geometry in PAGE space, for what the canvas DRAWS and READS OUT.
//
// The engine's `elementGeometry` (and `pathAnchors`) answer with the IDML
// item's bounds and item transform, which compose to SPREAD space: they
// are never moved by the page's own origin inside its spread. Every other
// read is page-local (hit tests, carets, selection rects, table cells),
// and the canvas draws each page at its own origin. So wherever a page
// does not start at its spread's origin — a verso of a facing spread made
// here (origin at the spine), every page of an InDesign document (origin
// at the spine, half a page up) — the selection chrome landed beside the
// object and the control bar read spread numbers (L −476 / R −232 on a
// 540 pt verso). The fix belongs to the engine (`element_geometry` should
// subtract the page's spread origin, as its hit test does); until then
// this module measures that origin and folds it into the transform.
//
// THE MEASUREMENT. A hit test on a page answers the element it hit with
// its page-local box (`frameBounds`). The same element's `elementGeometry`
// box, minus that page-local box, IS the page's origin offset. Measured
// against `elementGeometry` itself — not the hit's own spread fields — so
// once the engine answers in page space the offset measures zero and this
// module does nothing.
//
// ONLY FOR DISPLAY. Writers that send a transform BACK to the engine
// (the nudge's `moveFrame`, align) must keep reading the raw geometry; a
// page-space transform written as an item transform would move the item
// by the page's origin.

import type {
  CanvasClient,
  ElementGeometryItem,
  PageId,
  PathAnchorsResult,
  WorkerToMain,
} from "@paged-media/client";

type Affine = [number, number, number, number, number, number];
type Origin = readonly [number, number];
type Box = { left: number; top: number; right: number; bottom: number };

const ZERO: Origin = [0, 0];

type Client = Pick<CanvasClient, "send" | "subscribe" | "elementGeometry" | "collection">;

interface Resolver {
  origins: Map<PageId, Origin>;
  pending: Map<PageId, Promise<Origin>>;
  sizes: Promise<Map<PageId, [number, number]>> | null;
  /** Bumped on every invalidation; a probe that started before one is
   *  not cached. */
  generation: number;
}

const resolvers = new WeakMap<object, Resolver>();

/** What can move a page inside its spread: a new document, a change of
 *  page structure or size, a committed gesture (the Page tool). */
function invalidates(msg: WorkerToMain): boolean {
  switch (msg.kind) {
    case "documentLoaded":
    case "gestureCommitted":
      return true;
    case "mutationApplied":
    case "undoApplied":
    case "redoApplied":
      return Boolean(msg.payload.pageStructureChanged || msg.payload.pageSizesPt);
    default:
      return false;
  }
}

function resolverFor(client: Client): Resolver {
  let r = resolvers.get(client);
  if (!r) {
    const created: Resolver = {
      origins: new Map(),
      pending: new Map(),
      sizes: null,
      generation: 0,
    };
    client.subscribe((msg) => {
      if (!invalidates(msg)) return;
      created.origins.clear();
      created.pending.clear();
      created.sizes = null;
      created.generation += 1;
    });
    resolvers.set(client, created);
    r = created;
  }
  return r;
}

function aabb(item: Pick<ElementGeometryItem, "bounds" | "itemTransform">): Box {
  const [top, left, bottom, right] = item.bounds;
  const t: Affine = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ] as const) {
    xs.push(t[0] * x + t[2] * y + t[4]);
    ys.push(t[1] * x + t[3] * y + t[5]);
  }
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

const sameId = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function pageSizes(client: Client, r: Resolver): Promise<Map<PageId, [number, number]>> {
  r.sizes ??= client
    .collection("pages")
    .then(
      (pages) =>
        new Map(
          (pages as Array<{ selfId: string; sizePt: [number, number] }>).map((p) => [
            p.selfId as PageId,
            p.sizePt,
          ]),
        ),
    )
    .catch(() => new Map());
  return r.sizes;
}

/** Measure one page's origin offset; ZERO when nothing on it answers. */
async function measure(
  client: Client,
  pageId: PageId,
  hints: readonly ElementGeometryItem[],
  r: Resolver,
): Promise<Origin> {
  const size = (await pageSizes(client, r)).get(pageId);
  if (!size) return ZERO;
  const [w, h] = size;
  // Where to probe: the hint elements' centres under the origins a page
  // usually has (none; a verso's −w; InDesign's half page up), then a
  // grid. Any element the probe hits will do — the measurement is exact.
  const points: Array<[number, number]> = [];
  for (const hint of hints) {
    const b = aabb(hint);
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    for (const [ox, oy] of [
      [0, 0],
      [-w, 0],
      [0, -h / 2],
      [-w, -h / 2],
      [w, 0],
      [w, -h / 2],
    ]) {
      const p: [number, number] = [cx - ox, cy - oy];
      if (p[0] >= 0 && p[0] <= w && p[1] >= 0 && p[1] <= h) points.push(p);
    }
  }
  for (let gy = 1; gy < 6; gy++) {
    for (let gx = 1; gx < 6; gx++) points.push([(w * gx) / 6, (h * gy) / 6]);
  }
  for (const point of points) {
    let reply: WorkerToMain;
    try {
      reply = await client.send({
        kind: "hitTest",
        payload: { pageId, docPoint: point, filter: "any" },
      });
    } catch {
      return ZERO;
    }
    if (reply.kind !== "hitResult") continue;
    const { element, frameBounds } = reply.payload;
    if (!element || !frameBounds || element.kind === "group") continue;
    const known = hints.find((g) => sameId(g.id, element) && g.pageId === pageId);
    let geometry: ElementGeometryItem | undefined = known;
    if (!geometry) {
      try {
        geometry = (await client.elementGeometry([element]))[0];
      } catch {
        continue;
      }
    }
    if (!geometry) continue;
    const box = aabb(geometry);
    // A rotated spread view is not a translation away: leave it be.
    if (
      Math.abs(box.right - box.left - (frameBounds.right - frameBounds.left)) > 0.5 ||
      Math.abs(box.bottom - box.top - (frameBounds.bottom - frameBounds.top)) > 0.5
    ) {
      return ZERO;
    }
    return [box.left - frameBounds.left, box.top - frameBounds.top];
  }
  return ZERO;
}

/** The page's origin offset inside its spread, as `elementGeometry`
 *  composes it (ZERO when geometry is already page-local). */
export function pageOrigin(
  client: Client,
  pageId: PageId,
  hints: readonly ElementGeometryItem[] = [],
): Promise<Origin> {
  const r = resolverFor(client);
  const known = r.origins.get(pageId);
  if (known) return Promise.resolve(known);
  const inFlight = r.pending.get(pageId);
  if (inFlight) return inFlight;
  const generation = r.generation;
  const probe = measure(client, pageId, hints, r).then((origin) => {
    if (r.generation === generation) {
      r.origins.set(pageId, origin);
      r.pending.delete(pageId);
    }
    return origin;
  });
  r.pending.set(pageId, probe);
  return probe;
}

function shifted(t: Affine | null | undefined, [ox, oy]: Origin): Affine {
  const [a, b, c, d, tx, ty] = t ?? [1, 0, 0, 1, 0, 0];
  return [a, b, c, d, tx - ox, ty - oy];
}

const isZero = ([ox, oy]: Origin) => Math.abs(ox) < 1e-3 && Math.abs(oy) < 1e-3;

/** Does this item compose against its page (needs the shift)? Table
 *  cells come from the page's own cell rects; pageless items are in
 *  spread space by contract. */
function shiftable(item: ElementGeometryItem): item is ElementGeometryItem & { pageId: PageId } {
  return Boolean(item.pageId) && item.id.kind !== "tableCell";
}

/** `items` with each page's origin folded into its transform, so bounds
 *  through `itemTransform` land in that page's own space. */
export async function toPageSpace(
  client: Client,
  items: readonly ElementGeometryItem[],
): Promise<ElementGeometryItem[]> {
  const pages = [...new Set(items.filter(shiftable).map((g) => g.pageId))];
  const origins = new Map<PageId, Origin>();
  for (const pageId of pages) {
    origins.set(
      pageId,
      await pageOrigin(
        client,
        pageId,
        items.filter((g) => g.pageId === pageId),
      ),
    );
  }
  return items.map((g) => {
    if (!shiftable(g)) return g;
    const origin = origins.get(g.pageId) ?? ZERO;
    return isZero(origin) ? g : { ...g, itemTransform: shifted(g.itemTransform, origin) };
  });
}

/** `toPageSpace` without waiting: the answer when every page involved is
 *  already measured, else `null`. */
export function toPageSpaceNow(
  client: Client,
  items: readonly ElementGeometryItem[],
): ElementGeometryItem[] | null {
  const r = resolverFor(client);
  const out: ElementGeometryItem[] = [];
  for (const g of items) {
    if (!shiftable(g)) {
      out.push(g);
      continue;
    }
    const origin = r.origins.get(g.pageId);
    if (!origin) return null;
    out.push(isZero(origin) ? g : { ...g, itemTransform: shifted(g.itemTransform, origin) });
  }
  return out;
}

/** A path's anchor table with its page's origin folded into the
 *  transform, for a session that draws and hit-tests anchors on the
 *  page (anchor positions stay in the path's own inner space). */
export async function pageSpacePathAnchors(
  client: Client & Pick<CanvasClient, "pathAnchors">,
  id: Parameters<CanvasClient["pathAnchors"]>[0],
): Promise<PathAnchorsResult | null> {
  const result = await client.pathAnchors(id);
  if (!result?.pageId) return result;
  let hints: ElementGeometryItem[] = [];
  try {
    hints = await client.elementGeometry([id]);
  } catch {
    // Probe without a hint.
  }
  const origin = await pageOrigin(client, result.pageId, hints);
  return isZero(origin)
    ? result
    : { ...result, itemTransform: shifted(result.itemTransform, origin) };
}
