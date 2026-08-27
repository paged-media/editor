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

// Shared vocabulary for the picture chapter (175).
//
// The persistence rule this chapter lives by (AUTHORING.md rule 3):
// pixels served through the tile channel die at the chapter boundary,
// so every photograph here goes into the DOCUMENT as inline bytes via
// `replaceImageBytes` — the lane the editor's own Place… flow uses,
// and the one that survives the `.paged` round trip. `placeImage`
// writes the LINK and the fitting beside it, so each frame also
// carries an honest record of which file its pixels came from.
//
// Bytes reach the worker without crossing CDP: the module hands the
// PAGE a `/@fs` URL (vite's filesystem door — the same one the old
// raster page used), the page fetches and hands the array straight to
// `client.mutate`. The ledger is fed by hand for these, because the
// op bypasses `ShowcaseDoc.mutate`.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PageContext } from "../../types";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** `tests/showcase/assets` — the annual's granted asset store. */
export const ASSETS = pathResolve(__dirname, "..", "..", "assets");

export const photo = (name: string): string =>
  pathResolve(ASSETS, "photos", name);
export const derived = (name: string): string =>
  pathResolve(ASSETS, "photos", "derived", name);

/** `/@fs` URL for an absolute path (vite serves it read-only). */
export const fsUrl = (absPath: string): string => `/@fs${absPath}`;

/**
 * `replaceImageBytes` with the file's real bytes, fetched in the page.
 * Throws on refusal (the wire stores the payload; DECODING is the
 * renderer's job — see `attemptReplaceBytes` for the deliberate-
 * failure lane). Returns the byte count for captions.
 */
export async function replaceBytesFromFile(
  ctx: PageContext,
  frameId: string,
  absPath: string,
): Promise<number> {
  const out = await attemptReplaceBytes(ctx, frameId, absPath);
  if (out.kind !== "mutationApplied") {
    throw new Error(
      `replaceImageBytes(${absPath}) refused: ${out.error ?? out.kind}`,
    );
  }
  return out.bytes;
}

/** The non-throwing sibling, for exhibits whose point IS the outcome. */
export async function attemptReplaceBytes(
  ctx: PageContext,
  frameId: string,
  absPath: string,
): Promise<{ kind: string; error: string | null; bytes: number }> {
  ctx.doc.ledger?.record("replaceImageBytes", { elementId: frameId });
  return ctx.page.evaluate(
    async ({ frameId, url }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              mutate: (m: unknown) => Promise<{
                kind: string;
                payload?: { error?: unknown };
              }>;
            };
          };
        }
      ).__canvas;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`asset fetch failed: ${url}`);
      const bytes = Array.from(new Uint8Array(await res.arrayBuffer()));
      const reply = await c.client.mutate({
        op: "replaceImageBytes",
        args: { elementId: frameId, bytes },
      });
      return {
        kind: reply.kind,
        error: reply.payload?.error ? JSON.stringify(reply.payload.error) : null,
        bytes: bytes.length,
      };
    },
    { frameId, url: fsUrl(absPath) },
  );
}

/** Clear a frame's inline bytes (`bytes: null`). The frame REMAINS an
 *  image element — which is exactly what the placeholder specimen
 *  needs: image-bearing, byteless, link unresolvable. */
export async function clearImageBytes(
  ctx: PageContext,
  frameId: string,
): Promise<void> {
  await ctx.doc.mutate("replaceImageBytes", {
    elementId: frameId,
    bytes: null,
  });
}

/** The engine's own record of a frame's bounds (wire-ordered
 *  [top, left, bottom, right], in the model's coordinate space) — the
 *  base the inner image transform must be expressed in. */
export async function frameBoundsOf(
  ctx: PageContext,
  frameId: string,
): Promise<[number, number, number, number]> {
  const v = await ctx.page.evaluate(async (frameId) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementProperties: (id: unknown) => Promise<{
              entries: Array<{ path: string; value: { type: string; value: unknown } }>;
            } | null>;
          };
        };
      }
    ).__canvas;
    const props = await c.client.elementProperties({
      kind: "rectangle",
      id: frameId,
    });
    return (
      (props?.entries.find((e) => e.path === "frameBounds")?.value?.value as
        | number[]
        | undefined) ?? null
    );
  }, frameId);
  if (!v || v.length !== 4) {
    throw new Error(`frameBounds unreadable for ${frameId}`);
  }
  return v as [number, number, number, number];
}
