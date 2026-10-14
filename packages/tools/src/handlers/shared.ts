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

// Editor-ops — bookkeeping every drawing-tool handler repeats: the
// page-anchored drag (both endpoints resolved against the START page
// so the result is correct even when the pointer is released over
// another page or the pasteboard — the Rectangle handler's rule),
// post-mutate selection of the created element, and the quiet
// mutationFailed warning.

import type {
  CanvasPointerEvent,
  PagedEditor,
} from "@paged-media/shell";
import type { ElementId, Mutation } from "@paged-media/client";

export const CLICK_DRAG_THRESHOLD_PX = 4;

/** A drag anchored to the page under the pointer at pointer-down. */
export interface PageDrag {
  pageId: string;
  /** Page origin in document pt (docPoint − pagePoint at down). */
  pageOrigin: [number, number];
  /** Pointer-down position in page-local pt. */
  startLocal: [number, number];
}

export function beginPageDrag(e: CanvasPointerEvent): PageDrag | null {
  if (e.button !== 0 || !e.pageId || !e.pagePoint) return null;
  return {
    pageId: e.pageId,
    pageOrigin: [
      e.docPoint[0] - e.pagePoint[0],
      e.docPoint[1] - e.pagePoint[1],
    ],
    startLocal: e.pagePoint,
  };
}

/** Current pointer position in the START page's local coordinates. */
export function endLocalFor(
  drag: PageDrag,
  e: CanvasPointerEvent,
): [number, number] {
  return [e.docPoint[0] - drag.pageOrigin[0], e.docPoint[1] - drag.pageOrigin[1]];
}

/** `[top, left, bottom, right]` page-local bounds. */
export type Bounds = [number, number, number, number];

/**
 * Resolve a drag's bounds for the shape-drawing tools (Ellipse,
 * Polygon — the rubber-band rect of the Rectangle tool, modifier-aware).
 *
 * The base rule is the Rectangle handler's: bounds = normalized(start,
 * end) (DR-01 — a negative drag normalizes). Two modifiers layer on top,
 * each a pure function of the CURRENT sample (INV-5 — no latched state):
 *   - Shift → constrain to a square: the larger of |dx|,|dy| on both
 *     axes, the square anchored at the start corner (DR-02), the sign of
 *     each axis preserved so it grows toward the pointer.
 *   - Alt   → draw from centre: `start` is the centre, the half-extent
 *     mirrors to the opposite side (DR-03). Composes with Shift (the
 *     square is centred on `start`).
 */
export function drawBoundsFor(
  start: [number, number],
  end: [number, number],
  mods: { shift: boolean; alt: boolean },
): Bounds {
  let dx = end[0] - start[0];
  let dy = end[1] - start[1];
  if (mods.shift) {
    // Square: the max extent on both axes, each keeping its own sign so
    // the square tracks the drag quadrant.
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * m;
    dy = Math.sign(dy || 1) * m;
  }
  let left: number;
  let right: number;
  let top: number;
  let bottom: number;
  if (mods.alt) {
    // Centre = start; the extent mirrors to both sides.
    left = start[0] - Math.abs(dx);
    right = start[0] + Math.abs(dx);
    top = start[1] - Math.abs(dy);
    bottom = start[1] + Math.abs(dy);
  } else {
    left = Math.min(start[0], start[0] + dx);
    right = Math.max(start[0], start[0] + dx);
    top = Math.min(start[1], start[1] + dy);
    bottom = Math.max(start[1], start[1] + dy);
  }
  return [top, left, bottom, right];
}

/**
 * Standard inter-cell gutter for gridify (DR-05/DR-06), in pt. InDesign's
 * default column/row gutter is 1 pica = 12 pt; we use the same so a
 * gridified draw reads like a default InDesign multi-column layout. A
 * fixed constant (not zoom-scaled): the gutter is document geometry, the
 * gap baked into every committed cell, not screen chrome.
 */
export const GRIDIFY_GUTTER_PT = 12;

/**
 * Split a drag's `[top,left,bottom,right]` bounds into a `cols × rows`
 * grid of equal cells separated by `gutter` pt (DR-05). The outer
 * envelope stays fixed at `bounds`; the gutters eat into it, so each
 * cell is `(width − (cols−1)·gutter) / cols` wide and the analogous
 * height. Cells walk row-major (left→right, top→bottom) — the order the
 * batch commits and the preview draws them.
 *
 * A 1×1 grid returns the single bounds unchanged (DR-07: keys back to
 * 1×1 ⇒ one plain frame, no residual grid). When the gutters would
 * collapse a cell to ≤ 0 the gutter is dropped to 0 for that axis, so a
 * tight drag still yields touching cells rather than inverted bounds.
 */
export function gridCellsFor(
  bounds: Bounds,
  cols: number,
  rows: number,
  gutter: number,
): Bounds[] {
  const [top, left, bottom, right] = bounds;
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  if (c === 1 && r === 1) return [bounds];
  const totalW = right - left;
  const totalH = bottom - top;
  // Drop the gutter on an axis when it would leave no room for the cells
  // (a very tight drag); cells then touch instead of inverting.
  const gx = c > 1 && gutter * (c - 1) < totalW ? gutter : 0;
  const gy = r > 1 && gutter * (r - 1) < totalH ? gutter : 0;
  const cellW = (totalW - gx * (c - 1)) / c;
  const cellH = (totalH - gy * (r - 1)) / r;
  const cells: Bounds[] = [];
  for (let row = 0; row < r; row++) {
    const cellTop = top + row * (cellH + gy);
    for (let col = 0; col < c; col++) {
      const cellLeft = left + col * (cellW + gx);
      cells.push([cellTop, cellLeft, cellTop + cellH, cellLeft + cellW]);
    }
  }
  return cells;
}

// ── The graphic default ─────────────────────────────────────────────
//
// InDesign draws a tool-made shape in its `[Normal Graphics Frame]`
// object style: no fill, a 1 pt `Color/Black` stroke. The engine's
// document defaults (`setDocumentDefaults`) feed every insert and start
// unset, so a shape drawn in a new document came out with no paint at
// all — invisible. Changing those defaults is not the fix: File ▸ Place,
// plugin output (chart bars, barcode bars, web frames) and scripts mint
// through the same inserts and would all gain an outline, which InDesign
// does not give them either. So the DRAWING TOOLS paint their own shape,
// in the same batch as the insert (one undo step), and only while the
// document has no defaults of its own: once the user has set any, the
// engine already applies them and they win.

/** A shape's paint: swatch refs (`null` = none) and a stroke weight. */
export interface GraphicPaint {
  fill: string | null;
  stroke: string | null;
  strokeWeight: number | null;
}

/** The style InDesign applies to a shape drawn with a tool. */
export const NORMAL_GRAPHICS_FRAME_STYLE = "ObjectStyle/$ID/[Normal Graphics Frame]";

/** `[Normal Graphics Frame]` as InDesign ships it — what a document
 *  without that style (one made with File ▸ New) gets. */
export const INDESIGN_GRAPHIC_PAINT: GraphicPaint = {
  fill: null,
  stroke: "Color/Black",
  strokeWeight: 1,
};

type Client = PagedEditor["client"];

/** The document's own `[Normal Graphics Frame]`, when it has one. */
async function normalGraphicsFramePaint(client: Client): Promise<GraphicPaint | null> {
  const reply = await client.send({
    kind: "requestStyleProperties",
    payload: { collection: "object", styleId: NORMAL_GRAPHICS_FRAME_STYLE },
  });
  if (reply.kind !== "styleProperties" || !reply.payload.result) return null;
  const entry = (path: string) =>
    reply.payload.result?.entries.find((e) => e.path === path)?.value ?? null;
  const fill = entry("frameFillColor");
  const stroke = entry("frameStrokeColor");
  const weight = entry("frameStrokeWeight");
  return {
    fill: fill?.type === "colorRef" ? fill.value : null,
    stroke: stroke?.type === "colorRef" ? stroke.value : null,
    strokeWeight: weight?.type === "length" ? weight.value : null,
  };
}

/**
 * The paint a drawing tool gives its new shape, or `null` when the
 * document has defaults of its own (the engine paints the shape with
 * them; adding ours would override the user's choice).
 */
export async function graphicPaintFor(client: Client): Promise<GraphicPaint | null> {
  const [meta, style] = await Promise.all([
    client.documentMeta().catch(() => null),
    normalGraphicsFramePaint(client).catch(() => null),
  ]);
  if (
    meta &&
    (meta.defaultFillColor != null ||
      meta.defaultStrokeColor != null ||
      meta.defaultStrokeWeight != null)
  ) {
    return null;
  }
  return style ?? INDESIGN_GRAPHIC_PAINT;
}

type InsertOp = Extract<
  Mutation,
  { op: "insertFrame" | "insertOval" | "insertLine" | "insertPath" }
>;

const KIND_OF: Record<InsertOp["op"], "rectangle" | "oval" | "graphicLine" | "polygon"> = {
  insertFrame: "rectangle",
  insertOval: "oval",
  insertLine: "graphicLine",
  insertPath: "polygon",
};

function isShapeInsert(m: Mutation): m is InsertOp {
  return m.op in KIND_OF;
}

/** The property writes that paint the shape the batch minted last
 *  (`$created`). A `null` fill is skipped: an insert with no document
 *  defaults already has none. A line never gets a fill. */
function paintOps(kind: InsertOp["op"], paint: GraphicPaint): Mutation[] {
  const elementId = { kind: KIND_OF[kind], id: "$created" } as ElementId;
  const ops: Mutation[] = [];
  if (paint.fill !== null && kind !== "insertLine") {
    ops.push({
      op: "setElementProperty",
      args: { elementId, path: "frameFillColor", value: { type: "colorRef", value: paint.fill } },
    });
  }
  if (paint.stroke !== null) {
    ops.push({
      op: "setElementProperty",
      args: { elementId, path: "frameStrokeColor", value: { type: "colorRef", value: paint.stroke } },
    });
    if (paint.strokeWeight !== null) {
      ops.push({
        op: "setElementProperty",
        args: {
          elementId,
          path: "frameStrokeWeight",
          value: { type: "length", value: paint.strokeWeight },
        },
      });
    }
  }
  return ops;
}

/**
 * `mutation` with `paint` applied to every shape it inserts, as ONE
 * batch. Each insert is followed by its own property writes, so
 * `$created` (the batch's most recent insert) names that shape — a
 * gridified rectangle paints every cell. Anything else in a batch (the
 * pencil's variable-width outline) keeps its place after the paint.
 */
export function withGraphicPaint(mutation: Mutation, paint: GraphicPaint | null): Mutation {
  if (!paint) return mutation;
  const children = mutation.op === "batch" ? mutation.args.ops : [mutation];
  const ops: Mutation[] = [];
  let painted = false;
  for (const child of children) {
    ops.push(child);
    if (isShapeInsert(child)) {
      const extra = paintOps(child.op, paint);
      painted ||= extra.length > 0;
      ops.push(...extra);
    }
  }
  return painted ? { op: "batch", args: { ops } } : mutation;
}

/** What a shape-drawing handler makes. A SHAPE tool's shape wears the
 *  graphic default; a FRAME tool's frame (Rectangle / Ellipse / Polygon
 *  Frame) is a placeholder for an image or text and stays unpainted, as
 *  InDesign leaves it, so a photo placed into it later is not outlined. */
export interface DrawHandlerOptions {
  frame?: boolean;
}

/**
 * {@link mutateAndSelect} for a shape a drawing tool made: the shape
 * wears the graphic default ({@link graphicPaintFor}) from the moment
 * it exists, in the same undo step as the insert.
 */
export async function mutateGraphicAndSelect(
  paged: PagedEditor,
  mutation: Mutation,
  label: string,
  onRefused?: (reply: MutateReply) => void,
): Promise<MutateReply | null> {
  const paint = await graphicPaintFor(paged.client).catch(() => null);
  return mutateAndSelect(paged, withGraphicPaint(mutation, paint), label, onRefused);
}

/** The worker reply `mutate` resolves with (refusals RESOLVE as
 *  `mutationFailed` — they never reject). */
export type MutateReply = Awaited<
  ReturnType<PagedEditor["client"]["mutate"]>
>;

/**
 * Fire a mutation, warn on `mutationFailed`, and select the element
 * the engine reports as created (protocol v24's `createdId`) so the
 * fresh shape immediately carries selection chrome — the post-insert
 * flow InDesign users expect.
 *
 * Returns the worker reply (or `null` on a transport error) so a
 * caller that needs the outcome — the `paged.insert.*` command layer
 * reports refusals to the Problems panel rather than the console —
 * can inspect it; `onRefused` fires on `mutationFailed` for callers
 * that route the refusal to a user-visible channel. Both are additive:
 * the drawing-tool handlers ignore them.
 */
export function mutateAndSelect(
  paged: PagedEditor,
  mutation: Parameters<PagedEditor["client"]["mutate"]>[0],
  label: string,
  onRefused?: (reply: MutateReply) => void,
): Promise<MutateReply | null> {
  return paged.client
    .mutate(mutation)
    .then((reply) => {
      if (reply.kind === "mutationFailed") {
        // eslint-disable-next-line no-console
        console.warn(
          `${label} rejected by engine:`,
          JSON.stringify((reply as { payload?: unknown }).payload),
        );
        onRefused?.(reply);
        return reply;
      }
      if (reply.kind !== "mutationApplied") return reply;
      const created = reply.payload.createdId ?? null;
      if (!created) return reply;
      return paged.client
        .setElementSelection([created], "replace")
        .then((ids) => {
          paged.selection.setElementSelection(ids);
          return paged.client.elementGeometry(ids);
        })
        .then((items) => {
          paged.selection.setElementGeometry(items);
          return reply;
        })
        .catch(() => reply);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`${label} failed:`, err);
      return null;
    });
}

/**
 * Pixel tolerance converted to document pt at the current zoom, so
 * hit radii feel constant on screen. Falls back to 1:1 when the
 * camera hasn't initialised (scale 0).
 *
 * Reads the LIVE camera — the shared buffer the worker renders from —
 * not `paged.camera`. A handler keeps the `PagedEditor` it was
 * activated with, and that object is one render's snapshot: its camera
 * is the zoom at the moment the tool was picked, so a tolerance taken
 * from it stops tracking the first time the user zooms with the tool
 * in hand.
 */
export function pxToPt(paged: PagedEditor, px: number): number {
  const live = paged.client.camera.read().scale;
  const scale = live > 0 ? live : paged.camera.camera.scale;
  return px / (scale > 0 ? scale : 1);
}
