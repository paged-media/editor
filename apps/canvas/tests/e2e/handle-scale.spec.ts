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
      mutate: (m: unknown) => Promise<{ kind: string; payload?: { createdId?: Ref | null } }>;
      camera: { read: () => { scale: number } };
    };
    handle: { pageIds: string[] };
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

// ---- rotated items ------------------------------------------------------
//
// InDesign's rule for the axes, which the engine follows from 0.71.13:
// ONE selected item, a frame or a group, has its own box, turned with it,
// and scales along its own axes, so it stays a rectangle at its angle and
// a side handle changes only the dimension along its axis. SEVERAL items
// have a box aligned to the page, even when they share a rotation, and
// scale as one unit on the page axes, which shears the rotated ones. The
// canvas names the grabbed handle and the pivot on the box it draws.

type Pt = [number, number];

/** InDesign's rotation sense: `deg` counterclockwise on the page (y down). */
function rot(deg: number, tx: number, ty: number): number[] {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), -Math.sin(r), Math.sin(r), Math.cos(r), tx, ty];
}

/** Turn by `deg` about `p`. */
function rotAbout(deg: number, [px, py]: Pt): number[] {
  const [a, b, c, d] = rot(deg, 0, 0);
  return [a, b, c, d, px - (a * px + c * py), py - (b * px + d * py)];
}

const mutate = (page: Page, m: unknown) =>
  page.evaluate((m) => (globalThis as unknown as CanvasGlobal).__canvas.client.mutate(m), m);

/** A rectangle with `bounds` placed by `transform`, made over the wire. */
async function frame(page: Page, bounds: number[], transform?: number[]): Promise<Ref> {
  const pageId = await page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.handle.pageIds[0]);
  const made = await mutate(page, { op: "insertFrame", args: { pageId, bounds } });
  const id = made.payload?.createdId;
  expect(id, "insertFrame mints the frame").toBeTruthy();
  if (transform) {
    expect((await mutate(page, { op: "moveFrame", args: { frameId: id!.id, transform } })).kind).toBe("mutationApplied");
  }
  return id!;
}

/** An item's box, page space: its handles, and the probe's readback —
 *  edge lengths, the angle of its top edge (degrees, y down) and the angle
 *  between its top and left edges (90 = a rectangle). */
function measure(g: Geometry) {
  const [t, l, b, r] = g.bounds;
  const m = g.itemTransform ?? [1, 0, 0, 1, 0, 0];
  const at = (x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const nw = at(l, t);
  const ne = at(r, t);
  const sw = at(l, b);
  const u: Pt = [ne[0] - nw[0], ne[1] - nw[1]];
  const v: Pt = [sw[0] - nw[0], sw[1] - nw[1]];
  const w = Math.hypot(...u);
  const h = Math.hypot(...v);
  return {
    nw,
    se: at(r, b),
    east: at(r, (t + b) / 2),
    west: at(l, (t + b) / 2),
    w,
    h,
    topEdge: (Math.atan2(u[1], u[0]) * 180) / Math.PI,
    corner: (Math.acos((u[0] * v[0] + u[1] * v[1]) / (w * h)) * 180) / Math.PI,
  };
}

const measured = async (page: Page, ref: Ref) => measure((await geometry(page, [ref]))[0]);

const closePt = ([x, y]: Pt, digits = 0) => [expect.closeTo(x, digits), expect.closeTo(y, digits)];

/** Select by a script, then wait until the chrome's `handle` sits on
 *  `at` (page space): the selection box is drawn and current. */
async function selectAndSettle(page: Page, refs: Ref[], handle: string, at: () => Promise<Pt>): Promise<void> {
  await page.evaluate(
    (ids) =>
      (globalThis as unknown as CanvasGlobal).__canvas.client.executeScript(
        `paged.setElementSelection(${JSON.stringify(ids)})`,
      ),
    refs.map((r) => `${r.kind}:${r.id}`),
  );
  await expect.poll(async () => (await selection(page)).length).toBe(refs.length);
  await activateTool(page, "select");
  await expect
    .poll(async () => {
      const [x, y] = await at();
      const want = await screenPoint(page, x, y);
      const b = await page.locator(`[data-handle="${handle}"]`).first().boundingBox();
      return b !== null && Math.hypot(b.x + b.width / 2 - want.x, b.y + b.height / 2 - want.y) < 1;
    })
    .toBe(true);
}

test.describe("a handle drag on a rotated item", () => {
  test("AC-HANDLE-SCALE-6 — a 30° group's corner drag keeps its opposite corner, its angle and its members' shapes @feat:editor-tools.scale @feat:frames-paths.groups @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    // InDesign probe case 4c: a 160 × 60 and an 80 × 40, unrotated inside
    // a group turned 30°.
    const a = await frame(page, [200, 150, 260, 310]);
    const b = await frame(page, [280, 200, 320, 280]);
    const made = await mutate(page, { op: "createGroup", args: { memberIds: [a, b] } });
    const group = made.payload!.createdId!;
    await mutate(page, { op: "setGroupTransform", args: { groupId: group.id, transform: rotAbout(30, [150, 200]) } });

    const before = await measured(page, group);
    expect(before.topEdge).toBeCloseTo(-30, 1);
    await selectAndSettle(page, [group], "southEast", async () => (await measured(page, group)).se);
    const k = await cameraScale(page);
    await dragHandle(page, "southEast", 40, 30);
    await expect.poll(async () => (await measured(page, group)).w).toBeGreaterThan(before.w + 1);
    await page.waitForTimeout(200);

    const after = await measured(page, group);
    expect(after.nw, "the opposite corner stays").toEqual(closePt(before.nw));
    expect(after.se, "the grabbed corner follows the pointer").toEqual(
      closePt([before.se[0] + 40 / k, before.se[1] + 30 / k]),
    );
    expect(after.topEdge, "the group keeps its rotation").toBeCloseTo(-30, 1);
    expect(after.corner, "the group stays a rectangle").toBeCloseTo(90, 1);
    for (const member of [a, b]) {
      const m = await measured(page, member);
      expect(m.topEdge, "a member keeps its angle").toBeCloseTo(-30, 1);
      expect(m.corner, "a member stays a rectangle").toBeCloseTo(90, 1);
    }
  });

  for (const how of ["plain", "Cmd"] as const) {
    test(`AC-HANDLE-SCALE-7 — a side handle on a 30° frame lengthens it along its own axis only (${how}) @feat:editor-tools.scale @feat:editor-tools.resize.handles @level:edge`, async ({
      page,
    }) => {
      const designer = new Designer(page);
      await designer.open();
      await designer.newDocument();
      // 160 × 60 at 30° (InDesign probe case 1b's frame).
      const r = await frame(page, [0, 0, 60, 160], rot(30, 200, 400));
      const [raw] = await geometry(page, [r]);
      const before = await measured(page, r);
      await selectAndSettle(page, [r], "east", async () => (await measured(page, r)).east);
      const k = await cameraScale(page);

      // The pointer moves on the page axes; only its share along the
      // frame's own x axis counts.
      const [dx, dy] = [40, 25];
      if (how === "Cmd") await page.keyboard.down("Meta");
      await dragHandle(page, "east", dx, dy);
      if (how === "Cmd") await page.keyboard.up("Meta");
      const [ux, uy] = rot(30, 0, 0);
      const along = (dx * ux + dy * uy) / k;
      await expect.poll(async () => (await measured(page, r)).w).toBeGreaterThan(before.w + 1);
      await page.waitForTimeout(200);

      const after = await measured(page, r);
      expect(after.w, "longer by the drag along its own axis").toBeCloseTo(before.w + along, 0);
      expect(after.h, "no taller").toBeCloseTo(before.h, 1);
      expect(after.topEdge, "still at 30°").toBeCloseTo(-30, 1);
      expect(after.corner, "still a rectangle").toBeCloseTo(90, 1);
      expect(after.west, "the opposite side stays").toEqual(closePt(before.west));
      // A plain drag resizes the frame's bounds; Cmd scales its transform.
      const [now] = await geometry(page, [r]);
      if (how === "plain") {
        expect(now.itemTransform?.slice(0, 4)).toEqual(raw.itemTransform?.slice(0, 4));
      } else {
        expect(now.bounds).toEqual(raw.bounds);
      }
    });
  }

  test("AC-HANDLE-SCALE-8 — a mixed-rotation multi-selection scales as one unit on the page axes, as InDesign does @feat:editor-tools.scale @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    // InDesign probe cases 1d + 3b: a 160 × 60 at 30° and an 80 × 40 at 60°.
    const r30 = await frame(page, [0, 0, 60, 160], rot(30, 150, 300));
    const r60 = await frame(page, [0, 0, 40, 80], rot(60, 200, 420));
    const box = () => unionBox(page, [r30, r60]);
    const before = await box();
    await selectAndSettle(page, [r30, r60], "east", async () => {
      const u = await box();
      return [u.right, (u.top + u.bottom) / 2];
    });
    const k = await cameraScale(page);

    // The union's east side out by half its width: 150% along x.
    await dragHandle(page, "east", ((before.right - before.left) / 2) * k, 0);
    await expect.poll(async () => (await box()).right).toBeGreaterThan(before.right + 1);
    await page.waitForTimeout(200);

    const after = await box();
    expect(after.left, "the opposite side stays").toBeCloseTo(before.left, 0);
    expect(after.right - after.left).toBeCloseTo(1.5 * (before.right - before.left), 0);
    // InDesign's readback (scale-frame-probe, 3b): both are sheared.
    const m30 = await measured(page, r30);
    expect(m30.w).toBeCloseTo(222.71, 0);
    expect(m30.h).toBeCloseTo(68.74, 0);
    expect(m30.topEdge).toBeCloseTo(-21.05, 1);
    expect(m30.corner).toBeCloseTo(70.16, 1);
    const m60 = await measured(page, r60);
    expect(m60.w).toBeCloseTo(91.65, 0);
    expect(m60.h).toBeCloseTo(55.68, 0);
    expect(m60.topEdge).toBeCloseTo(-49.11, 1);
    expect(m60.corner).toBeCloseTo(70.16, 1);
  });
});
