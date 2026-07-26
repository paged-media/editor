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

// Journey: paged.draw SHAPE BUILDER — drag across overlapping filled
// shapes to UNITE them (Alt-drag subtracts).
//
// The Shape Builder is a gesture tool: it hit-tests the engine along the
// drag (host.document.hitTest), feeds the swept element ids to a
// host-agnostic machine, and on pointer-up commits ONE pathfinderBoolean
// (first swept = kept, the rest united/subtracted) — one undoable step,
// the kept element re-selected. This journey authors two OVERLAPPING
// filled rectangles, activates the Shape Builder tool, drags from inside
// the first through the overlap into the second, and asserts the union
// committed: the second rectangle is consumed (the rectangle count drops
// by one) AND the rendered silhouette visibly changes.
//
// HONEST SUBSET (RFI B-22): the facade hit-tests at the ELEMENT level, so
// the gesture sweeps whole elements, not the lens sub-region. The drag
// must therefore traverse both rectangles' interiors. A negative control
// proves the render oracle.

import { expect, test } from "@playwright/test";

import { dragMouse, screenPoint } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

async function invokeCommand(
  page: import("@playwright/test").Page,
  id: string,
): Promise<void> {
  await page.evaluate((cmdId) => {
    const cmd = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: {
              invoke?: (id: string) => Promise<void>;
              execute?: (id: string) => Promise<void>;
              run?: (id: string) => Promise<void>;
            };
          };
        };
      }
    ).__canvas.registries.commands;
    const fn = cmd.invoke ?? cmd.execute ?? cmd.run;
    return fn?.call(cmd, cmdId);
  }, id);
}

test.describe("journey · paged.draw shape builder", () => {
  test("a designer drag-unites two overlapping filled shapes with the Shape Builder @feat:plugin-draw.shape-builder @feat:plugin-platform.bundle-lifecycle @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. NEGATIVE CONTROL — the blank page is render-stable. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. AUTHOR — two OVERLAPPING filled rectangles with DISTINCT
    //    fills. rect1 (kept, black) on the left, rect2 (red, consumed) on
    //    the right, overlapping in the middle band. Distinct fills make
    //    the union — which keeps rect1's black identity over rect2's
    //    formerly-red exclusive region — a VISIBLE recolour on the page. ──
    const rect1 = await designer.drawRectangle({ x0: 140, y0: 180, x1: 340, y1: 360 });
    const rect2 = await designer.drawRectangle({ x0: 280, y0: 180, x1: 480, y1: 360 });
    expect(rect1, "drew rect1").not.toBe("");
    expect(rect2, "drew rect2").not.toBe("");
    await designer.applyFill("rectangle", rect1, "Color/Black");
    const redSwatch = await designer.createSwatch("shape-builder-red", [220, 20, 20]);
    await designer.applyFill("rectangle", rect2, redSwatch);

    expect(await designer.count("rectangle"), "two rectangles authored").toBe(2);

    // Re-fit so the live camera is settled for the drag mapping.
    await page.keyboard.press("Home");
    await page.waitForTimeout(400);
    const before = await designer.renderBytes();

    // ── 2. ACTIVATE the Shape Builder tool through the real activation
    //    command (the rail/shortcut surface). ──
    await invokeCommand(
      page,
      "paged.tool.activate.media.paged.draw.tool.shapeBuilder",
    );

    // ── 3. DRAG from deep inside rect1, through the overlap, into deep
    //    inside rect2 — so the per-move hit-test sweeps BOTH elements.
    //    The handler commits one union on pointer-up. ──
    const from = await screenPoint(page, 200, 270); // inside rect1 only
    const to = await screenPoint(page, 420, 270); // inside rect2 only
    await dragMouse(page, from, to, { steps: 12, settleMs: 200 });

    // ── 4. UNION committed — the second swept element is consumed by the
    //    engine (the result replaces the kept element + removes the
    //    others). The rectangle count drops from 2 → 1. ──
    await expect
      .poll(() => designer.count("rectangle"), { timeout: 8_000 })
      .toBe(1);

    // ── 5. The merged silhouette renders differently from the two
    //    separate overlapping fills. ──
    await designer.expectRenderChangesFrom(before);
  });
});
