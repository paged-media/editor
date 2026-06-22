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

// Journey: object transforms.
//
// A designer draws a frame and manipulates it the way they do in InDesign —
// move, resize from a handle, rotate, scale, shear. Each commits a single
// gesture Operation and visibly changes the object's page-space footprint.
// Proves the move/resize/rotate/scale/shear gesture families end to end.

import { expect, test } from "@playwright/test";

import { elementPageRectPt } from "../../e2e/harness/fixtures";
import { runGesture } from "../../e2e/harness/gesture";
import { Designer } from "../driver/designer";

const NO_SNAP = { shift: false, alt: false, disableSnap: true };

test.describe("journey · transforms", () => {
  test("move, resize, rotate, scale, shear each reshape the frame @feat:editor-tools.move.translate @feat:editor-tools.resize.handles @feat:editor-tools.rotate @feat:editor-tools.scale @feat:editor-tools.shear @feat:editor-tools.gesture-lifecycle @feat:round-tripping.gesture-transactions @feat:editor-shell.panels.object-transform @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const id = await designer.drawRectangle({ x0: 110, y0: 130, x1: 270, y1: 250 });
    const ref = { kind: "rectangle", id };
    const { pageIds } = await designer.handle();
    const pageId = pageIds[0];

    // A page-space rect that moves/grows/skews proves each gesture committed.
    const rect = async () => {
      const r = await elementPageRectPt(page, ref);
      if (!r) throw new Error("no page rect for the drawn frame");
      return r;
    };
    const pivot = async (): Promise<[number, number]> => {
      const r = await rect();
      return [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
    };
    type Rect = { top: number; left: number; bottom: number; right: number };
    const changed = (a: Rect, b: Rect) =>
      Math.abs(a.top - b.top) +
        Math.abs(a.left - b.left) +
        Math.abs(a.bottom - b.bottom) +
        Math.abs(a.right - b.right) >
      0.5;

    let prev = await rect();

    // MOVE
    await runGesture(page, [ref], { kind: "translate" }, [
      { delta: [42, 28], mods: NO_SNAP },
    ]);
    let next = await rect();
    expect(changed(prev, next), "move shifts the frame").toBe(true);
    prev = next;

    // RESIZE (south-east handle)
    await runGesture(page, [ref], { kind: "resize", handle: "southEast" }, [
      { delta: [50, 36], mods: NO_SNAP },
    ]);
    next = await rect();
    expect(changed(prev, next), "resize grows the frame").toBe(true);
    prev = next;

    // ROTATE (about its centre)
    await runGesture(
      page,
      [ref],
      { kind: "rotate" },
      [{ delta: [0, -44], mods: { shift: false, alt: false } }],
      { anchor: { pageId, pointInPage: await pivot() } },
    );
    next = await rect();
    expect(changed(prev, next), "rotate reorients the frame").toBe(true);
    prev = next;

    // SCALE
    await runGesture(
      page,
      [ref],
      { kind: "scale" },
      [{ delta: [40, 28], mods: { shift: false, alt: false } }],
      { anchor: { pageId, pointInPage: await pivot() } },
    );
    next = await rect();
    expect(changed(prev, next), "scale resizes the frame").toBe(true);
    prev = next;

    // SHEAR
    await runGesture(
      page,
      [ref],
      { kind: "shear" },
      [{ delta: [34, 0], mods: { shift: false, alt: false } }],
      { anchor: { pageId, pointInPage: await pivot() } },
    );
    next = await rect();
    expect(changed(prev, next), "shear skews the frame").toBe(true);
  });
});
