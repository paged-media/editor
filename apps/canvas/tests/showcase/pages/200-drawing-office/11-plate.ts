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

// The image-trace plate — p86, D-Plate verso, and the chapter's close.
//
// A photograph goes INTO the document as inline bytes, the wasm tracer
// runs IN the editor (visioncortex through paged.draw's committed
// trace artifact — synchronous, CPU-bound, on the calling thread), and
// the traced regions come out as filled native polygons with real
// holes re-wound for the engine's non-zero fill. The plate the reader
// sees is the VECTOR result; the photograph itself leaves the page
// once its trace stands, which is the bluntest possible way to say
// "these are paths now".
//
// The chapter's last words are its INVENTORY: the `.paged` container
// parts paged.draw keeps its recipes in, listed from the document
// itself via the listPagedParts door — printed as prose, read, never
// assumed.

import { expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { withActivePage } from "../../active-page";
import { marginNote, plate, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, TRIM_W_PT, TRIM_H_PT, p } from "../../names-annual";
import { newRefs, settle, type Ref } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  corner,
  draw,
  listParts,
  path,
  polygons,
  reseat,
  spreadOffset,
  DRAW_PARTS_PREFIX,
} from "./00-support";

const PHOTO = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "assets",
  "photos",
  "pexels-1103970-curves.jpg",
);

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const page = p(86);
  const pageId = ctx.pageIds[0];
  const offset = await spreadOffset(ctx, pageId);

  const ink = await doc.swatch(SWATCH.ink);
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const layerContent = await doc.layerId(LAYER.content);

  // The plate field, edge to edge.
  const field = await plate(
    ctx,
    page,
    [0, 0, TRIM_W_PT, TRIM_H_PT],
    SWATCH.paperWarm,
    LAYER.background,
  );
  elements.push(field);

  // ── the photograph, into the document as bytes ───────────────────
  // 540×360 — the file's own 3:2, full width, no distortion (the
  // tracer stretches its result to the FRAME bounds, so the frame is
  // cut to the image's aspect on purpose).
  const frame = await doc.rectangle(pageId, [0, 120, 540, 480]);
  const placed = await ctx.page.evaluate(
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
      return { kind: reply.kind, bytes: bytes.length };
    },
    { frameId: frame, url: `/@fs${PHOTO}` },
  );
  ctx.doc.ledger?.record("replaceImageBytes", { elementId: frame });
  expect(placed.kind, "the photograph's bytes went inline").toBe(
    "mutationApplied",
  );
  // One render forces the engine's image build, which is the cache the
  // C-5 placed-asset door serves the tracer from.
  await doc.renderPage(page);

  // ── the trace ────────────────────────────────────────────────────
  const before = await polygons(ctx);
  await doc.select("rectangle", frame);
  await withActivePage(ctx.page, pageId, () =>
    draw(ctx, "imageTrace", {
      colorPrecision: 6,
      filterSpeckle: 4,
      layerDifference: 12,
      maxRegions: 96,
      maxTracePixels: 400_000,
    }),
  );
  const traced = await settle(
    ctx.page,
    async () => (await polygons(ctx)).length > before.length,
    90_000,
  );
  expect(traced, "the tracer minted vector regions").toBe(true);
  const regions = await newRefs(ctx.page, "polygon", before);
  await reseat(ctx, regions, offset);
  await doc.batch(
    regions.map((ref: Ref) => ({
      op: "setElementProperty",
      args: {
        elementId: ref,
        path: "itemLayer",
        value: { type: "text", value: layerContent },
      },
    })),
  );
  for (const ref of regions) elements.push(ref.id);
  // The photograph leaves; the plate is paths now.
  await doc.mutate("deleteFrame", { frameId: frame });

  // ── opacity mask, demonstrated and cleared ───────────────────────
  const run = <T,>(fn: () => Promise<T>): Promise<T> =>
    ctx.doc.ledger ? ctx.doc.ledger.transient(fn) : fn();
  let maskWorked = false;
  await run(async () => {
    const target = await path(
      ctx,
      pageId,
      [corner(60, 508), corner(150, 508), corner(150, 560), corner(60, 560)],
      false,
      { fill: vermilion },
    );
    const mask = await path(
      ctx,
      pageId,
      [corner(70, 500), corner(160, 520), corner(140, 568), corner(66, 552)],
      false,
      { fill: ink },
    );
    const count = (await polygons(ctx)).length;
    await doc.designer.selectElements([
      { kind: "polygon", id: target },
      { kind: "polygon", id: mask },
    ]);
    await draw(ctx, "makeOpacityMask", { maskType: "luminosity" });
    // The mask artwork leaves the page z-order while it masks — the
    // documented residual, and the honest completion signal.
    const masked = await settle(
      ctx.page,
      async () => (await polygons(ctx)).length === count - 1,
      10_000,
    );
    if (masked) {
      maskWorked = true;
      await draw(ctx, "releaseOpacityMask", {
        targetId: { kind: "polygon", id: target },
      });
      await settle(
        ctx.page,
        async () => (await polygons(ctx)).length === count,
        10_000,
      );
    } else {
      notes.push("the opacity-mask make did not take — recorded, not claimed");
    }
    await doc.batch([
      { op: "deleteFrame", args: { frameId: mask } },
      { op: "deleteFrame", args: { frameId: target } },
    ]);
  });

  // ── the chapter's holdings — the container-part inventory ────────
  const drawParts = (await listParts(ctx))
    .filter((path) => path.startsWith(DRAW_PARTS_PREFIX))
    .map((path) => path.slice(DRAW_PARTS_PREFIX.length))
    .sort();

  const capTitle = await proseFrame(ctx, page, [54, 500, 486, 534], [
    { text: "Plate: the machine trace", style: STYLE.head2 },
  ]);
  const caption = await proseFrame(ctx, page, [54, 540, 486, 612], [
    {
      text:
        `The band above is not a photograph. pexels-1103970 (a study in sand curves) went into the document as inline bytes, and paged.draw's imageTrace ran in-editor through the wasm tracer - colour clustering, boundary walking, spline fitting - minting ${regions.length} filled native polygons whose holes are re-wound for the engine's non-zero fill. The source image was then deleted; what prints, exports and re-edits is vector.`,
      style: STYLE.body,
    },
  ]);
  const inventory = await proseFrame(ctx, page, [54, 616, 486, 664], [
    {
      text:
        drawParts.length > 0
          ? `Chapter holdings, read from the container itself (listPagedParts): under paged/media.paged.draw/ this document now carries ${drawParts.join(", ")} - ${drawParts.length} recipe part(s), the drawing office's ledger of styles, symbols, fields, rings, blends, dots and painted faces.`
          : "Chapter holdings: the container reports no paged/media.paged.draw/ parts - every recipe this chapter minted was released before the close, and the inventory records that honestly.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(capTitle.frameId, caption.frameId, inventory.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 124",
      "imageTrace (wasm, in-editor)",
      "makeOpacityMask/release (transient)",
      "listPagedParts inventory",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "the trace is ONE-SHOT and fills-only (no live re-trace, no centreline strokes; registry row partial, demonstrated not claimed); its regions minted one page width off on this facing-spread verso and were re-homed by one transform batch; an opacity-mask release restacks the mask on TOP - only undo restores its exact z slot → Appendix A",
    ),
  );
  if (!maskWorked) {
    notes.push("plugin-draw.opacity-mask-commands not claimed on this run");
  }
  notes.push(
    "plugin-draw.image-trace is registry-partial — demonstrated as this plate, deliberately not claimed",
  );

  const covers = ["images-graphics.placed-images"];
  if (maskWorked) {
    covers.push(
      "plugin-draw.opacity-mask-commands",
      "effects-transparency.opacity-mask",
    );
  }

  return {
    title: "The image-trace plate",
    covers,
    elements,
    notes,
  };
}
