/*
 * This file is part of paged (https://paged.media).
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

// C-32 — the host Eyedropper: click a page → sample the COMPOSITED
// pixel → that colour becomes the document's default fill, and the
// fill of anything selected.
//
// The ruling and why colour is host vocabulary are argued in
// `eyedropper-sample.ts`; the arithmetic lives there too. This file is
// only the wiring: pointer → snapshot → pixel → mutations.
//
// HOW THE PIXEL IS OBTAINED, and its honest cost. There is no
// raster-readback door: the page renders to an `OffscreenCanvas` inside
// the worker, so the main thread cannot `getImageData` it. What DOES
// exist is `requestSnapshot(pageId, targetWidthPx)` — the navigator's
// PNG path. So a sample is one page re-render, decoded here, read at
// one pixel. That is heavy for a per-pixel API and perfectly fine for a
// CLICK, which is the only gesture this tool has. If a future
// eyedropper wants a live hover preview, the right fix is a real
// readback door, not calling this in a loop.
//
// SAMPLE_WIDTH_PX fixes the snapshot's resolution so the sample does
// not silently change with zoom. It is deliberately near print-ish
// density rather than screen: sampling a 1-pixel hairline is more
// faithful at higher density, and the cost is one render either way.
//
// WHY A SWATCH AND NOT A RAW COLOUR. `frameFillColor` and the document
// defaults both address a document RESOURCE by id, not an RGB triple —
// that is IDML's model, not a limitation of the door. So a sample must
// resolve to a swatch, which means find-or-create. The name is a total
// function of the RGB value (`R=12 G=34 B=56`, InDesign's own
// convention), so sampling the same pixel twice reuses one swatch
// instead of growing the document on every click.

import type {
  CanvasPointerEvent,
  GestureHandler,
  PagedEditor,
} from "@paged-media/shell";

import {
  planApply,
  snapshotPixelFor,
  swatchSpecFor,
  type SampledRgb,
  type SwatchLike,
} from "./eyedropper-sample";
import { CLICK_DRAG_THRESHOLD_PX } from "./shared";

/** Snapshot density for a sample. Independent of zoom on purpose — see
 *  the header. */
const SAMPLE_WIDTH_PX = 1024;

/** Decode PNG bytes and read one pixel. Returns null in any realm that
 *  lacks the imaging primitives (Node test runners, notably) rather
 *  than throwing — the tool then no-ops, which is the honest outcome
 *  when the host genuinely cannot see its own pixels. */
async function readPixel(
  png: Uint8Array,
  x: number,
  y: number,
): Promise<SampledRgb | null> {
  if (
    typeof createImageBitmap !== "function" ||
    typeof OffscreenCanvas !== "function"
  ) {
    return null;
  }
  const blob = new Blob([png as BlobPart], { type: "image/png" });
  const bitmap = await createImageBitmap(blob);
  try {
    const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = surface.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const d = ctx.getImageData(x, y, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  } finally {
    bitmap.close();
  }
}

export function createEyedropperHandler(): GestureHandler {
  let paged: PagedEditor | null = null;
  // Guards re-entry: a sample is async and a user can click again
  // before the snapshot lands. Without this, two clicks race to create
  // the same swatch and one of them loses.
  let sampling = false;

  const sampleAt = async (e: CanvasPointerEvent) => {
    if (!paged || sampling) return;
    // Off-page: the pasteboard has nothing composited to sample.
    if (!e.pageId || !e.pagePoint) return;
    sampling = true;
    const editor = paged;
    const client = editor.client;
    try {
      const pages = await client
        .collection<{ selfId: string; sizePt: [number, number] }>("pages")
        .catch(() => [] as readonly { selfId: string; sizePt: [number, number] }[]);
      const page = pages.find((p) => p.selfId === e.pageId);
      if (!page) return;

      const shot = await client
        .requestSnapshot(e.pageId, SAMPLE_WIDTH_PX)
        .catch(() => null);
      if (!shot) return;
      const px = snapshotPixelFor(
        e.pagePoint,
        page.sizePt[0],
        shot.widthPx,
        shot.heightPx,
      );
      if (!px) return;
      const rgb = await readPixel(
        Uint8Array.from(shot.pngBytes),
        px[0],
        px[1],
      ).catch(() => null);
      if (!rgb) return;

      const swatches = await client
        .collection<SwatchLike>("swatches")
        .catch(() => [] as readonly SwatchLike[]);
      const plan = planApply(rgb, swatches, editor.selection.elementSelection);

      // Create first if needed: the swatch has to EXIST before anything
      // can reference it, and its id is only knowable by reading back —
      // `createSwatch` mints a document resource, not an element, so it
      // does not come back on `created_id`.
      if (plan.needsSwatch) {
        await client.mutate({
          op: "createSwatch",
          args: { spec: swatchSpecFor(rgb) },
        } as never);
      }
      const after = plan.needsSwatch
        ? await client
            .collection<SwatchLike>("swatches")
            .catch(() => [] as readonly SwatchLike[])
        : swatches;
      const swatchId = after.find((s) => s.name === plan.swatchName)?.selfId;
      if (!swatchId) return;

      // One batch → one undo step for the visible change. The swatch
      // creation above is its own step by necessity; that matches how
      // every other swatch-minting flow in the editor behaves.
      //
      // The stroke half of the triple is READ BACK and written
      // unchanged: `setDocumentDefaults` sets all three, so passing
      // null would silently clear the user's default stroke as a side
      // effect of sampling a fill.
      const meta = await client.documentMeta().catch(() => null);
      const ops: unknown[] = [
        {
          op: "setDocumentDefaults",
          args: {
            fillColor: swatchId,
            strokeColor: meta?.defaultStrokeColor ?? null,
            strokeWeight: meta?.defaultStrokeWeight ?? null,
          },
        },
        ...plan.targets.map((elementId) => ({
          op: "setElementProperty",
          args: {
            elementId,
            path: "frameFillColor",
            value: { type: "colorRef", value: swatchId },
          },
        })),
      ];
      await client.mutate(
        ops.length === 1 ? (ops[0] as never) : ({ op: "batch", args: { ops } } as never),
      );
    } finally {
      sampling = false;
    }
  };

  return {
    onActivate(p) {
      paged = p;
    },
    onDeactivate() {
      paged = null;
      sampling = false;
    },
    onPointerDown() {
      /* sampling happens on release, so a drag can be rejected */
    },
    onPointerMove() {},
    onPointerUp(e) {
      // A drag is not a sample. Same click-vs-drag rule the other
      // click tools use, so the gesture reads consistently.
      if (e.maxDelta > CLICK_DRAG_THRESHOLD_PX) return;
      void sampleAt(e);
    },
  };
}
