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

// Chapter-local support for The Drawing Office (Ch.14, p75–p86) — the
// paged.draw chapter. Three kinds of door the shared layers do not
// wrap, plus one measured seam this chapter is the first to cross:
//
//   · the CONTAINER-PART read doors (`readPagedPart` / `listPagedParts`)
//     — paged.draw keeps seven recipes as `.paged` parts, and the only
//     honest way to learn a minted library id (a symbol's `sym-1`, a
//     blend's `bl-1`, a live-paint face id) is to read the part the
//     bundle wrote, never to predict the mint;
//   · a page-space insertPath helper with explicit paint — inserted
//     paths inherit the document creation defaults, which on this
//     fixture may paint nothing, and an invisible specimen is a failed
//     specimen;
//   · the GESTURE kit — the annual is a 134-page document and every
//     built-in gesture helper maps page-LOCAL points through the live
//     camera, which after load shows page 1. `focusPage` derives a
//     page's spread origin from a probe insert (measured, not assumed),
//     writes the SAB camera the navigator's goToPage writes, and the
//     click/drag helpers then land real pointer input on any page.
//
// THE SPREAD SEAM, measured here first (see `spreadOffset`): the annual
// is FACING spreads (paged-gen annual_base), so a RECTO page's items
// are STORED at spread coordinates offset by one page width, while the
// wire's insert ops take page-LOCAL coordinates and re-base them. Any
// flow that READS geometry and RE-INSERTS it (a bundle planner) is
// exact on a verso and displaced by the offset on a recto. The chapter
// measures the offset per page and says on the page what it did about
// it, rather than letting artwork fall off the fold silently.

import type { Page } from "@playwright/test";

import type { Bounds, ShowcaseDoc } from "../../driver";
import { geometryOf, sceneRefs, type Ref } from "../../plugin-support";
import type { PageContext } from "../../types";

/** The draw bundle's command-id prefix. */
export const DRAW = "media.paged.draw.command";

/** The draw bundle's container-part namespace. */
export const DRAW_PARTS_PREFIX = "paged/media.paged.draw/";

interface ClientGlobal {
  __canvas: {
    client: {
      send: (m: unknown) => Promise<{ kind: string; payload?: unknown }>;
      camera: {
        read: () => { scale: number; tx: number; ty: number };
        write: (c: { scale: number; tx: number; ty: number }) => void;
      };
    };
    registries: {
      commands: { invoke: (id: string, payload?: unknown) => Promise<void> };
    };
  };
}

/** One raw read-door round trip; returns the reply payload. */
export async function send(
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

/** Every `paged/…` container part path currently in the document. */
export async function listParts(ctx: PageContext): Promise<string[]> {
  const payload = (await send(ctx, "listPagedParts", { prefix: "" })) as {
    paths?: string[];
  } | null;
  return payload?.paths ?? [];
}

/**
 * Read one of paged.draw's JSON recipe parts (`symbols.json`,
 * `blend.json`, `live-paint.json`, …) and parse it. `null` when the
 * part does not exist yet — the caller decides whether that is a
 * refusal or simply "nothing saved here".
 */
export async function readDrawPart<T>(
  ctx: PageContext,
  name: string,
): Promise<T | null> {
  const payload = (await send(ctx, "readPagedPart", {
    path: `${DRAW_PARTS_PREFIX}${name}`,
  })) as { found?: boolean; bytes?: number[] } | null;
  if (!payload?.found || !payload.bytes) return null;
  try {
    return JSON.parse(
      new TextDecoder().decode(Uint8Array.from(payload.bytes)),
    ) as T;
  } catch {
    return null;
  }
}

/** Invoke a draw command by SUFFIX, with an optional payload, through
 *  the same registry the menu bar drives. */
export async function draw(
  ctx: PageContext,
  suffix: string,
  payload?: unknown,
): Promise<void> {
  await ctx.page.evaluate(
    async ({ id, payload }) => {
      const c = (globalThis as unknown as ClientGlobal).__canvas;
      await c.registries.commands.invoke(id, payload);
    },
    { id: `${DRAW}.${suffix}`, payload },
  );
}

/** The current polygons, document-wide (paint order). */
export const polygons = (ctx: PageContext): Promise<Ref[]> =>
  sceneRefs(ctx.page, "polygon");

/** Anchor triple for a straight corner at page point (x, y). */
export const corner = (
  x: number,
  y: number,
): { anchor: [number, number]; left: [number, number]; right: [number, number] } => ({
  anchor: [x, y],
  left: [x, y],
  right: [x, y],
});

export interface PathStyle {
  /** Swatch SELF-ID (resolve names through `doc.swatch` first). */
  fill?: string | null;
  stroke?: string;
  weight?: number;
}

/**
 * `insertPath` at page-space anchors with EXPLICIT paint. The wire op
 * takes page-local anchors and mints a Polygon; the paint writes ride
 * one batch so the specimen is one undo step per shape, not four.
 */
export async function path(
  ctx: PageContext,
  pageId: string,
  anchors: Array<{
    anchor: [number, number];
    left: [number, number];
    right: [number, number];
  }>,
  open: boolean,
  style: PathStyle,
): Promise<string> {
  const id = await ctx.doc.mutateId("insertPath", { pageId, anchors, open });
  const ops: Array<{ op: string; args: unknown }> = [];
  const prop = (path: string, value: unknown) =>
    ops.push({
      op: "setElementProperty",
      args: { elementId: { kind: "polygon", id }, path, value },
    });
  if (style.fill !== undefined) {
    prop("frameFillColor", { type: "colorRef", value: style.fill });
  }
  if (style.stroke !== undefined) {
    prop("frameStrokeColor", { type: "colorRef", value: style.stroke });
    prop("frameStrokeWeight", { type: "length", value: style.weight ?? 1.5 });
  }
  if (ops.length > 0) await ctx.doc.batch(ops);
  return id;
}

/** Mint an RGB swatch whose NAME is its hex — the convention paged.draw
 *  itself writes, and the one lane that lets a blend resolve a key's
 *  colour distance (the swatch name must parse as a CSS colour). */
export async function mintRgbSwatch(
  ctx: PageContext,
  selfId: string,
  rgb: [number, number, number],
): Promise<string> {
  const hex = `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  await ctx.doc.mutate("createSwatch", {
    spec: { selfId, name: hex, space: "RGB", value: rgb },
  });
  return selfId;
}

// ── the spread seam ──────────────────────────────────────────────────

const offsetCache = new Map<string, [number, number]>();

/**
 * Where this page's STORED coordinates sit relative to its page-local
 * ones — `[0, 0]` on a spread's origin page, `[540, 0]` on the facing
 * recto of this fixture. MEASURED with a transient probe (insert a
 * rectangle at a known page-local box, read `requestElementGeometry`,
 * delete it), because guessing a layout convention is how artwork
 * falls off the fold silently.
 */
export async function spreadOffset(
  ctx: PageContext,
  pageId: string,
): Promise<[number, number]> {
  const hit = offsetCache.get(pageId);
  if (hit) return hit;
  const probe: Bounds = [10, 10, 26, 26];
  const id = await ctx.doc.rectangle(pageId, probe);
  const geo = await geometryOf(ctx.page, [{ kind: "rectangle", id }]);
  await ctx.doc.mutate("deleteFrame", { frameId: id });
  const bounds = geo[0]?.bounds;
  if (!bounds) {
    throw new Error(`spread-offset probe on ${pageId} answered no geometry`);
  }
  const off: [number, number] = [bounds[1] - probe[0], bounds[0] - probe[1]];
  offsetCache.set(pageId, off);
  return off;
}

// ── the gesture kit ──────────────────────────────────────────────────
//
// MEASURED, not assumed (the first draft wrote the SAB camera directly
// and every click missed): the VIEWPORT'S document space is the app's
// own `layoutPages` — every page stacked vertically with a 24 pt gap —
// and pointer mapping rides the REACT camera, which only `setCamera`
// (pan/zoom/navigation) writes through to the SAB. So the kit derives
// a page's layout origin from the live handle's page sizes, pans there
// with REAL wheel events (the viewport's own pan lane), and only then
// maps page-local points through the camera the input handlers use.

const LAYOUT_GAP_PT = 24;

/** The viewport-layout origin of a page (0-based index). */
export async function layoutOrigin(
  ctx: PageContext,
  pageIndex: number,
): Promise<[number, number]> {
  const sizes = (await ctx.page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __canvas: { handle: { pageSizesPt: Array<[number, number]> } };
        }
      ).__canvas.handle.pageSizesPt,
  )) as Array<[number, number]>;
  let y = 0;
  for (let i = 0; i < pageIndex; i += 1) y += sizes[i][1] + LAYOUT_GAP_PT;
  return [0, y];
}

interface WrapAndCamera {
  wrapLeft: number;
  wrapTop: number;
  wrapW: number;
  wrapH: number;
  scale: number;
  tx: number;
  ty: number;
}

async function wrapAndCamera(page: Page): Promise<WrapAndCamera | null> {
  return page.evaluate(() => {
    const el = document.querySelector("[data-paged-viewport]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 100 || r.height < 100) return null;
    const cam = (
      globalThis as unknown as ClientGlobal
    ).__canvas.client.camera.read();
    return {
      wrapLeft: r.left,
      wrapTop: r.top,
      wrapW: r.width,
      wrapH: r.height,
      scale: cam.scale,
      tx: cam.tx,
      ty: cam.ty,
    };
  });
}

/**
 * Pan the REAL viewport (wheel events over it — the pointer pan lane)
 * until the layout-space point sits at the viewport centre. Returns
 * false when no measurable viewport exists or the camera never
 * settled; the caller notes and moves on.
 */
export async function focusPageView(
  ctx: PageContext,
  origin: [number, number],
  centerX: number,
  centerY: number,
): Promise<boolean> {
  const wx = origin[0] + centerX;
  const wy = origin[1] + centerY;
  // 100% first, through the app's own View command: after a load the
  // camera fits the WHOLE 134-page stack (scale ≈ 0.006), where every
  // click in a page maps to the same screen pixel — the pen "worked"
  // there only by committing a degenerate sliver. Real input needs a
  // real zoom.
  await ctx.page.evaluate(() => {
    const c = (globalThis as unknown as ClientGlobal).__canvas;
    return c.registries.commands.invoke("paged.view.zoom100");
  });
  await ctx.page.waitForTimeout(250);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const v = await wrapAndCamera(ctx.page);
    if (!v) return false;
    const targetTx = v.wrapW / 2 - wx * v.scale;
    const targetTy = v.wrapH / 2 - wy * v.scale;
    const dx = v.tx - targetTx;
    const dy = v.ty - targetTy;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return true;
    await ctx.page.mouse.move(v.wrapLeft + v.wrapW / 2, v.wrapTop + v.wrapH / 2);
    // Chunked so a 50k-pt jump is not one implausible wheel event.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 15000));
    for (let s = 0; s < steps; s += 1) {
      await ctx.page.mouse.wheel(dx / steps, dy / steps);
      await ctx.page.waitForTimeout(60);
    }
    await ctx.page.waitForTimeout(200);
  }
  return false;
}

/** Absolute screen point for a layout-space point through the LIVE
 *  camera (the same mapping the input handlers invert). */
async function screenXY(
  page: Page,
  origin: [number, number],
  x: number,
  y: number,
): Promise<{ x: number; y: number } | null> {
  const v = await wrapAndCamera(page);
  if (!v) return null;
  return {
    x: v.wrapLeft + (origin[0] + x) * v.scale + v.tx,
    y: v.wrapTop + (origin[1] + y) * v.scale + v.ty,
  };
}

/** One click at a page-local point (pen anchors, anchor tools). */
export async function clickPage(
  ctx: PageContext,
  origin: [number, number],
  x: number,
  y: number,
): Promise<void> {
  const s = await screenXY(ctx.page, origin, x, y);
  if (!s) throw new Error("clickPage: no measurable viewport");
  await ctx.page.mouse.move(s.x, s.y);
  await ctx.page.mouse.down();
  await ctx.page.waitForTimeout(30);
  await ctx.page.mouse.up();
  await ctx.page.waitForTimeout(30);
}

/** One drag between page-local points (the Shape Builder sweep). */
export async function dragPage(
  ctx: PageContext,
  origin: [number, number],
  from: [number, number],
  to: [number, number],
): Promise<void> {
  const a = await screenXY(ctx.page, origin, from[0], from[1]);
  const b = await screenXY(ctx.page, origin, to[0], to[1]);
  if (!a || !b) throw new Error("dragPage: no measurable viewport");
  await ctx.page.mouse.move(a.x, a.y);
  await ctx.page.mouse.down();
  await ctx.page.waitForTimeout(40);
  await ctx.page.mouse.move(b.x, b.y, { steps: 12 });
  await ctx.page.waitForTimeout(200);
  await ctx.page.mouse.up();
  await ctx.page.waitForTimeout(120);
}

// ── the verso re-seat ────────────────────────────────────────────────

/**
 * Re-home artwork a bundle planner minted on an offset page. THE SEAM:
 * the wire's insert ops re-base page-local anchors by the page's
 * spread origin, while the geometry reads answer STORED (spread)
 * coordinates — so any read-then-reinsert flow lands exact on the
 * spread-origin page and displaced by exactly the offset on its
 * neighbour. One batch translates the minted items back; a no-op when
 * the measured offset is zero. The pages that need it say so in a
 * margin note — the annual records the seam, it does not hide it.
 */
export async function reseat(
  ctx: PageContext,
  refs: Ref[],
  offset: [number, number],
): Promise<void> {
  if (refs.length === 0) return;
  if (offset[0] === 0 && offset[1] === 0) return;
  await ctx.doc.batch(
    refs.map((ref) => ({
      op: "setElementProperty",
      args: {
        elementId: ref,
        path: "frameTransform",
        value: {
          type: "transform",
          value: [1, 0, 0, 1, -offset[0], -offset[1]],
        },
      },
    })),
  );
}

/** The engine's anchor table for one element — STORED (spread-inner)
 *  coordinates, exactly as `requestPathAnchors` answers. */
export interface AnchorsRead {
  anchors: Array<{
    anchor: [number, number];
    left: [number, number];
    right: [number, number];
  }>;
  subpathStarts?: number[];
  subpathOpen?: boolean[];
}

export async function anchorsOf(
  ctx: PageContext,
  ref: Ref,
): Promise<AnchorsRead | null> {
  const payload = (await send(ctx, "requestPathAnchors", { id: ref })) as {
    result?: AnchorsRead | null;
  };
  return payload.result ?? null;
}

/** Read one typed property entry off an element (the journey idiom). */
export async function propOf(
  ctx: PageContext,
  ref: Ref,
  path: string,
): Promise<{ type: string; value?: unknown } | null> {
  return ctx.page.evaluate(
    async ({ ref, path }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries?: Array<{
                  path: string;
                  value?: { type: string; value?: unknown } | null;
                }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties(ref).catch(() => null);
      for (const entry of props?.entries ?? []) {
        if (entry.path === path) return entry.value ?? null;
      }
      return null;
    },
    { ref, path },
  );
}

/** Translate an element by (dx, dy) — a `frameTransform` REPLACE, so it
 *  is exact for elements that carry no transform (fresh inserts). */
export function translateOp(
  kind: string,
  id: string,
  dx: number,
  dy: number,
  scale = 1,
): { op: string; args: unknown } {
  return {
    op: "setElementProperty",
    args: {
      elementId: { kind, id },
      path: "frameTransform",
      value: { type: "transform", value: [scale, 0, 0, scale, dx, dy] },
    },
  };
}

/** Batch a list of translate/property ops as ONE undo step. */
export async function applyOps(
  doc: ShowcaseDoc,
  ops: Array<{ op: string; args: unknown }>,
): Promise<void> {
  if (ops.length > 0) await doc.batch(ops);
}
