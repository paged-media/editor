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

// Shape Builder + Live Paint — p80, B-Body verso.
//
// SHAPE BUILDER is a GESTURE: drag across overlapping filled shapes and
// the tool sweeps whole elements (the honest B-22 subset), committing
// ONE pathfinderBoolean union on pointer-up. The exhibit drives the
// real pointer through the camera pointed at this page; a lane where
// the drag cannot land degrades to a note.
//
// LIVE PAINT is REGENERABLE, NOT LIVE, and the page says so. The
// engine has no LivePaintGroup node and no persistent face ids — only
// the per-call planar query whose ids index the request's own ordered
// inputs. So the group is a RECIPE in a `.paged` container part, a
// painted face is REAL ARTWORK inserted over the region, and every
// face this page paints is addressed from the engine's own
// requestPlanarRegions answer (a signature of which inputs contain
// it, an interior point) — never a guessed id.

import { expect } from "@playwright/test";

import { marginNote, proseFrame, specLabel } from "../../annual-support";
import { LAYER, STYLE, SWATCH, contentBox, p } from "../../names-annual";
import { newRefs, settle } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  corner,
  dragPage,
  draw,
  focusPageView,
  layoutOrigin,
  path,
  polygons,
  readDrawPart,
  reseat,
  send,
  spreadOffset,
} from "./00-support";

interface LivePaintLibrary {
  groups: Array<{
    id: string;
    name: string;
    inputs: Array<{ kind: string; id: string }>;
    faces: Array<{ face: string; fill: string | null }>;
  }>;
}

interface PlanarReply {
  result?: {
    found: boolean;
    faces: Array<{
      id: string;
      signature: number[];
      area: number;
      inside: [number, number];
    }>;
  } | null;
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const elements: string[] = [];
  const notes: string[] = [];
  const covers: string[] = [];
  const page = p(80);
  const [left, , right] = contentBox(page);
  const pageId = ctx.pageIds[0];
  const offset = await spreadOffset(ctx, pageId);

  const ink = await doc.swatch(SWATCH.ink);
  const vermilion = await doc.swatch(SWATCH.vermilion);
  const vermilionTint = await doc.swatch(SWATCH.vermilionTint);
  const screenBlue = await doc.swatch(SWATCH.screenBlue);
  const marigold = await doc.swatch(SWATCH.labMarigold);
  const layerContent = await doc.layerId(LAYER.content);

  const head = await proseFrame(ctx, page, [left, 54, right, 82], [
    { text: "The builder and the bucket", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, page, [left, 86, right, 126], [
    {
      text:
        "Two ways to paint with an overlap. The Shape Builder unites what a drag sweeps; Live Paint treats the overlap's regions as fillable faces - derived, painted and released below with every face id taken from the engine's own planar answer.",
      style: STYLE.bodyFirst,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── SHAPE BUILDER — a real drag across two filled rectangles ─────
  const sbA = await doc.rectangle(pageId, [70, 150, 190, 240]);
  const sbB = await doc.rectangle(pageId, [150, 178, 270, 266]);
  await doc.batch([
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: sbA },
        path: "frameFillColor",
        value: { type: "colorRef", value: vermilionTint },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: sbB },
        path: "frameFillColor",
        value: { type: "colorRef", value: screenBlue },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: sbA },
        path: "itemLayer",
        value: { type: "text", value: layerContent },
      },
    },
    {
      op: "setElementProperty",
      args: {
        elementId: { kind: "rectangle", id: sbB },
        path: "itemLayer",
        value: { type: "text", value: layerContent },
      },
    },
  ]);
  elements.push(sbA, sbB);

  let builderUnited = false;
  try {
    const origin = await layoutOrigin(ctx, page);
    const focused = await focusPageView(ctx, origin, 170, 208);
    if (focused) {
      await doc.runCommand(
        "paged.tool.activate.media.paged.draw.tool.shapeBuilder",
      );
      const rectCount = async () =>
        (await ctx.page.evaluate(async () => {
          const c = (
            globalThis as unknown as {
              __canvas: {
                client: {
                  executeScript: (
                    s: string,
                  ) => Promise<{ output: string[] }>;
                };
              };
            }
          ).__canvas;
          const r = await c.client.executeScript("paged.tree()");
          const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
            id?: { kind: string } | null;
            children?: unknown[];
          }>;
          let n = 0;
          const visit = (node: {
            id?: { kind: string } | null;
            children?: unknown[];
          }) => {
            if (node.id?.kind === "rectangle") n += 1;
            for (const ch of (node.children ?? []) as typeof tree) visit(ch);
          };
          for (const root of tree) visit(root);
          return n;
        })) as number;
      const before = await rectCount();
      await dragPage(ctx, origin, [100, 200], [240, 236]);
      builderUnited = await settle(
        ctx.page,
        async () => (await rectCount()) === before - 1,
        10_000,
      );
    } else {
      notes.push("shape-builder drag skipped — viewport not measurable");
    }
  } catch (err) {
    notes.push(`shape-builder lane threw: ${String(err).slice(0, 160)}`);
  } finally {
    await ctx.page.keyboard.press("Escape").catch(() => undefined);
    await ctx.page.keyboard.press("v").catch(() => undefined);
  }
  if (builderUnited) covers.push("plugin-draw.shape-builder");
  else if (notes.length === 0) {
    notes.push(
      "the shape-builder drag did not commit a union on this lane — recorded, not claimed",
    );
  }

  const sbCaption = await proseFrame(ctx, page, [left, 280, right, 320], [
    {
      text: builderUnited
        ? "A warm and a blue rectangle overlapped corner over corner; one Shape Builder drag from inside the first to inside the second swept both and committed a single union - the stepped silhouette above is ONE element now, wearing the first-swept warm fill, and one undo step."
        : "A warm and a blue rectangle overlapped for the Shape Builder's drag; on this build lane the pointer sweep did not commit, and the pair stands untouched as the record of the attempt.",
      style: STYLE.caption,
    },
  ]);
  elements.push(sbCaption.frameId);

  // ── LIVE PAINT — derive, paint, select, release ──────────────────
  // Three unfilled stroked quads whose overlaps make the faces. Line
  // art in, coloured regions out — the classic bucket demonstration.
  const trio: Array<{ kind: string; id: string }> = [];
  const quad = async (
    cx: number,
    cy: number,
    r: number,
    turn: number,
  ): Promise<string> => {
    const pts = [0, 1, 2, 3].map((i) => {
      const a = turn + (i * Math.PI) / 2;
      return corner(cx + r * Math.cos(a), cy + r * Math.sin(a));
    });
    const id = await path(ctx, pageId, pts, false, {
      fill: null,
      stroke: ink,
      weight: 2,
    });
    trio.push({ kind: "polygon", id });
    elements.push(id);
    return id;
  };
  await quad(210, 400, 58, 0.3);
  await quad(276, 400, 58, 0.9);
  await quad(243, 452, 58, 0.1);
  await doc.batch(
    trio.map((ref) => ({
      op: "setElementProperty",
      args: {
        elementId: ref,
        path: "itemLayer",
        value: { type: "text", value: layerContent },
      },
    })),
  );

  await doc.designer.selectElements(trio);
  await draw(ctx, "makeLivePaintGroup", { name: "Annual overlap" });
  const lib = await readDrawPart<LivePaintLibrary>(ctx, "live-paint.json");
  const group = lib?.groups.at(-1) ?? null;
  expect(group, "the live-paint recipe part records the group").not.toBeNull();

  // The engine's own answer, over the recipe's own ordered inputs —
  // the only source of face ids and interior points.
  const planar = (await send(ctx, "requestPlanarRegions", {
    elementIds: group!.inputs,
    point: null,
  })) as PlanarReply;
  expect(planar.result?.found, "the arrangement resolved").toBe(true);
  const faces = planar.result!.faces;
  const pairwise = faces
    .filter((f) => f.signature.length === 2)
    .sort((a, b) => b.area - a.area);
  const core = faces.filter((f) => f.signature.length >= 3);
  const wanted = [
    { face: pairwise[0], fill: vermilion },
    { face: pairwise[1], fill: screenBlue },
    { face: core[0] ?? pairwise[2], fill: marigold },
  ].filter((w) => w.face);

  let painted = 0;
  for (const w of wanted) {
    const before = await polygons(ctx);
    await draw(ctx, "fillLivePaintFace", {
      groupId: group!.id,
      face: w.face!.id,
      fill: w.fill,
    });
    const grew = await settle(
      ctx.page,
      async () => (await polygons(ctx)).length > before.length,
      10_000,
    );
    if (grew) {
      painted += 1;
      // The fill inserts onto the members' own page through the
      // read-then-reinsert lane — on this verso that is displaced by
      // the measured spread offset, and the batch below re-homes it
      // (the margin note names the seam).
      const minted = await newRefs(ctx.page, "polygon", before);
      await reseat(ctx, minted, offset);
      for (const ref of minted) elements.push(ref.id);
    } else {
      notes.push(
        `live-paint face ${w.face!.id} did not materialise — recorded`,
      );
    }
  }
  expect(painted, "at least two faces painted").toBeGreaterThanOrEqual(2);

  // SELECT FACES puts the materialised fills on the selection (the
  // recipe knows which they are); RELEASE keeps all the artwork and
  // forgets the tracking — asserted through the part, not assumed.
  await draw(ctx, "selectLivePaintFaces", { groupId: group!.id });
  const paintedCount =
    (await readDrawPart<LivePaintLibrary>(ctx, "live-paint.json"))?.groups.at(
      -1,
    )?.faces.length ?? 0;
  const beforeRelease = (await polygons(ctx)).length;
  await draw(ctx, "releaseLivePaint", { groupId: group!.id });
  const released = await settle(
    ctx.page,
    async () => {
      const after = await readDrawPart<LivePaintLibrary>(
        ctx,
        "live-paint.json",
      );
      return !(after?.groups ?? []).some((g) => g.id === group!.id);
    },
    10_000,
  );
  expect(released, "release dropped the recipe").toBe(true);
  expect(
    (await polygons(ctx)).length,
    "release keeps every member and every painted face",
  ).toBe(beforeRelease);

  const lpCaption = await proseFrame(ctx, page, [left, 520, right, 600], [
    {
      text:
        `Three stroked, unfilled quads; their overlaps make ${faces.length} planar faces. ` +
        `A Live Paint group recorded the trio, ${painted} faces were filled by id and interior point from the engine's planar answer, ` +
        `Select faces put the ${paintedCount} painted fills on the selection, and Release kept every stroke and fill while dropping the recipe. ` +
        "Nothing here holds a face object: each colour is a real polygon inserted over its region.",
      style: STYLE.caption,
    },
  ]);
  elements.push(lpCaption.frameId);

  elements.push(
    await specLabel(ctx, page, [
      "Specimen No. 118",
      "shapeBuilder drag-unite",
      "makeLivePaintGroup · fillLivePaintFace ×3",
      "selectLivePaintFaces · releaseLivePaint",
    ]),
  );
  elements.push(
    await marginNote(
      ctx,
      page,
      "Live Paint here is REGENERABLE, not live (RFI C-30): no persistent face objects, no gap tolerance, no edge strokes; a painted face inserts at the top of the z-order, above the strokes that bound it. On this facing-spread verso the fill inserts land one page width off (reads answer spread coordinates, inserts re-base page-local) and were re-homed by one transform batch → Appendix A",
    ),
  );
  notes.push(
    "plugin-draw.live-paint is registry-partial — demonstrated on this page, deliberately not claimed",
  );

  return {
    title: "The builder and the bucket",
    covers,
    elements,
    notes,
  };
}
