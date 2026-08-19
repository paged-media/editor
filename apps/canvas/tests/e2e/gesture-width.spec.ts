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

// Gesture tier — the Width tool's variable-width drag (coverage
// campaign P3, frames-paths.stroke-variable-width):
//
//   WD-01  pencil-draw an open path, select it, then a Width-tool drag
//          starting ON an anchor (the tool arms within 8px of one) bakes
//          a per-anchor width profile through the engine's
//          outlineStrokeVariable — which REPLACES the centreline with
//          its swept outline, so the wire's anchor count jumps; ONE undo
//          restores the original path exactly.
//
// This replaces the DOM-event-field assertion that was the row's only
// prior "coverage" (pointer-pressure.spec.ts) with a real drive of the
// tool the claim names.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  activateTool,
  awaitGeometryMirror,
  dragMouse,
  loadViaReactPath,
  screenPoint,
  treeIds,
} from "./harness/viewport";
import { undo } from "./harness/gesture";
import { selectElements } from "./harness/ui";

async function anchorCount(page: Page, ref: { kind: string; id: string }): Promise<number> {
  return page.evaluate(async (id) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            pathAnchors: (id: unknown) => Promise<{ anchors: unknown[] } | null>;
          };
        };
      }
    ).__canvas;
    const res = await c.client.pathAnchors(id);
    return res?.anchors.length ?? -1;
  }, ref);
}

test("WD-01 — a Width-tool drag near an anchor widens the selected open path; ONE undo restores it @feat:frames-paths.stroke-variable-width @level:gesture", async ({
  page,
}) => {
  await openCanvas(page);
  await loadViaReactPath(page, "geometry");

  // 1. Draw an open three-point path with the pencil (freehand bake).
  // treeIds returns {kind, id} RECORDS — compare on the id STRING (an
  // object compare is by reference, and nesting the record into `id`
  // makes the selection wire reject it as a malformed ElementId).
  const kinds = ["polygon", "graphicLine"] as const;
  const before: Record<string, string[]> = {};
  for (const k of kinds) before[k] = (await treeIds(page, k)).map((r) => r.id);

  await activateTool(page, "pencil");
  const p0 = await screenPoint(page, 120, 260);
  const p2 = await screenPoint(page, 320, 300);
  await dragMouse(page, p0, p2, { steps: 14 });

  let drawn: { kind: string; id: string } | null = null;
  await expect
    .poll(async () => {
      for (const k of kinds) {
        const now = await treeIds(page, k);
        const fresh = now.find((r) => !before[k].includes(r.id));
        if (fresh) {
          drawn = { kind: k, id: fresh.id };
          return true;
        }
      }
      return false;
    })
    .toBe(true);

  // 2. Select it and bake a width profile with a drag near the path's
  //    midpoint anchor (outward = the profile magnitude).
  await selectElements(page, [drawn!]);
  await awaitGeometryMirror(page, 1);
  const anchorsBefore = await anchorCount(page, drawn!);

  // The width tool arms only within 8px of a REAL anchor, so read the
  // path's anchors off the wire and start the drag on a middle one
  // (page space = itemTransform applied to the local anchor).
  const anchorPt = await page.evaluate(async (ref) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            pathAnchors: (id: unknown) => Promise<{
              anchors: Array<{ anchor: [number, number] }>;
              itemTransform?: [number, number, number, number, number, number] | null;
            } | null>;
          };
        };
      }
    ).__canvas;
    const res = await c.client.pathAnchors(ref);
    if (!res || res.anchors.length === 0) return null;
    const a = res.anchors[Math.floor(res.anchors.length / 2)].anchor;
    const m = res.itemTransform ?? [1, 0, 0, 1, 0, 0];
    return { x: m[0] * a[0] + m[2] * a[1] + m[4], y: m[1] * a[0] + m[3] * a[1] + m[5] };
  }, drawn!);
  expect(anchorPt, "the drawn path exposes anchors on the wire").not.toBeNull();

  await activateTool(page, "width");
  const at = await screenPoint(page, anchorPt!.x, anchorPt!.y);
  const out = await screenPoint(page, anchorPt!.x, anchorPt!.y - 40);
  await dragMouse(page, at, out);

  // outlineStrokeVariable REPLACES the centreline with its swept outline
  // (a closed filled contour), so the anchor count jumps — a semantic
  // oracle that doesn't depend on the profile magnitude reaching a
  // pixel threshold.
  await expect
    .poll(async () => anchorCount(page, drawn!), { timeout: 5_000 })
    .toBeGreaterThan(anchorsBefore);

  // 3. One undo restores the original path geometry.
  await undo(page);
  await expect.poll(async () => anchorCount(page, drawn!)).toBe(anchorsBefore);
});
