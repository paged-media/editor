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

// An item hanging off the page keeps its selection chrome. The engine
// gives an item to the page its centre sits on; an item whose centre is
// on the pasteboard belongs to no page and answers its geometry in its
// spread's space. The overlay drew page-local chrome only, so such an
// item had no box and no handles. InDesign draws the chrome on the
// pasteboard, and its handles and body still drag.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../journey/driver/designer";
import { activateTool, screenPoint } from "./harness/viewport";

type Ref = { kind: string; id: string };
type Geometry = { id: Ref; pageId?: string | null; bounds: number[]; itemTransform: number[] | null };

interface CanvasGlobal {
  __canvas: {
    elementSelection: Ref[];
    client: {
      elementGeometry: (ids: Ref[]) => Promise<Geometry[]>;
      executeScript: (s: string) => Promise<{ output: string[]; error: string | null }>;
      mutate: (m: unknown) => Promise<{ kind: string; payload?: { createdId?: Ref | null } }>;
      camera: { read: () => { scale: number } };
    };
  };
}

const geometry = async (page: Page, ref: Ref): Promise<Geometry> =>
  (await page.evaluate((ids) => (globalThis as unknown as CanvasGlobal).__canvas.client.elementGeometry(ids), [ref]))[0];

const drawnBoxes = (page: Page) => page.locator('polygon[stroke="var(--overlay-selection)"]');

/** The composed box, `[left, top, right, bottom]`. */
function box(g: Geometry): [number, number, number, number] {
  const [top, left, bottom, right] = g.bounds;
  const m = g.itemTransform ?? [1, 0, 0, 1, 0, 0];
  const xs = [left, right].map((x) => m[0] * x + m[4]);
  const ys = [top, bottom].map((y) => m[3] * y + m[5]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const mutate = (page: Page, m: unknown) =>
  page.evaluate((m) => (globalThis as unknown as CanvasGlobal).__canvas.client.mutate(m), m);

/** A rectangle at [100, 760]–[200, 860] on a 792 pt page: its top edge is
 *  on the page, its centre is not. Selected by a script, the view panned
 *  so the pasteboard under the page is on screen.
 *
 *  `drawn`: drawn with the Rectangle tool (which selects it on the page
 *  first) and then moved. Otherwise it and a second rectangle on the page
 *  are made over the wire, so nothing the selection ever held says where
 *  the page sits in its spread and the canvas must ask. */
async function hangingRectangle(page: Page, how: "drawn" | "wire"): Promise<Ref> {
  const designer = new Designer(page);
  await designer.open();
  await designer.newDocument();
  let rect: Ref;
  if (how === "drawn") {
    const id = await designer.drawRectangle({ x0: 100, y0: 600, x1: 200, y1: 700 });
    const moved = await mutate(page, {
      op: "moveFrame",
      args: { frameId: id, transform: [1, 0, 0, 1, 0, 160] },
    });
    expect(moved.kind).toBe("mutationApplied");
    rect = { kind: "rectangle", id };
  } else {
    const { pageIds } = await designer.handle();
    await mutate(page, { op: "insertFrame", args: { pageId: pageIds[0], bounds: [100, 300, 200, 400] } });
    const made = await mutate(page, { op: "insertFrame", args: { pageId: pageIds[0], bounds: [760, 100, 860, 200] } });
    expect(made.payload?.createdId).toBeTruthy();
    rect = made.payload!.createdId!;
  }
  const id = rect.id;
  // The engine puts it on no page: the premise of the test.
  expect((await geometry(page, rect)).pageId ?? null).toBeNull();
  expect(box(await geometry(page, rect))).toEqual([
    expect.closeTo(100, 1),
    expect.closeTo(760, 1),
    expect.closeTo(200, 1),
    expect.closeTo(860, 1),
  ]);

  await activateTool(page, "select");
  const centre = await screenPoint(page, 300, 400);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, 300);
  await page.evaluate(
    (ids) =>
      (globalThis as unknown as CanvasGlobal).__canvas.client.executeScript(
        `paged.setElementSelection(${JSON.stringify(ids)})`,
      ),
    [`${rect.kind}:${id}`],
  );
  await expect
    .poll(() => page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.elementSelection.map((r) => r.id)))
    .toEqual([id]);
  // The pan reaches the overlay a render after the camera: wait until the
  // south-east handle sits on the item's corner in the current view, or a
  // handle read now is where it was before the pan.
  await expect
    .poll(async () => {
      const at = await screenPoint(page, 200, 860);
      const b = await page.locator('[data-handle="southEast"]').first().boundingBox();
      return b !== null && Math.hypot(b.x + b.width / 2 - at.x, b.y + b.height / 2 - at.y) < 1;
    })
    .toBe(true);
  return rect;
}

test.describe("chrome on the pasteboard", () => {
  test("AC-PASTEBOARD-1 — an item hanging off the page draws its box and handles where it is @feat:editor-tools.overlays @level:edge", async ({
    page,
  }) => {
    await hangingRectangle(page, "wire");
    await expect(drawnBoxes(page)).toHaveCount(1);
    await expect(page.locator("[data-selection-handle]")).toHaveCount(8);
    const nw = await screenPoint(page, 100, 760);
    const se = await screenPoint(page, 200, 860);
    const centre = async (selector: string) => {
      const b = (await page.locator(selector).first().boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    // The box is centred on the item; its corner handles sit on its
    // corners, the bottom one well below the page.
    const drawn = await centre('polygon[stroke="var(--overlay-selection)"]');
    expect(drawn.x).toBeCloseTo((nw.x + se.x) / 2, 0);
    expect(drawn.y).toBeCloseTo((nw.y + se.y) / 2, 0);
    for (const [name, at] of [
      ["northWest", nw],
      ["southEast", se],
    ] as const) {
      const handle = await centre(`[data-handle="${name}"]`);
      expect(handle.x).toBeCloseTo(at.x, 0);
      expect(handle.y).toBeCloseTo(at.y, 0);
    }
  });

  test("AC-PASTEBOARD-2 — the off-page handle resizes it and its off-page body moves it @feat:editor-tools.resize.handles @feat:editor-tools.move.translate @level:edge", async ({
    page,
  }) => {
    const rect = await hangingRectangle(page, "drawn");
    const k = (await screenPoint(page, 0, 0)).scale;

    const handle = (await page.locator('[data-handle="southEast"]').first().boundingBox())!;
    const hx = handle.x + handle.width / 2;
    const hy = handle.y + handle.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx + 40, hy + 30, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => box(await geometry(page, rect)))
      .toEqual([
        expect.closeTo(100, 0),
        expect.closeTo(760, 0),
        expect.closeTo(200 + 40 / k, 0),
        expect.closeTo(860 + 30 / k, 0),
      ]);

    // A press on the part below the page drags the item.
    const before = box(await geometry(page, rect));
    const from = await screenPoint(page, 150, 840);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 50, from.y, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => box(await geometry(page, rect))[0])
      .toBeCloseTo(before[0] + 50 / k, 0);
  });
});
