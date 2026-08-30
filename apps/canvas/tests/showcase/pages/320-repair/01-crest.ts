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

// The crest repair — p77, and the cover it was taking up residence on.
//
// The drawing office's opener imports annual-crest.svg through the host
// importer registry and says, on the page, that the contours below are
// what came back. They were not below: all six landed on PAGE ONE, on
// top of the cover's wordmark, and the finished container proves it —
// the cover spread carries four polygons the cover module never wrote
// (six contours less the two consumed by the compound merges).
//
// The cause is not the importer, which resolves its target correctly:
//
//   apps/canvas/src/main.tsx — useEffect(() => {
//     const target = pageTargetFor({ handle, camera, viewportSize });
//     client.setActivePage(target?.pageId ?? null);
//   }, [client, handle, camera, viewportSize]);
//
// The host re-derives the active page from the CAMERA on every render,
// so `client.setActivePage(...)` is a hint with no tenure: any render
// between setting it and a plugin reading it puts the camera's page
// back. In a headless build the camera never leaves page one, so a
// plugin that mints its own elements mints them there — and the wire
// has no reparenting op, so nothing can move them afterwards.
//
// What CAN be done is what this module does. `framePath` is both
// readable and settable, so the geometry the importer produced is
// copied — anchors, subpath boundaries and all, which is how the two
// compound contours survive as compounds — onto stub paths inserted on
// page 77, re-based across the spread seam, repainted from the
// originals, and the originals deleted. The importer still did the
// lowering; this only carries the result to the page that describes it.

import { expect } from "@playwright/test";

import { assignLayer } from "../../annual-support";
import { LAYER, p } from "../../names-annual";
import { geometryOf, newRefs, sceneRefs, type Ref } from "../../plugin-support";
import { spreadOffset } from "../250-manuscript/00-support";
import type { PageContext, PageReport } from "../../types";

/** One polygon's paint + geometry, as the engine reports it. */
interface Contour {
  anchors: Array<{
    anchor: [number, number];
    left: [number, number];
    right: [number, number];
  }>;
  subpathStarts: number[];
  fill: string | null;
  stroke: string | null;
  weight: number | null;
}

async function readContour(ctx: PageContext, id: string): Promise<Contour | null> {
  return ctx.page.evaluate(async (elId) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementProperties: (i: unknown) => Promise<{
              entries: Array<{
                path: string;
                value: { type: string; value: unknown } | null;
              }>;
            } | null>;
          };
        };
      }
    ).__canvas;
    const props = await c.client.elementProperties({ kind: "polygon", id: elId });
    if (!props) return null;
    const read = (path: string) =>
      props.entries.find((e) => e.path === path)?.value?.value ?? null;
    const fp = read("framePath") as {
      anchors?: Contour["anchors"];
      subpathStarts?: number[];
    } | null;
    if (!fp?.anchors?.length) return null;
    return {
      anchors: fp.anchors,
      subpathStarts: fp.subpathStarts ?? [0],
      fill: read("frameFillColor") as string | null,
      stroke: read("frameStrokeColor") as string | null,
      weight: read("frameStrokeWeight") as number | null,
    };
  }, id);
}

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc } = ctx;
  const page77 = p(77);
  const pageId = ctx.pageIds[0];
  const notes: string[] = [];
  const elements: string[] = [];

  // ── find the squatters ───────────────────────────────────────────
  // Every polygon the document holds, filtered to the ones sitting on
  // the cover. The cover authors none, so whatever is there is the
  // import's misplaced output.
  const all = await sceneRefs(ctx.page, "polygon");
  const geo = await geometryOf(ctx.page, all);
  const coverPageId = await doc.pageId(p(1));
  const strays = geo
    .filter((g) => g.pageId === coverPageId)
    .map((g) => g.ref);
  expect(
    strays.length,
    "the cover carries the crest contours the importer misplaced",
  ).toBeGreaterThan(0);
  notes.push(
    `the cover carried ${strays.length} polygon(s) the cover module never ` +
      `wrote — the SVG import's output, minted onto page one because the ` +
      `host re-derives the active page from the camera on every render`,
  );

  // ── carry the geometry across ────────────────────────────────────
  // Anchors are STORED coordinates; page 77 is a recto inside a facing
  // spread and the cover is a lone recto, so the two pages' stored
  // frames differ by the spread seam. Both offsets are probed, never
  // assumed.
  const coverOff = await spreadOffset(ctx, coverPageId);
  const targetOff = await spreadOffset(ctx, pageId);
  const dx = targetOff[0] - coverOff[0];
  const dy = targetOff[1] - coverOff[1];

  const before = await sceneRefs(ctx.page, "polygon");
  let carried = 0;
  for (const stray of strays) {
    const contour = await readContour(ctx, stray.id);
    if (!contour) {
      notes.push(`polygon ${stray.id} answered no framePath — left in place`);
      continue;
    }
    // A stub to own the id, then the real geometry written over it in
    // one property write: framePath carries subpathStarts, so a
    // compound path arrives compound rather than needing a re-merge.
    const stub = await doc.mutateId("insertPath", {
      pageId,
      anchors: contour.anchors.slice(0, 3),
      open: false,
    });
    await doc.setProperty("polygon", stub, "framePath", {
      type: "framePath",
      value: {
        anchors: contour.anchors.map((a) => ({
          anchor: [a.anchor[0] + dx, a.anchor[1] + dy],
          left: [a.left[0] + dx, a.left[1] + dy],
          right: [a.right[0] + dx, a.right[1] + dy],
        })),
        subpathStarts: contour.subpathStarts,
      },
    });
    if (contour.fill !== null) {
      await doc.setProperty("polygon", stub, "frameFillColor", {
        type: "colorRef",
        value: contour.fill,
      });
    }
    if (contour.stroke !== null) {
      await doc.setProperty("polygon", stub, "frameStrokeColor", {
        type: "colorRef",
        value: contour.stroke,
      });
    }
    if (contour.weight !== null) {
      await doc.setProperty("polygon", stub, "frameStrokeWeight", {
        type: "length",
        value: contour.weight,
      });
    }
    await assignLayer(ctx, "polygon", stub, LAYER.content);
    elements.push(stub);
    carried += 1;
  }
  expect(carried, "every misplaced contour was carried to its page").toBe(
    strays.length,
  );

  // ── clear the cover ──────────────────────────────────────────────
  const coverBefore = await doc.renderPage(p(1));
  for (const stray of strays) {
    await doc.mutate("deleteFrame", { frameId: stray.id });
  }
  await doc.expectRenderChanged(p(1), coverBefore);
  const stillThere = (await geometryOf(ctx.page, await sceneRefs(ctx.page, "polygon")))
    .filter((g) => g.pageId === coverPageId);
  expect(stillThere.length, "the cover is clear of the import's output").toBe(0);

  // NO margin note here: p77 already carries one, and the apparatus band
  // is a fixed slot — a second would print on top of the first. The
  // page's own prose ("The crest above arrived as a file of curves")
  // becomes TRUE the moment the contours land, which is the repair's
  // whole point. The defect itself is a campaign finding, recorded
  // where findings live rather than squeezed onto a finished page.

  notes.push(
    `carried ${carried} contour(s) to page ${page77 + 1} by copying ` +
      `framePath (anchors + subpathStarts, so compounds stay compound) and ` +
      `re-basing by the probed spread seam (${dx}, ${dy})`,
  );

  return {
    title: "Ch.14 — the crest, carried to the page that describes it",
    covers: ["plugin-draw.svg-io", "frames-paths.path-topology"],
    elements,
    notes,
  };
}
