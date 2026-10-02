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

// The readout behind Transform ▸ X / Y and Properties ▸ Bounds, tested in
// the open (Node — `page-box.ts` and `object-commands.ts` import only
// types). The browser tier (`e2e/transform-readout.spec.ts`) proves the
// numbers against the real engine; this tier pins the rules: what a
// footprint is, when an edge may be written, and that a typed position
// rides the nudge's own write.

import { expect, test } from "@playwright/test";

import type { ElementId } from "@paged-media/client";

import {
  composedBox,
  edgesWritable,
  innerBoundsFor,
  unionBox,
  type PlacedLeaf,
} from "../src/panels/page-box";
import {
  translationPlan,
  type TranslationClient,
} from "../src/object-commands";

const C30 = Math.cos(Math.PI / 6);
const S30 = Math.sin(Math.PI / 6);

test.describe("page position — the footprint and the edge rule", () => {
  test("AC-XY-PURE-1 — the footprint is the bounds through the transform, boxed @feat:editor-shell.panels.object-transform @level:happy", () => {
    // No transform: the inner box.
    expect(composedBox([100, 100, 200, 300], null)).toEqual({
      top: 100,
      left: 100,
      bottom: 200,
      right: 300,
    });
    // A translation (a nudge) moves it; the inner box did not change.
    expect(composedBox([100, 100, 200, 300], [1, 0, 0, 1, 10, -5])).toEqual({
      top: 95,
      left: 110,
      bottom: 195,
      right: 310,
    });
    // 30° about the origin, then 10 right — the engine's own matrix for
    // a rotated, nudged frame (measured). The box is around all four
    // corners, so its left is the (left, bottom) corner's x.
    const box = composedBox([200, 200, 300, 400], [C30, S30, -S30, C30, 10, 0]);
    expect(box.left).toBeCloseTo(C30 * 200 - S30 * 300 + 10, 6);
    expect(box.top).toBeCloseTo(S30 * 200 + C30 * 200, 6);
    expect(box.right).toBeCloseTo(C30 * 400 - S30 * 200 + 10, 6);
    expect(box.bottom).toBeCloseTo(S30 * 400 + C30 * 300, 6);
  });

  test("AC-XY-PURE-2 — a multi-selection reads the box around every member @feat:editor-shell.panels.object-transform @level:edge", () => {
    expect(
      unionBox([
        { top: 10, left: 50, bottom: 20, right: 60 },
        { top: 0, left: 70, bottom: 40, right: 80 },
      ]),
    ).toEqual({ top: 0, left: 50, bottom: 40, right: 80 });
    expect(unionBox([])).toBeNull();
  });

  test("AC-XY-PURE-3 — edges are writable only where an inner-box write IS the edge shown @feat:editor-shell.panels.properties @level:edge", () => {
    const leaf = (kind: string, transform: number[] | null): PlacedLeaf => ({
      id: { kind, id: "u1" } as PlacedLeaf["id"],
      bounds: [100, 100, 200, 300],
      transform,
    });
    expect(edgesWritable(leaf("rectangle", null))).toBe(true);
    expect(edgesWritable(leaf("oval", [1, 0, 0, 1, 10, 0]))).toBe(true);
    expect(edgesWritable(leaf("textFrame", [1, 0, 0, 1, 0, 7]))).toBe(true);
    // Rotated: a frameBounds write moves it along its own axes.
    expect(edgesWritable(leaf("rectangle", [C30, S30, -S30, C30, 0, 0]))).toBe(false);
    // Drawn from anchors: a frameBounds write moves nothing (§14).
    expect(edgesWritable(leaf("graphicLine", null))).toBe(false);
    expect(edgesWritable(leaf("polygon", null))).toBe(false);
    expect(edgesWritable(null)).toBe(false);

    // The write is the shown edges minus the translation, so the edge
    // lands exactly where it was typed.
    const nudged = leaf("rectangle", [1, 0, 0, 1, 10, -5]);
    const shown = composedBox(nudged.bounds, nudged.transform);
    const inner = innerBoundsFor(nudged, { ...shown, right: 350 });
    expect(inner).toEqual([100, 100, 200, 340]);
    expect(composedBox(inner, nudged.transform).right).toBe(350);
  });

  test("AC-XY-PURE-4 — a typed position rides the nudge's write: moveFrame for a leaf, setGroupTransform for a group @feat:editor-shell.panels.object-transform @feat:editor-tools.move.translate @level:happy", async () => {
    const rect: ElementId = { kind: "rectangle", id: "u1" };
    const group: ElementId = { kind: "group", id: "g1" };
    const client = {
      sceneTree: async () => [],
      elementGeometry: async (ids: ElementId[]) =>
        ids.map((id) => ({
          id,
          bounds: [0, 0, 10, 10],
          itemTransform: [C30, S30, -S30, C30, 4, 2],
          hasImage: false,
        })),
      elementProperties: async (id: ElementId) => ({
        id,
        kind: "Group",
        entries: [
          { path: "frameTransform", value: { type: "transform", value: [1, 0, 0, 1, 3, 3] } },
        ],
      }),
    } as unknown as TranslationClient;

    const leafPlan = await translationPlan(client, [rect], 40, -6);
    // The LINEAR part is untouched: a rotated frame moves along the
    // page's axes, not its own.
    expect(leafPlan).toEqual({
      ok: true,
      ops: [
        {
          op: "moveFrame",
          args: { frameId: "u1", transform: [C30, S30, -S30, C30, 44, -4] },
        },
      ],
    });
    expect(await translationPlan(client, [group], 5, 0)).toEqual({
      ok: true,
      ops: [
        { op: "setGroupTransform", args: { groupId: "g1", transform: [1, 0, 0, 1, 8, 3] } },
      ],
    });

    // A refusal is a reason the caller prefixes with its own verb.
    const gone = { ...client, elementGeometry: async () => [] } as TranslationClient;
    expect(await translationPlan(gone, [rect], 1, 0)).toEqual({
      ok: false,
      reason: "the engine reports no geometry for rectangle u1, so there is no position to move.",
    });
  });
});
