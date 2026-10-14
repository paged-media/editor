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

// A selected group is drawn and handled as one object. The engine answers
// a group's box (0.71.11: its members' union in the group's frame), so a
// click on a group draws ONE box with handles, a body drag moves both
// members, and a handle drag scales them together: a group has no bounds
// of its own to resize, so its handles drive the matrix scale a
// multi-selection uses (as InDesign scales a group's contents).

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../journey/driver/designer";
import { activateTool, screenPoint } from "./harness/viewport";

type Ref = { kind: string; id: string };
type Geometry = { id: Ref; bounds: number[]; itemTransform: number[] | null };

interface CanvasGlobal {
  __canvas: {
    elementSelection: Ref[];
    client: {
      elementGeometry: (ids: Ref[]) => Promise<Geometry[]>;
      executeScript: (s: string) => Promise<{ output: string[]; error: string | null }>;
      undo: () => Promise<unknown>;
    };
  };
}

const geometry = (page: Page, ids: Ref[]) =>
  page.evaluate((ids) => (globalThis as unknown as CanvasGlobal).__canvas.client.elementGeometry(ids), ids);

const selection = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.elementSelection);

const drawnBoxes = (page: Page) => page.locator('polygon[stroke="var(--overlay-selection)"]');

/** Two rectangles grouped through Object ▸ Group, then selected by a click. */
async function clickedGroup(page: Page): Promise<{ group: Ref; leaves: Ref[] }> {
  const designer = new Designer(page);
  await designer.open();
  await designer.newDocument();
  const a = await designer.drawRectangle({ x0: 100, y0: 100, x1: 200, y1: 180 });
  const b = await designer.drawRectangle({ x0: 240, y0: 100, x1: 340, y1: 180 });
  const leaves = [
    { kind: "rectangle", id: a },
    { kind: "rectangle", id: b },
  ];
  await page.evaluate(
    (ids) =>
      (globalThis as unknown as CanvasGlobal).__canvas.client.executeScript(
        `paged.setElementSelection(${JSON.stringify(ids)})`,
      ),
    leaves.map((l) => `${l.kind}:${l.id}`),
  );
  await expect.poll(async () => (await selection(page)).length).toBe(2);
  await designer.runCommand("paged.object.group");
  await activateTool(page, "select");
  const p = await screenPoint(page, 150, 140);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await selection(page)).map((r) => r.kind)).toEqual(["group"]);
  return { group: (await selection(page))[0], leaves };
}

test.describe("a selected group", () => {
  test("AC-GROUP-BOX-1 — a click on a group draws one box around both members @feat:editor-tools.overlays @feat:frames-paths.groups @level:happy", async ({
    page,
  }) => {
    const { group } = await clickedGroup(page);
    const [box] = await geometry(page, [group]);
    expect(box.bounds).toEqual([
      expect.closeTo(100, 1),
      expect.closeTo(100, 1),
      expect.closeTo(180, 1),
      expect.closeTo(340, 1),
    ]);
    await expect(drawnBoxes(page)).toHaveCount(1);
    await expect(page.locator('[data-handle="southEast"]').first()).toBeVisible();
  });

  test("AC-GROUP-BOX-2 — a body drag moves the group, a corner drag scales both members, one undo each @feat:editor-tools.move.translate @feat:frames-paths.groups @level:happy", async ({
    page,
  }) => {
    const { group, leaves } = await clickedGroup(page);
    const before = await geometry(page, leaves);

    const from = await screenPoint(page, 150, 140);
    const to = await screenPoint(page, 190, 200);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await geometry(page, [group]))[0].itemTransform?.slice(4)).toEqual([
      expect.closeTo(40, 0),
      expect.closeTo(60, 0),
    ]);
    const moved = await geometry(page, leaves);
    expect(moved[0].itemTransform).toEqual(moved[1].itemTransform);

    const handle = page.locator('[data-handle="southEast"]').first();
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 60, hb.y + 40, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const t = (await geometry(page, [group]))[0].itemTransform ?? [1, 0, 0, 1, 0, 0];
        return t[0] > 1.05 && t[3] > 1.05;
      })
      .toBe(true);
    const scaled = await geometry(page, leaves);
    expect(scaled[0].itemTransform, "both members scale together").toEqual(scaled[1].itemTransform);

    // One undo per gesture: the scale, then the move.
    await page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.client.undo());
    await expect.poll(async () => (await geometry(page, leaves))[0].itemTransform).toEqual(moved[0].itemTransform);
    await page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.client.undo());
    await expect.poll(async () => (await geometry(page, leaves)).map((g) => g.itemTransform)).toEqual(
      before.map((g) => g.itemTransform),
    );
  });
});
