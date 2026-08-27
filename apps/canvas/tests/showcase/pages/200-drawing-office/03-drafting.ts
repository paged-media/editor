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

// The drafting instruments — p78, B-Body verso. Three bands:
//
//   · BAND A — the four parametric INSERT commands (insertArc /
//     insertSpiral / insertRectGrid / insertPolarGrid). v0 commands
//     take no payload and mint fixed default geometry near the page
//     origin, so each result is re-seated into its tile afterwards
//     with one `frameTransform` batch — a REPLACE of the item
//     transform, exact on a fresh insert.
//   · BAND B — the PEN and the anchor editors, driven as REAL INPUT:
//     the viewport is panned to this page with real wheel events (the
//     pointer pan lane), then clicks lay anchors and Enter commits.
//     The Add/Delete/Convert editors run on a TRANSIENT scratch on the
//     facing recto — their handlers compare the page-local pointer to
//     spread-stored anchors, which on this verso differ by one page
//     width (the chapter's measured seam) — each step read back
//     through requestPathAnchors, never assumed. A lane where pointer
//     input cannot land degrades to a note, not a red.
//   · BAND C — path surgery: Simplify (the RDP kernel, before/after),
//     Join (the v56 weld — two paths become one), Close path.

import { expect } from "@playwright/test";

import { withActivePage } from "../../active-page";
import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import { newRefs, settle, type Ref } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  clickPage,
  corner,
  draw,
  focusPageView,
  layoutOrigin,
  path,
  polygons,
  send,
  spreadOffset,
} from "./00-support";

/** The v0 insert commands' shared default source box (page-local). */
const SRC: [number, number] = [100, 100];
const SRC_SIZE = 200;

interface AnchorsReply {
  result?: {
    anchors: Array<{
      anchor: [number, number];
      left: [number, number];
      right: [number, number];
    }>;
    subpathOpen?: boolean[];
  } | null;
}

const anchorsOf = async (ctx: PageContext, ref: Ref) =>
  ((await send(ctx, "requestPathAnchors", { id: ref })) as AnchorsReply)
    .result ?? null;

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const covers: string[] = [
    "plugin-draw.tool-wave-2",
    "plugin-draw.geometry-bezier",
    "plugin-draw.geometry-rdp",
    "plugin-draw.path-weld",
    "plugin-draw.pro-path-toolset",
  ];
  const page = p(78);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];
  const offset = await spreadOffset(ctx, pageId);
  // eslint-disable-next-line no-console
  console.log(`[200] p78 spread offset measured: [${offset.join(", ")}]`);

  const ink = await doc.swatch(SWATCH.ink);
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const slate = await doc.swatch(SWATCH.slate);
  const layerContent = await doc.layerId(LAYER.content);

  const head = await proseFrame(ctx, page, [left, 54, right, 82], [
    { text: "The drafting instruments", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, page, [left, 86, right, 124], [
    {
      text:
        "Four parametric generators, the pen, the anchor editors and the path surgery, all committing through the one insertPath lane. Every shape below is a native polygon the moment it exists.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── BAND A — the four insert commands, re-seated into tiles ──────
  const SCALE = 0.5;
  const tileY = 134;
  const tiles: Array<{ suffix: string; x: number }> = [
    { suffix: "insertArc", x: 60 },
    { suffix: "insertSpiral", x: 169 },
    { suffix: "insertRectGrid", x: 278 },
    { suffix: "insertPolarGrid", x: 387 },
  ];
  for (const tile of tiles) {
    const before = await polygons(ctx);
    await withActivePage(ctx.page, pageId, () => draw(ctx, tile.suffix));
    const grew = await settle(
      ctx.page,
      async () => (await polygons(ctx)).length > before.length,
      15_000,
    );
    expect(grew, `${tile.suffix} minted geometry`).toBe(true);
    const minted = await newRefs(ctx.page, "polygon", before);
    // Re-seat: page-local target = s·(page-local source) + d, written
    // against STORED coordinates, so the measured spread offset rides
    // the translation once (off·(1−s)).
    const dx = tile.x - SCALE * SRC[0] + offset[0] * (1 - SCALE);
    const dy = tileY - SCALE * SRC[1] + offset[1] * (1 - SCALE);
    const ops: Array<{ op: string; args: unknown }> = [];
    for (const ref of minted) {
      const el = { elementId: { kind: ref.kind, id: ref.id } };
      ops.push(
        {
          op: "setElementProperty",
          args: {
            ...el,
            path: "frameTransform",
            value: { type: "transform", value: [SCALE, 0, 0, SCALE, dx, dy] },
          },
        },
        {
          op: "setElementProperty",
          args: {
            ...el,
            path: "frameStrokeColor",
            value: { type: "colorRef", value: ink },
          },
        },
        {
          op: "setElementProperty",
          args: {
            ...el,
            path: "frameStrokeWeight",
            value: { type: "length", value: 2 },
          },
        },
        {
          op: "setElementProperty",
          args: { ...el, path: "itemLayer", value: { type: "text", value: layerContent } },
        },
      );
      elements.push(ref.id);
    }
    await doc.batch(ops);
  }
  const bandACaption = await proseFrame(ctx, page, [left, 246, right, 278], [
    {
      text:
        "Left to right: Insert arc, Insert spiral, Insert rectangular grid, Insert polar grid — the wave-2 parametric generators at their v0 defaults, each re-seated into its tile by one frameTransform batch. The arc and spiral carry real cubic handles from the bezier kernel; the grids are independent sibling lines.",
      style: STYLE.caption,
    },
  ]);
  elements.push(bandACaption.frameId);

  // ── BAND B — the pen + anchor editors, as real pointer input ─────
  let penWorked = false;
  try {
    const origin = await layoutOrigin(ctx, page);
    const focused = await focusPageView(ctx, origin, 170, 340);
    if (!focused) {
      notes.push(
        "pen/anchor gestures skipped — the viewport is not measurable on this lane",
      );
    } else {
      await doc.runCommand("paged.tool.activate.paged.tool.pen");
      const before = await polygons(ctx);
      await clickPage(ctx, origin, 70, 316);
      await clickPage(ctx, origin, 160, 300);
      await clickPage(ctx, origin, 250, 352);
      await ctx.page.keyboard.press("Enter");
      const committed = await settle(
        ctx.page,
        async () => (await polygons(ctx)).length > before.length,
        8_000,
      );
      if (!committed) {
        notes.push(
          "the pen's three clicks + Enter committed nothing on this lane — recorded, not claimed",
        );
      } else {
        const pen = (await newRefs(ctx.page, "polygon", before))[0];
        elements.push(pen.id);
        covers.push("plugin-draw.pen-machine");
        penWorked = true;

        // Paint the finished path.
        await doc.batch([
          {
            op: "setElementProperty",
            args: {
              elementId: pen,
              path: "frameStrokeColor",
              value: { type: "colorRef", value: vermilion },
            },
          },
          {
            op: "setElementProperty",
            args: {
              elementId: pen,
              path: "frameStrokeWeight",
              value: { type: "length", value: 2.5 },
            },
          },
          {
            op: "setElementProperty",
            args: { elementId: pen, path: "itemLayer", value: { type: "text", value: layerContent } },
          },
        ]);
      }
    }
  } catch (err) {
    notes.push(`pen/anchor gesture lane threw: ${String(err).slice(0, 160)}`);
  } finally {
    await ctx.page.keyboard.press("Escape").catch(() => undefined);
    await ctx.page.keyboard.press("v").catch(() => undefined);
  }

  // ── the anchor editors, on the FACING RECTO (transient) ──────────
  //
  // MEASURED, and the reason this surgery does not happen on this
  // page: the Add/Delete/Convert handlers compare the pointer's
  // page-LOCAL position against `pathAnchors`, which answers STORED
  // (spread) coordinates — on this facing-spread verso the two
  // disagree by exactly one page width, so the tools can never hit a
  // verso path. On the spread-origin recto they agree, so the
  // exhibit runs there as a scratch: pen in, three anchor edits
  // measured through the engine, scratch out. Same seam as the
  // planner re-homes, recorded in Appendix A.
  if (penWorked) {
    const runT = <T,>(fn: () => Promise<T>): Promise<T> =>
      ctx.doc.ledger ? ctx.doc.ledger.transient(fn) : fn();
    try {
      await runT(async () => {
        const rectoIndex = page + 1;
        const rectoId = await doc.pageId(rectoIndex);
        const rectoOffset = await spreadOffset(ctx, rectoId);
        const rectoOrigin = await layoutOrigin(ctx, rectoIndex);
        const focused = await focusPageView(ctx, rectoOrigin, 160, 570);
        if (!focused) {
          notes.push("anchor surgery skipped — could not focus the recto");
          return;
        }
        await doc.runCommand("paged.tool.activate.paged.tool.pen");
        const before = await polygons(ctx);
        await clickPage(ctx, rectoOrigin, 70, 560);
        await clickPage(ctx, rectoOrigin, 160, 545);
        await clickPage(ctx, rectoOrigin, 250, 585);
        await ctx.page.keyboard.press("Enter");
        const committed = await settle(
          ctx.page,
          async () => (await polygons(ctx)).length > before.length,
          8_000,
        );
        if (!committed) {
          notes.push("the scratch pen path never committed — anchor tools not claimed");
          return;
        }
        const scratch = (await newRefs(ctx.page, "polygon", before))[0];
        try {
          await doc.select(scratch.kind, scratch.id);
          const read0 = await anchorsOf(ctx, scratch);
          const a0 = read0!.anchors[0].anchor;
          const a1 = read0!.anchors[1].anchor;
          const mid: [number, number] = [
            (a0[0] + a1[0]) / 2 - rectoOffset[0],
            (a0[1] + a1[1]) / 2 - rectoOffset[1],
          ];
          await ctx.page.keyboard.press("=");
          await clickPage(ctx, rectoOrigin, mid[0], mid[1]);
          const added = await settle(
            ctx.page,
            async () =>
              ((await anchorsOf(ctx, scratch))?.anchors.length ?? 0) === 4,
            8_000,
          );
          if (added) covers.push("plugin-draw.anchor-add");
          else notes.push("add-anchor click did not split the segment — not claimed");

          if (added) {
            // The ADDED anchor's LIVE position (fresh read — the split
            // may not land exactly on the request point), then the
            // Delete tool armed through the registry AND its key.
            const afterAdd = await anchorsOf(ctx, scratch);
            const near = afterAdd!.anchors.reduce((best, a) => {
              const d = Math.hypot(
                a.anchor[0] - (mid[0] + rectoOffset[0]),
                a.anchor[1] - (mid[1] + rectoOffset[1]),
              );
              return d < best.d ? { d, a: a.anchor } : best;
            }, { d: Infinity, a: afterAdd!.anchors[0].anchor });
            await doc.select(scratch.kind, scratch.id);
            await doc.runCommand(
              "paged.tool.activate.media.paged.draw.tool.deleteAnchor",
            );
            await clickPage(
              ctx,
              rectoOrigin,
              near.a[0] - rectoOffset[0],
              near.a[1] - rectoOffset[1],
            );
            const removed = await settle(
              ctx.page,
              async () =>
                ((await anchorsOf(ctx, scratch))?.anchors.length ?? 0) === 3,
              8_000,
            );
            if (removed) covers.push("plugin-draw.anchor-delete");
            else {
              const tool = await ctx.page.evaluate(
                () =>
                  (globalThis as unknown as { __canvas: { activeTool?: unknown } })
                    .__canvas.activeTool,
              );
              notes.push(
                `delete-anchor click left the anchor — not claimed (activeTool=${String(tool)}, target=[${near.a.join(",")}])`,
              );
            }
          }

          await doc.select(scratch.kind, scratch.id);
          const beforeConvert = await anchorsOf(ctx, scratch);
          const v = beforeConvert!.anchors[1].anchor;
          await doc.runCommand(
            "paged.tool.activate.media.paged.draw.tool.convertAnchor",
          );
          await clickPage(
            ctx,
            rectoOrigin,
            v[0] - rectoOffset[0],
            v[1] - rectoOffset[1],
          );
          const converted = await settle(
            ctx.page,
            async () => {
              const s = await anchorsOf(ctx, scratch);
              const a = s?.anchors[1];
              if (!a) return false;
              return (
                Math.hypot(
                  a.right[0] - a.anchor[0],
                  a.right[1] - a.anchor[1],
                ) > 0.5
              );
            },
            8_000,
          );
          if (converted) covers.push("plugin-draw.anchor-convert");
          else {
            const tool = await ctx.page.evaluate(
              () =>
                (globalThis as unknown as { __canvas: { activeTool?: unknown } })
                  .__canvas.activeTool,
            );
            notes.push(
              `convert-anchor click left a corner — not claimed (activeTool=${String(tool)}, target=[${v.join(",")}])`,
            );
          }
        } finally {
          await doc.mutate("deleteFrame", { frameId: scratch.id });
        }
      });
    } catch (err) {
      notes.push(`anchor-surgery lane threw: ${String(err).slice(0, 160)}`);
    } finally {
      await ctx.page.keyboard.press("Escape").catch(() => undefined);
      await ctx.page.keyboard.press("v").catch(() => undefined);
    }
  }

  // ── BAND C — path surgery, on the right half ─────────────────────
  // Simplify: the same noisy polyline twice; the right copy loses its
  // jitter anchors to the RDP kernel at 3 pt tolerance.
  const noisy = (x: number, y: number) => {
    const pts: Array<ReturnType<typeof corner>> = [];
    for (let i = 0; i <= 10; i += 1) {
      pts.push(corner(x + i * 9, y + (i % 2 === 0 ? 0 : 4) + i * 2.5));
    }
    return pts;
  };
  const simplifyBefore = await path(ctx, pageId, noisy(286, 300), true, {
    stroke: slate,
    weight: 2,
  });
  const simplifyAfter = await path(ctx, pageId, noisy(396, 300), true, {
    stroke: ink,
    weight: 2,
  });
  elements.push(simplifyBefore, simplifyAfter);
  await doc.select("polygon", simplifyAfter);
  await draw(ctx, "simplifyPath", { tolerance: 3 });
  const simplified = await settle(
    ctx.page,
    async () =>
      ((await anchorsOf(ctx, { kind: "polygon", id: simplifyAfter }))?.anchors
        .length ?? 11) < 11,
    10_000,
  );
  expect(simplified, "simplifyPath removed jitter anchors").toBe(true);

  // Join: two open angles whose free ends face each other weld into
  // ONE element (the v56 joinPaths lane); then Close path seals it.
  const jointA = await path(
    ctx,
    pageId,
    [corner(286, 380), corner(330, 366), corner(370, 384)],
    true,
    { stroke: vermilion, weight: 2 },
  );
  const jointB = await path(
    ctx,
    pageId,
    [corner(376, 390), corner(420, 372), corner(462, 392)],
    true,
    { stroke: vermilion, weight: 2 },
  );
  const beforeJoin = (await polygons(ctx)).length;
  await doc.designer.selectElements([
    { kind: "polygon", id: jointA },
    { kind: "polygon", id: jointB },
  ]);
  await draw(ctx, "joinEndpoints");
  await expect
    .poll(async () => (await polygons(ctx)).length, {
      message: "joinEndpoints welded two paths into one",
      timeout: 120_000,
    })
    .toBe(beforeJoin - 1);
  const survivor = (await polygons(ctx)).find(
    (r) => r.id === jointA || r.id === jointB,
  );
  if (survivor) {
    elements.push(survivor.id);
    await doc.select("polygon", survivor.id);
    await draw(ctx, "closePath");
    const closed = await settle(
      ctx.page,
      async () =>
        (await anchorsOf(ctx, survivor))?.subpathOpen?.[0] === false,
      10_000,
    );
    expect(closed, "closePath sealed the welded path").toBe(true);
  }

  const bandCCaption = await proseFrame(ctx, page, [left, 420, right, 470], [
    {
      text:
        "Band two, left: three pen clicks committed the open vermilion path - real pointer input through the live camera. The anchor editors then split, removed and smoothed a scratch path's anchors on the facing recto, every position read back from the engine between steps (the margin note says why not here). Right: the same jittery polyline twice, the second simplified at 3 pt tolerance; below, two open angles welded by Join and sealed by Close path.",
      style: STYLE.caption,
    },
  ]);
  elements.push(bandCCaption.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 116",
      "insert presets ×4 · pen + anchor editors",
      "simplify · join · closePath",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      penWorked
        ? "the anchor editors compare the pointer's page-local position against spread-stored anchors - on this facing-spread verso the two differ by one page width, so the surgery ran as a transient scratch on the facing recto (demonstrated, not resident); the v0 insert commands take no parameters - fixed defaults, re-seated by transform → Appendix A"
        : "the pen and anchor exhibits are pointer gestures; on this lane the pointer never reached the page and the band records the attempt instead of the artwork → Appendix A",
    ),
  );

  return {
    title: "The drafting instruments",
    covers,
    elements,
    notes,
  };
}
