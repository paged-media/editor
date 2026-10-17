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

// A handle drag on a group or a multi-selection scales it around the
// OPPOSITE handle, which stays put, as in InDesign. The drag drives the
// engine's matrix scale, which turns about the pivot the begin names; the
// canvas named none, so the scale turned about the selection's centre and
// the whole selection drifted under the pointer. The grabbed handle
// follows the pointer; Shift keeps the proportions; Alt/Option scales
// from the centre, pressed before or during the drag.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../journey/driver/designer";
import { activateTool, screenPoint } from "./harness/viewport";

type Ref = { kind: string; id: string };
type Geometry = { id: Ref; bounds: number[]; itemTransform: number[] | null };
/** Composed axis-aligned box, page space. */
type Box = { left: number; top: number; right: number; bottom: number };

interface CanvasGlobal {
  __canvas: {
    elementSelection: Ref[];
    client: {
      elementGeometry: (ids: Ref[]) => Promise<Geometry[]>;
      executeScript: (s: string) => Promise<{ output: string[]; error: string | null }>;
      camera: { read: () => { scale: number } };
    };
  };
}

const geometry = (page: Page, ids: Ref[]) =>
  page.evaluate((ids) => (globalThis as unknown as CanvasGlobal).__canvas.client.elementGeometry(ids), ids);

const selection = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.elementSelection);

const cameraScale = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.client.camera.read().scale);

/** The union of the items' composed boxes. */
async function unionBox(page: Page, ids: Ref[]): Promise<Box> {
  const items = await geometry(page, ids);
  const box: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const g of items) {
    const [top, left, bottom, right] = g.bounds;
    const m = g.itemTransform ?? [1, 0, 0, 1, 0, 0];
    for (const [x, y] of [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
    ]) {
      const px = m[0] * x + m[2] * y + m[4];
      const py = m[1] * x + m[3] * y + m[5];
      box.left = Math.min(box.left, px);
      box.right = Math.max(box.right, px);
      box.top = Math.min(box.top, py);
      box.bottom = Math.max(box.bottom, py);
    }
  }
  return box;
}

/** Two rectangles, [100,100]–[200,180] and [240,100]–[340,180]: one box
 *  from (100, 100) to (340, 180). */
async function twoRectangles(page: Page): Promise<Ref[]> {
  const designer = new Designer(page);
  await designer.open();
  await designer.newDocument();
  const a = await designer.drawRectangle({ x0: 100, y0: 100, x1: 200, y1: 180 });
  const b = await designer.drawRectangle({ x0: 240, y0: 100, x1: 340, y1: 180 });
  return [
    { kind: "rectangle", id: a },
    { kind: "rectangle", id: b },
  ];
}

async function selectBoth(page: Page, leaves: Ref[]): Promise<void> {
  await page.evaluate(
    (ids) =>
      (globalThis as unknown as CanvasGlobal).__canvas.client.executeScript(
        `paged.setElementSelection(${JSON.stringify(ids)})`,
      ),
    leaves.map((l) => `${l.kind}:${l.id}`),
  );
  await expect.poll(async () => (await selection(page)).length).toBe(2);
  await activateTool(page, "select");
}

/** The two rectangles grouped, the group selected by a click. */
async function clickedGroup(page: Page): Promise<Ref> {
  const leaves = await twoRectangles(page);
  await selectBoth(page, leaves);
  await new Designer(page).runCommand("paged.object.group");
  await activateTool(page, "select");
  const p = await screenPoint(page, 150, 140);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await selection(page)).map((r) => r.kind)).toEqual(["group"]);
  return (await selection(page))[0];
}

/** Drag a handle by a screen-px offset, from its exact centre. `during`
 *  runs after the first half of the move (a modifier pressed mid-drag). */
async function dragHandle(
  page: Page,
  name: string,
  dx: number,
  dy: number,
  during?: () => Promise<void>,
): Promise<void> {
  const handle = page.locator(`[data-handle="${name}"]`).first();
  await expect(handle).toBeVisible();
  const hb = (await handle.boundingBox())!;
  const x = hb.x + hb.width / 2;
  const y = hb.y + hb.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 6 });
  if (during) await during();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

/** Poll until the box has changed, then return it. */
async function settledBox(page: Page, ids: Ref[], before: Box): Promise<Box> {
  await expect
    .poll(async () => {
      const b = await unionBox(page, ids);
      return Math.abs(b.right - b.left - (before.right - before.left)) > 1 || Math.abs(b.bottom - b.top - (before.bottom - before.top)) > 1;
    })
    .toBe(true);
  // One more read after the commit has landed.
  await page.waitForTimeout(200);
  return unionBox(page, ids);
}

const near = (v: number) => expect.closeTo(v, 0);

test.describe("a handle drag scales around the opposite handle", () => {
  test("AC-HANDLE-SCALE-1 — a group's corner drag keeps the opposite corner where it was @feat:editor-tools.scale @feat:frames-paths.groups @level:happy", async ({
    page,
  }) => {
    const group = await clickedGroup(page);
    const before = await unionBox(page, [group]);
    const k = await cameraScale(page);
    await dragHandle(page, "southEast", 60, 40);
    const after = await settledBox(page, [group], before);
    // The opposite (north-west) corner stays; the grabbed corner follows
    // the pointer.
    expect({ left: after.left, top: after.top }).toEqual({ left: near(before.left), top: near(before.top) });
    expect({ right: after.right, bottom: after.bottom }).toEqual({
      right: near(before.right + 60 / k),
      bottom: near(before.bottom + 40 / k),
    });
  });

  test("AC-HANDLE-SCALE-2 — a group's side drag moves that side only @feat:editor-tools.scale @feat:frames-paths.groups @level:happy", async ({
    page,
  }) => {
    const group = await clickedGroup(page);
    const before = await unionBox(page, [group]);
    const k = await cameraScale(page);
    // Off-axis wobble in the pointer must not scale the other axis.
    await dragHandle(page, "east", 50, 12);
    const after = await settledBox(page, [group], before);
    expect(after).toEqual({
      left: near(before.left),
      top: near(before.top),
      right: near(before.right + 50 / k),
      bottom: near(before.bottom),
    });
  });

  test("AC-HANDLE-SCALE-3 — a multi-selection's corner drag keeps the opposite corner where it was @feat:editor-tools.scale @level:happy", async ({
    page,
  }) => {
    const leaves = await twoRectangles(page);
    await selectBoth(page, leaves);
    const before = await unionBox(page, leaves);
    const k = await cameraScale(page);
    await dragHandle(page, "northWest", -40, -30);
    const after = await settledBox(page, leaves, before);
    expect({ right: after.right, bottom: after.bottom }).toEqual({
      right: near(before.right),
      bottom: near(before.bottom),
    });
    expect({ left: after.left, top: after.top }).toEqual({
      left: near(before.left - 40 / k),
      top: near(before.top - 30 / k),
    });
  });

  test("AC-HANDLE-SCALE-4 — Shift keeps a group's proportions, still about the opposite corner @feat:editor-tools.scale @feat:frames-paths.groups @level:happy", async ({
    page,
  }) => {
    const group = await clickedGroup(page);
    const before = await unionBox(page, [group]);
    await page.keyboard.down("Shift");
    await dragHandle(page, "southEast", 90, 10);
    await page.keyboard.up("Shift");
    const after = await settledBox(page, [group], before);
    expect({ left: after.left, top: after.top }).toEqual({ left: near(before.left), top: near(before.top) });
    const ratio = (b: Box) => (b.right - b.left) / (b.bottom - b.top);
    expect(ratio(after)).toBeCloseTo(ratio(before), 2);
  });

  test("AC-HANDLE-SCALE-5 — Alt pressed during the drag scales a group from its centre @feat:editor-tools.scale @feat:frames-paths.groups @level:happy", async ({
    page,
  }) => {
    const group = await clickedGroup(page);
    const before = await unionBox(page, [group]);
    const k = await cameraScale(page);
    await dragHandle(page, "southEast", 40, 20, () => page.keyboard.down("Alt"));
    await page.keyboard.up("Alt");
    const after = await settledBox(page, [group], before);
    // The centre stays; the grabbed corner follows the pointer and the
    // opposite one mirrors it.
    expect({ left: after.left, top: after.top, right: after.right, bottom: after.bottom }).toEqual({
      left: near(before.left - 40 / k),
      top: near(before.top - 20 / k),
      right: near(before.right + 40 / k),
      bottom: near(before.bottom + 20 / k),
    });
  });
});
