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

// Journey: the Pencil, Gradient and Page tools.
//
// These three are registered in BUILT_IN_TOOLS with real gesture handlers
// (pencil → insertPath{smooth}, gradient swatch → frame gradient axis, page
// → insert/resize/delete) but had no test driving them. This proves each
// arms from the rail and commits its engine op through the real viewport.

import { expect, test } from "@playwright/test";

import { activateTool, screenPoint, treeCount } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;
type Ref = { kind: string; id: string };

const readProp = (page: Page, ref: Ref, path: string) =>
  page.evaluate(
    async ({ id, p }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (
                id: unknown,
              ) => Promise<{ entries: Array<{ path: string; value: unknown }> } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties(id);
      return props?.entries.find((e) => e.path === p)?.value ?? null;
    },
    { id: ref, p: path },
  );

test.describe("journey · pencil/gradient/page tools", () => {
  test("freehand a pencil path, drag a gradient axis, insert a page via the page tool @feat:editor-tools.draw.pencil @feat:editor-tools.gradient-tools @feat:editor-tools.page-tool @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const fail: string[] = [];

    // PENCIL — arm the Pencil and freehand a stroke; the engine commits one
    // smooth insertPath (a polygon element).
    try {
      const before = await treeCount(page, "polygon");
      await activateTool(page, "pencil");
      const path: Array<[number, number]> = [
        [120, 200],
        [160, 170],
        [210, 210],
        [260, 175],
        [300, 215],
      ];
      const pts = await Promise.all(path.map(([x, y]) => screenPoint(page, x, y)));
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 3 });
      await page.waitForTimeout(40);
      await page.mouse.up();
      await expect
        .poll(() => treeCount(page, "polygon"), { timeout: 5000 })
        .toBeGreaterThan(before);
    } catch (e) {
      fail.push(`draw.pencil (${String(e).slice(0, 55)})`);
    }

    // GRADIENT — give a frame a gradient fill, select it, then drag the
    // Gradient Swatch tool across it; the axis length picks up the drag.
    try {
      const rectId = await designer.drawRectangle({ x0: 90, y0: 300, x1: 320, y1: 440 });
      const ref = { kind: "rectangle", id: rectId };
      const gradId = await designer.createGradient("journey-grad", ["Color/Black", "Color/Paper"]);
      await designer.applyFill("rectangle", rectId, `Gradient/${gradId}`);
      await designer.selectElement("rectangle", rectId);
      await activateTool(page, "gradientSwatch");
      const a = await screenPoint(page, 110, 320);
      const b = await screenPoint(page, 300, 420);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 8 });
      await page.waitForTimeout(40);
      await page.mouse.up();
      await expect
        .poll(
          async () => {
            const v = (await readProp(page, ref, "frameGradientFillLength")) as
              | { value?: number }
              | null;
            return v?.value ?? 0;
          },
          { timeout: 5000 },
        )
        .toBeGreaterThan(0);
    } catch (e) {
      fail.push(`gradient-tools (${String(e).slice(0, 55)})`);
    }

    // PAGE — arm the Page tool and Alt-click a page to insert a new one
    // after it (the page count grows).
    try {
      const before = (await designer.handle()).pageIds.length;
      await activateTool(page, "page");
      const p = await screenPoint(page, 120, 120);
      await page.keyboard.down("Alt");
      await page.mouse.click(p.x, p.y);
      await page.keyboard.up("Alt");
      await expect
        .poll(async () => (await designer.handle()).pageIds.length, { timeout: 5000 })
        .toBeGreaterThan(before);
    } catch (e) {
      fail.push(`page-tool (${String(e).slice(0, 55)})`);
    }

    expect(fail, `rail tools that did not drive: ${fail.join(" | ")}`).toEqual([]);
  });
});
