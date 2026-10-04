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

// Journey: Rotate about a CLICK-SET pivot (protocol 66, RFI C-67).
//
// A click with the Rotate tool moves the reference point; the next drag
// rotates the selection about it, so the clicked corner stays where it
// is while the rest of the frame swings round. Before protocol 66 the
// engine ignores `pivotInPage` and rotates about the centroid, which
// moves that corner — so this journey runs only on an engine that has
// the field: set `PAGED_REQUIRE_V66=1` with the local protocol-66
// override (it skips otherwise, and must stop skipping once the editor
// pins canvas-wasm 0.66).

import { expect, test } from "@playwright/test";

import { activateTool, screenPoint } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;
type Ref = { kind: string; id: string };

/** The frame's top-left corner and its rotation, through its transform. */
const cornerAndAngle = (page: Page, ref: Ref) =>
  page.evaluate(async (id) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementGeometry: (ids: unknown[]) => Promise<
              { bounds: [number, number, number, number]; itemTransform?: number[] | null }[]
            >;
          };
        };
      }
    ).__canvas;
    const [g] = await c.client.elementGeometry([id]);
    const [top, left] = g.bounds;
    const m = g.itemTransform ?? [1, 0, 0, 1, 0, 0];
    return {
      corner: [m[0] * left + m[2] * top + m[4], m[1] * left + m[3] * top + m[5]] as [number, number],
      angle: (Math.atan2(m[1], m[0]) * 180) / Math.PI,
    };
  }, ref);

async function click(page: Page, at: [number, number]): Promise<void> {
  const p = await screenPoint(page, at[0], at[1]);
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await screenPoint(page, from[0], from[1]);
  const b = await screenPoint(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.waitForTimeout(40);
  await page.mouse.up();
}

test.describe("journey · rotate about a click-set pivot", () => {
  test.skip(process.env.PAGED_REQUIRE_V66 !== "1", "needs a protocol-66 engine (PAGED_REQUIRE_V66=1)");

  test("the clicked corner stays put while the frame rotates @feat:editor-tools.rotate @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const id = await designer.drawRectangle({ x0: 100, y0: 300, x1: 260, y1: 400 });
    const ref: Ref = { kind: "rectangle", id };
    await designer.selectElement("rectangle", id);
    const before = await cornerAndAngle(page, ref);

    await activateTool(page, "transform");
    await expect(
      page.locator('[data-tool-slot="transform"][data-tool="paged.tool.rotate"][data-active="true"]'),
    ).toBeVisible();
    // Click the top-left corner: the pivot moves there.
    await click(page, [100, 300]);
    await drag(page, [300, 350], [300, 250]);

    await expect
      .poll(async () => Math.abs((await cornerAndAngle(page, ref)).angle), { timeout: 5000 })
      .toBeGreaterThan(0.5);
    const after = await cornerAndAngle(page, ref);
    // About the centroid this corner would travel tens of points.
    expect(Math.hypot(after.corner[0] - before.corner[0], after.corner[1] - before.corner[1])).toBeLessThan(1);
  });
});
