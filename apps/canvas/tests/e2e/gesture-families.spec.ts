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

// E2E gesture suite — the composite family scenarios from the
// gesture test plan (thoughts/docs/paged/tests/gestures.md §4.6):
//
//   E2E-01  create rect → Shift-move → Alt-resize → Shift-rotate →
//           undo ×4 → redo ×4 (undo/redo through the REAL Cmd+Z
//           shortcut, create + move through REAL pointer events)
//   E2E-04  marquee-select a subset → rigid group drag → ONE undo
//           reverts all members (real-mouse marquee + drag; the
//           channel arm lives in tests/multi-select-snap.spec.ts)
//
// Real input is used where it proves the wiring (tool rail → draw
// handler → insertFrame; selected-body drag → worker translate;
// marquee → marqueeHits → selection). The resize/rotate legs run on
// the gesture channel — their UI handles are SVG overlay chrome that
// the per-gesture channel specs already pin down semantically.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { elementPageRectPt, type ElementRef } from "./harness/fixtures";
import {
  bounds,
  itemTransform,
  runGesture,
} from "./harness/gesture";
import { selectElements, clearSelection } from "./harness/ui";
import {
  activateTool,
  awaitGeometryMirror,
  dragMouse,
  loadViaReactPath,
  screenPoint,
  treeCount,
  treeIds,
} from "./harness/viewport";

interface PtRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

function expectRectClose(a: PtRect, b: PtRect, digits = 1): void {
  expect(a.top).toBeCloseTo(b.top, digits);
  expect(a.left).toBeCloseTo(b.left, digits);
  expect(a.bottom).toBeCloseTo(b.bottom, digits);
  expect(a.right).toBeCloseTo(b.right, digits);
}

/** Draw a rectangle with the REAL Rectangle tool between two
 *  page-0-local pt points; returns the new element's ref. */
async function drawRect(
  page: Page,
  fromPt: [number, number],
  toPt: [number, number],
): Promise<ElementRef> {
  const before = await treeIds(page, "rectangle");
  const seen = new Set(before.map((r) => r.id));
  await activateTool(page, "shape");
  const from = await screenPoint(page, fromPt[0], fromPt[1]);
  const to = await screenPoint(page, toPt[0], toPt[1]);
  await dragMouse(page, from, to);
  await expect
    .poll(() => treeCount(page, "rectangle"), { timeout: 5_000 })
    .toBe(before.length + 1);
  const after = await treeIds(page, "rectangle");
  const fresh = after.find((r) => !seen.has(r.id));
  expect(fresh, "the draw landed a new rectangle").toBeTruthy();
  return fresh!;
}

test.describe("E2E-01 — create → Shift-move → Alt-resize → Shift-rotate → undo×4 → redo×4", () => {
  test("AC-E2E-GEST-FAM-1 @feat:editor-tools.draw.rectangle @feat:editor-tools.move.translate @feat:editor-tools.select.click-marquee @level:happy", async ({ page }) => {
    test.setTimeout(180_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];
    const rectCount0 = await treeCount(page, "rectangle");

    // ── create (real mouse, Rectangle tool) ─────────────────────
    const ref = await drawRect(
      page,
      [p0.widthPt * 0.12, p0.heightPt * 0.12],
      [p0.widthPt * 0.3, p0.heightPt * 0.26],
    );
    const afterCreate = (await elementPageRectPt(page, ref))!;

    // ── Shift-move (real mouse, select tool) ────────────────────
    await activateTool(page, "select");
    await selectElements(page, [ref]);
    await awaitGeometryMirror(page, 1);
    const cx = (afterCreate.left + afterCreate.right) / 2;
    const cy = (afterCreate.top + afterCreate.bottom) / 2;
    const start = await screenPoint(page, cx, cy);
    const dxPx = 84;
    const dyPx = 10; // off-axis noise Shift must suppress
    await page.keyboard.down("Shift");
    await dragMouse(
      page,
      start,
      { x: start.x + dxPx, y: start.y + dyPx },
      { settleMs: 200 },
    );
    await page.keyboard.up("Shift");
    // Worker commit lands asynchronously after pointer-up.
    await expect
      .poll(
        async () => (await elementPageRectPt(page, ref))!.left - afterCreate.left,
        { timeout: 5_000 },
      )
      .toBeGreaterThan(dxPx / start.scale - 6);
    const afterMove = (await elementPageRectPt(page, ref))!;
    // Dominant-axis: y exactly suppressed; x within snap tolerance.
    expect(
      Math.abs(afterMove.top - afterCreate.top),
      "TR-01: Shift suppressed the off-axis drift",
    ).toBeLessThan(0.75);
    expect(afterMove.left - afterCreate.left).toBeGreaterThan(
      dxPx / start.scale - 6,
    );
    expect(afterMove.left - afterCreate.left).toBeLessThan(
      dxPx / start.scale + 6,
    );

    // ── Alt-resize from centre (channel) ────────────────────────
    const b0 = await bounds(page, ref);
    await runGesture(page, [ref], { kind: "resize", handle: "southEast" }, [
      { delta: [30, 18], mods: { shift: false, alt: true, disableSnap: true } },
    ]);
    const b1 = await bounds(page, ref);
    expect((b1[1] + b1[3]) / 2, "TR-03: centre x fixed").toBeCloseTo(
      (b0[1] + b0[3]) / 2,
      2,
    );
    expect((b1[0] + b1[2]) / 2, "TR-03: centre y fixed").toBeCloseTo(
      (b0[0] + b0[2]) / 2,
      2,
    );
    expect(b1[3] - b1[1]).toBeCloseTo(b0[3] - b0[1] + 60, 1);
    expect(b1[2] - b1[0]).toBeCloseTo(b0[2] - b0[0] + 36, 1);
    const afterResize = (await elementPageRectPt(page, ref))!;

    // ── Shift-rotate (channel; snaps to 15°) ────────────────────
    const rcx = (afterResize.left + afterResize.right) / 2;
    const rcy = (afterResize.top + afterResize.bottom) / 2;
    await runGesture(
      page,
      [ref],
      { kind: "rotate" },
      [{ delta: [0, -30], mods: { shift: true, alt: false } }],
      { anchor: { pageId: p0.pageId, pointInPage: [rcx + 100, rcy] } },
    );
    const t = await itemTransform(page, ref);
    expect(t, "rotation committed a transform").not.toBeNull();
    const angle = (Math.atan2(t![1], t![0]) * 180) / Math.PI;
    expect(Math.abs(angle), "rotation applied").toBeGreaterThan(1);
    expect(angle, "TR-05: angle snapped to 15° step").toBeCloseTo(
      Math.round(angle / 15) * 15,
      1,
    );
    const afterRotate = (await elementPageRectPt(page, ref))!;

    // ── undo ×4 through the REAL shortcut ───────────────────────
    // Each press walks one Operation back: rotate → resize → move →
    // create. Polls because the keydown → worker → reply is async.
    await page.keyboard.press("ControlOrMeta+z");
    await expect
      .poll(async () => (await elementPageRectPt(page, ref))!.right)
      .toBeCloseTo(afterResize.right, 1);
    expectRectClose((await elementPageRectPt(page, ref))!, afterResize);

    await page.keyboard.press("ControlOrMeta+z");
    await expect
      .poll(async () => (await elementPageRectPt(page, ref))!.right)
      .toBeCloseTo(afterMove.right, 1);
    expectRectClose((await elementPageRectPt(page, ref))!, afterMove);

    await page.keyboard.press("ControlOrMeta+z");
    await expect
      .poll(async () => (await elementPageRectPt(page, ref))!.left)
      .toBeCloseTo(afterCreate.left, 1);
    expectRectClose((await elementPageRectPt(page, ref))!, afterCreate);

    await page.keyboard.press("ControlOrMeta+z");
    await expect
      .poll(() => treeCount(page, "rectangle"), { timeout: 5_000 })
      .toBe(rectCount0);

    // ── redo ×4 restores the final state ────────────────────────
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ControlOrMeta+Shift+z");
      await page.waitForTimeout(150);
    }
    await expect
      .poll(() => treeCount(page, "rectangle"), { timeout: 5_000 })
      .toBe(rectCount0 + 1);
    await expect
      .poll(async () => (await elementPageRectPt(page, ref))!.right, {
        timeout: 5_000,
      })
      .toBeCloseTo(afterRotate.right, 1);
    expectRectClose((await elementPageRectPt(page, ref))!, afterRotate);
    const tRedo = await itemTransform(page, ref);
    const angleRedo = (Math.atan2(tRedo![1], tRedo![0]) * 180) / Math.PI;
    expect(angleRedo, "redo restored the snapped rotation").toBeCloseTo(
      angle,
      1,
    );
  });
});

test.describe("E2E-04 — marquee subset → rigid group drag → one undo", () => {
  test("AC-E2E-GEST-FAM-2 @feat:editor-tools.draw.rectangle @feat:editor-tools.move.translate @feat:editor-tools.select.click-marquee @level:happy", async ({ page }) => {
    test.setTimeout(180_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    // Stage two fresh rects in the top-left quarter (real draws).
    const a = await drawRect(
      page,
      [p0.widthPt * 0.08, p0.heightPt * 0.08],
      [p0.widthPt * 0.2, p0.heightPt * 0.18],
    );
    const b = await drawRect(
      page,
      [p0.widthPt * 0.26, p0.heightPt * 0.08],
      [p0.widthPt * 0.38, p0.heightPt * 0.18],
    );
    const rectA = (await elementPageRectPt(page, a))!;
    const rectB = (await elementPageRectPt(page, b))!;

    // Marquee box = union of A+B inflated 6 pt. Precondition: no
    // OTHER frame's AABB intersects it (AABB-intersect is a superset
    // of precise intersect, so "no AABB hit" ⇒ "no marquee hit") —
    // the expected selection is then exactly {A, B}.
    const box: PtRect = {
      top: Math.min(rectA.top, rectB.top) - 6,
      left: Math.min(rectA.left, rectB.left) - 6,
      bottom: Math.max(rectA.bottom, rectB.bottom) + 6,
      right: Math.max(rectA.right, rectB.right) + 6,
    };
    for (const f of fx.frames.filter((f) => f.pageIndex === 0)) {
      const r = await elementPageRectPt(page, f.ref);
      if (!r) continue;
      const intersects =
        r.left < box.right &&
        r.right > box.left &&
        r.top < box.bottom &&
        r.bottom > box.top;
      expect(
        intersects,
        `staging precondition: fixture frame ${f.ref.kind}:${f.ref.id} must not intersect the marquee box`,
      ).toBe(false);
    }

    // ── real-mouse marquee ──────────────────────────────────────
    await activateTool(page, "select");
    await clearSelection(page);
    const m0 = await screenPoint(page, box.left, box.top);
    const m1 = await screenPoint(page, box.right, box.bottom);
    await dragMouse(page, m0, m1);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (
                globalThis as unknown as {
                  __canvas: { elementSelection?: Array<{ id: string }> };
                }
              ).__canvas.elementSelection?.map((e) => e.id) ?? [],
          ),
        { timeout: 5_000 },
      )
      .toEqual(expect.arrayContaining([a.id, b.id]));
    const selected = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas: { elementSelection?: Array<{ id: string }> };
          }
        ).__canvas.elementSelection ?? [],
    );
    expect(selected.length, "SEL-01: exactly the staged subset").toBe(2);
    await awaitGeometryMirror(page, 2);

    // ── rigid group drag (real mouse on A's body) ───────────────
    const ax = (rectA.left + rectA.right) / 2;
    const ay = (rectA.top + rectA.bottom) / 2;
    const g0 = await screenPoint(page, ax, ay);
    const dxPx = 60;
    const dyPx = 45;
    await dragMouse(
      page,
      g0,
      { x: g0.x + dxPx, y: g0.y + dyPx },
      { settleMs: 200 },
    );
    await expect
      .poll(
        async () => (await elementPageRectPt(page, a))!.left - rectA.left,
        { timeout: 5_000 },
      )
      .toBeGreaterThan(dxPx / g0.scale - 6);
    const movedA = (await elementPageRectPt(page, a))!;
    const movedB = (await elementPageRectPt(page, b))!;
    const dA: [number, number] = [
      movedA.left - rectA.left,
      movedA.top - rectA.top,
    ];
    const dB: [number, number] = [
      movedB.left - rectB.left,
      movedB.top - rectB.top,
    ];
    expect(dB[0], "rigid: B carried A's x delta").toBeCloseTo(dA[0], 1);
    expect(dB[1], "rigid: B carried A's y delta").toBeCloseTo(dA[1], 1);

    // ── ONE undo reverts the whole multi-drag (INV-1 for N>1) ───
    await page.keyboard.press("ControlOrMeta+z");
    await expect
      .poll(async () => (await elementPageRectPt(page, a))!.left, {
        timeout: 5_000,
      })
      .toBeCloseTo(rectA.left, 1);
    expectRectClose((await elementPageRectPt(page, a))!, rectA);
    expectRectClose((await elementPageRectPt(page, b))!, rectB);
  });
});
