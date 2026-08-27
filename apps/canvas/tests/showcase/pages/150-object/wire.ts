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

// Chapter-local wire helpers for The Object. Three kinds of door the
// shared driver does not wrap:
//
//   · READ doors (requestElementGeometry / requestPathAnchors /
//     requestPlanarRegions) — the geometry facts this chapter's
//     transform pivots and face ids come from, so nothing is guessed.
//   · a REFUSAL probe (`tryRawMutate`) that talks to `client.mutate`
//     directly, NOT through `doc.mutate`: the driver chokepoint
//     tallies every op it forwards into the ledger, and an op we
//     expect the engine to refuse must not be tallied as exercised.
//   · tiny geometry conveniences (tile grids, the page-space anchor
//     builder for `insertPath`, whose anchors are page-local [x, y]
//     pairs — NOT the wire's [top, left, bottom, right] bounds order).
//
// Coordinate note, learned from the d.ts: `requestPathAnchors` and
// `requestElementGeometry` answer in the element's own STORED space
// (spread coords for live-inserted items, before item_transform), and
// the pathPoint* ops take positions in that same space — so every
// edit position in this chapter is derived from a read, never from
// page arithmetic.

import type { PageContext } from "../../types";

/** ElementId as the wire wants it for element-addressed ops. */
export interface WireId {
  kind: string;
  id: string;
}

export interface GeometryItem {
  id: WireId;
  pageId?: string | null;
  spreadId?: string | null;
  /** `[top, left, bottom, right]` in the element's stored space. */
  bounds: [number, number, number, number];
  itemTransform?: [number, number, number, number, number, number] | null;
}

export interface AnchorTriple {
  anchor: [number, number];
  left: [number, number];
  right: [number, number];
}

export interface PathAnchorsReply {
  id: WireId;
  anchors: AnchorTriple[];
  subpathStarts: number[];
  subpathOpen?: boolean[];
  itemTransform?: [number, number, number, number, number, number] | null;
}

interface ClientGlobal {
  __canvas: {
    client: {
      send: (m: unknown) => Promise<{ kind: string; payload?: unknown }>;
      mutate: (m: unknown) => Promise<{ kind: string; payload?: unknown }>;
    };
  };
}

/** One raw read-door round trip; returns the reply payload. */
async function send(
  ctx: PageContext,
  kind: string,
  payload: unknown,
): Promise<unknown> {
  return ctx.page.evaluate(
    async ({ kind, payload }) => {
      const c = (globalThis as unknown as ClientGlobal).__canvas;
      const reply = await c.client.send({ kind, payload });
      return reply.payload ?? null;
    },
    { kind, payload },
  );
}

/** Stored-space geometry for one element (bounds + item transform). */
export async function elementGeometry(
  ctx: PageContext,
  id: WireId,
): Promise<GeometryItem> {
  const payload = (await send(ctx, "requestElementGeometry", {
    ids: [id],
  })) as { items?: GeometryItem[] };
  const item = payload.items?.[0];
  if (!item) {
    throw new Error(
      `requestElementGeometry answered nothing for ${id.kind}/${id.id}`,
    );
  }
  return item;
}

/** Centre of an element's stored bounds — the pivot the transform
 *  compensation in 02-transforms needs. */
export async function elementCenter(
  ctx: PageContext,
  id: WireId,
): Promise<[number, number]> {
  const g = await elementGeometry(ctx, id);
  const [top, left, bottom, rightEdge] = g.bounds;
  return [(left + rightEdge) / 2, (top + bottom) / 2];
}

/** The element's anchors in its own stored space. */
export async function pathAnchors(
  ctx: PageContext,
  id: WireId,
): Promise<PathAnchorsReply> {
  const payload = (await send(ctx, "requestPathAnchors", { id })) as {
    result?: PathAnchorsReply | null;
  };
  if (!payload.result) {
    throw new Error(`requestPathAnchors answered null for ${id.kind}/${id.id}`);
  }
  return payload.result;
}

export interface PlanarFace {
  id: string;
}

/** The planar arrangement's faces over `ids` (top-to-bottom). Face ids
 *  are ENGINE-MINTED — this read door is the only honest source. */
export async function planarFaces(
  ctx: PageContext,
  ids: WireId[],
): Promise<PlanarFace[]> {
  const payload = (await send(ctx, "requestPlanarRegions", {
    elementIds: ids,
    point: null,
  })) as { result?: { found: boolean; faces: PlanarFace[] } };
  if (!payload.result?.found || payload.result.faces.length === 0) {
    throw new Error(
      "requestPlanarRegions found no faces — the scratch pair does not overlap",
    );
  }
  return payload.result.faces;
}

/**
 * A mutation the module EXPECTS the engine to refuse, sent straight to
 * `client.mutate` so the ledger never tallies it as exercised. Returns
 * the refusal text (or ok: true when the engine surprised us — the
 * caller decides whether that is a finding).
 */
export async function tryRawMutate(
  ctx: PageContext,
  op: string,
  args: unknown,
): Promise<{ ok: boolean; error: string }> {
  return ctx.page.evaluate(
    async ({ op, args }) => {
      const c = (globalThis as unknown as ClientGlobal).__canvas;
      const reply = await c.client.mutate({ op, args });
      if (reply.kind === "mutationApplied") return { ok: true, error: "" };
      const payload = reply.payload as { error?: unknown } | undefined;
      return { ok: false, error: JSON.stringify(payload?.error ?? reply.kind) };
    },
    { op, args },
  );
}

/** `insertPath` anchor from a bare page-space point (straight corner:
 *  both handles collapsed onto the anchor). */
export const corner = (x: number, y: number): AnchorTriple => ({
  anchor: [x, y],
  left: [x, y],
  right: [x, y],
});
