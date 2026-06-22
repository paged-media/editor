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

// E2E gesture suite — the four cross-cutting scenarios from the
// gesture & interaction test plan (thoughts/docs/paged/tests/gestures.md
// §4.6), formerly deferred in gesture-plan-deferred.spec.ts:
//
//   E2E-08  pan/zoom DURING an in-flight tool gesture (PZ-04) — the
//           classic "scroll/zoom while dragging" bug source. A ctrl-
//           wheel zoom-in fires mid-drag; the committed frame must land
//           at the document point the pointer anchored to, NOT the
//           screen point (the gesture re-derives its delta in doc space
//           from the begin-anchor through the LIVE camera).
//   E2E-09  floating-pane interplay (IN-08) — a pane floated OVER the
//           canvas must absorb its own pointer drags (no leak into a
//           canvas tool gesture) while a canvas drag in the uncovered
//           region still works (no leak the other way). The cockpit has
//           no popped-out canvas pane (the dockview float of the
//           original plan is gone), so this proves the underlying
//           isolation contract: pointer hit-testing routes a drag to
//           the topmost `pointer-events:auto` element, and the real
//           docked panel + a floating overlay both honour it.
//   E2E-10  devicePixelRatio variation (IN-06) — at DPR 2 a drawn
//           frame must land at the SAME model coordinates as at DPR 1;
//           the client→doc mapping works in CSS px and is DPR-invariant.
//   E2E-11  pointer-capture loss mid-gesture (GSM-07, INV-8) — a
//           `pointercancel` (capture stolen) and a window `blur`
//           (alt-tab away) must ABORT the gesture: zero commit, zero
//           mutation, model byte-identical, no stuck drag state. This
//           caught a real bug — see the FIX note below.
//
// FIX (gesture layer): ViewportCanvas previously aliased
// `onPointerCancel={onPointerUp}`, so a `pointercancel` mid-drag
// COMMITTED the interrupted gesture (a phantom mutation), and there was
// NO window-blur listener at all (the gesture stayed open until the
// next pointer event, which then committed a stale delta). Fixed in
// apps/canvas/src/ui/ViewportCanvas.tsx (dedicated onPointerCancel +
// blur listener → abortActiveDrag) and apps/canvas/src/ui/
// useGestureSpine.ts (ToolGestureDispatch.onCancel → the draw handler's
// Escape-equivalent cancel). E2E-11 below is the regression guard.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { elementPageRectPt, type ElementRef } from "./harness/fixtures";
import {
  countKind,
  drainGestureLog,
  installGestureRecorder,
} from "./harness/gesture";
import { dumpElement } from "./harness/model-dump";
import {
  awaitGeometryMirror,
  cameraScale,
  loadViaReactPath,
  screenPoint,
  treeCount,
} from "./harness/viewport";

interface PtRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

function centroid(r: PtRect): [number, number] {
  return [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
}

/** Dispatch a native event the React synthetic system listens for on
 *  the viewport wrapper (the `<canvas>`'s parent). Used for the events
 *  Playwright's high-level mouse/keyboard API can't synthesise:
 *  `pointercancel` and a ctrl-modified `wheel`. */
async function dispatchOnWrapper(
  page: Page,
  type: string,
  init: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(
    ({ type, init }) => {
      const cv = document.querySelector("canvas");
      const wrapper = cv?.parentElement as HTMLElement;
      const Ctor =
        type === "wheel"
          ? WheelEvent
          : type.startsWith("pointer")
            ? PointerEvent
            : Event;
      wrapper.dispatchEvent(
        new Ctor(type, { bubbles: true, cancelable: true, ...init }),
      );
    },
    { type, init },
  );
}

/** Page-local model bounds of every rectangle, freshest tree walk. */
async function allRectBounds(
  page: Page,
): Promise<Array<{ id: string; bounds: [number, number, number, number] }>> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
            elementProperties: (id: unknown) => Promise<{
              entries: Array<{ path: string; value: unknown }>;
            } | null>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.tree()");
    const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
      id?: { kind: string; id: string } | null;
      children?: unknown[];
    }>;
    const ids: Array<{ kind: string; id: string }> = [];
    const visit = (n: {
      id?: { kind: string; id: string } | null;
      children?: unknown[];
    }) => {
      if (n.id && n.id.kind === "rectangle") ids.push(n.id);
      for (const ch of (n.children ?? []) as typeof tree) visit(ch);
    };
    for (const root of tree) visit(root);
    const out: Array<{ id: string; bounds: [number, number, number, number] }> =
      [];
    for (const id of ids) {
      const props = await c.client.elementProperties(id);
      const b = props?.entries.find((e) => e.path === "frameBounds")?.value as
        | { type: string; value: number[] }
        | undefined;
      if (b?.type === "bounds")
        out.push({
          id: id.id,
          bounds: b.value as [number, number, number, number],
        });
    }
    return out;
  });
}

// ── E2E-08 — pan/zoom mid-gesture (PZ-04) ─────────────────────────

test.describe("E2E-08 — pan/zoom during an in-flight gesture", () => {
  test("AC-E2E-PZ-1 — ctrl-wheel zoom-in mid select-drag keeps the move anchored in model space", async ({
    page,
  }) => {
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    expect(target, "geometry fixture has a rectangle").toBeTruthy();
    const before = (await elementPageRectPt(page, target.ref))!;
    const [cx, cy] = centroid(before);

    // Select through the real click path so the geometry mirror the
    // viewport reads for body-drag routing refreshes.
    const start = await screenPoint(page, cx, cy);
    await page.mouse.click(start.x, start.y);
    await awaitGeometryMirror(page, 1);

    const scaleBefore = await cameraScale(page);

    // Begin the drag, move halfway toward the document target, then
    // zoom IN (ctrl-wheel) anchored at the pointer — the moment the
    // classic bug surfaces (camera changes mid-gesture).
    const dxPt = 60;
    const dyPt = 40;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const end1 = await screenPoint(page, cx + dxPt, cy + dyPt);
    const midX = (start.x + end1.x) / 2;
    const midY = (start.y + end1.y) / 2;
    await page.mouse.move(midX, midY, { steps: 4 });
    await page.waitForTimeout(80);

    await dispatchOnWrapper(page, "wheel", {
      deltaY: -240,
      ctrlKey: true,
      clientX: midX,
      clientY: midY,
    });
    await page.waitForTimeout(150);
    const scaleAfter = await cameraScale(page);
    expect(scaleAfter, "the mid-drag zoom actually changed the camera").toBeGreaterThan(
      scaleBefore * 1.5,
    );

    // Continue the drag to the (now re-projected) screen position of the
    // intended document target, then release.
    const end2 = await screenPoint(page, cx + dxPt, cy + dyPt);
    await page.mouse.move(end2.x, end2.y, { steps: 4 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = (await elementPageRectPt(page, target.ref))!;
    const [acx, acy] = centroid(after);
    // The frame followed the DOCUMENT point, not the screen point: it
    // moved by ~ the intended pt delta despite the 1.5×+ zoom. Tolerance
    // matches the transform-gesture specs (snap may nudge a few pt); a
    // screen-space bug would miss by tens of pt at this zoom.
    expect(Math.abs(acx - (cx + dxPt)), "x anchored to the document point").toBeLessThan(
      8,
    );
    expect(Math.abs(acy - (cy + dyPt)), "y anchored to the document point").toBeLessThan(
      8,
    );
  });
});

// ── E2E-09 — floating-pane interplay (IN-08) ──────────────────────

test.describe("E2E-09 — floating pane over the canvas", () => {
  test("AC-E2E-FLOAT-1 — a drag on a pane floated over the canvas does not leak into a tool gesture, and a canvas drag beside it still draws", async ({
    page,
  }) => {
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    await page.locator('[data-tool-slot="shape"]').click();
    await page.waitForTimeout(100);

    // Screen rect of the canvas-local region the pane will cover.
    const a = await screenPoint(page, p0.widthPt * 0.3, p0.heightPt * 0.3);
    const b = await screenPoint(page, p0.widthPt * 0.55, p0.heightPt * 0.55);

    // Mount a real floating "popped-out panel" over that region: an
    // absolutely-positioned, pointer-events:auto surface above the
    // canvas, with its own pointer handler (a panel would have one).
    await page.evaluate(
      ({ a, b }) => {
        const pane = document.createElement("div");
        pane.id = "__e2e_float_pane";
        Object.assign(pane.style, {
          position: "fixed",
          left: `${Math.min(a.x, b.x) - 16}px`,
          top: `${Math.min(a.y, b.y) - 16}px`,
          width: `${Math.abs(b.x - a.x) + 64}px`,
          height: `${Math.abs(b.y - a.y) + 64}px`,
          zIndex: "9999",
          background: "rgba(0,0,0,0.25)",
        } as CSSStyleDeclaration);
        (window as unknown as { __paneHits: number }).__paneHits = 0;
        pane.addEventListener("pointerdown", () => {
          (window as unknown as { __paneHits: number }).__paneHits += 1;
        });
        document.body.appendChild(pane);
      },
      { a, b },
    );

    // ── leak check 1: pane → canvas. A drag wholly inside the pane
    //    must hit the PANE (its handler fires) and draw NOTHING. ──
    const beforePane = await treeCount(page, "rectangle");
    const pcx = (a.x + b.x) / 2;
    const pcy = (a.y + b.y) / 2;
    await page.mouse.move(pcx - 12, pcy - 12);
    await page.mouse.down();
    await page.mouse.move(pcx + 30, pcy + 30, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const paneHits = await page.evaluate(
      () => (window as unknown as { __paneHits: number }).__paneHits,
    );
    const afterPane = await treeCount(page, "rectangle");
    expect(paneHits, "the pane received the pointerdown").toBeGreaterThanOrEqual(1);
    expect(
      afterPane,
      "INV/IN-08: the pane drag did NOT leak into a canvas tool gesture",
    ).toBe(beforePane);

    // ── leak check 2: canvas → still works beside the pane. A drag in
    //    an UNCOVERED canvas region draws exactly one frame. ──
    const c0 = await screenPoint(page, p0.widthPt * 0.72, p0.heightPt * 0.2);
    const c1 = await screenPoint(page, p0.widthPt * 0.88, p0.heightPt * 0.4);
    await page.mouse.move(c0.x, c0.y);
    await page.mouse.down();
    await page.waitForTimeout(40);
    await page.mouse.move(c1.x, c1.y, { steps: 6 });
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(400);

    expect(
      await treeCount(page, "rectangle"),
      "a canvas drag beside the floating pane still draws",
    ).toBe(beforePane + 1);

    // The pane received only its own pointerdown, never the canvas one.
    expect(
      await page.evaluate(
        () => (window as unknown as { __paneHits: number }).__paneHits,
      ),
      "the canvas drag did NOT leak into the pane",
    ).toBe(paneHits);

    await page.evaluate(() =>
      document.getElementById("__e2e_float_pane")?.remove(),
    );
  });
});

// ── E2E-10 — devicePixelRatio variation (IN-06) ───────────────────

test.describe("E2E-10 — devicePixelRatio variation", () => {
  test.use({ deviceScaleFactor: 2 });

  test("AC-E2E-DPR-1 — at DPR 2 a drawn frame lands at the same model coordinates as the page-local drag rect", async ({
    page,
  }) => {
    expect(
      await page.evaluate(() => window.devicePixelRatio),
      "the context is running at DPR 2",
    ).toBe(2);

    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    await page.locator('[data-tool-slot="shape"]').click();
    await page.waitForTimeout(100);

    // Drag from one page-local pt point to another; the drawn frame's
    // model bounds must equal that page-local rect (normalised) — the
    // client→doc mapping is CSS-px based and DPR-invariant.
    const px0 = p0.widthPt * 0.25;
    const py0 = p0.heightPt * 0.25;
    const px1 = p0.widthPt * 0.5;
    const py1 = p0.heightPt * 0.5;
    const expected: [number, number, number, number] = [
      Math.min(py0, py1),
      Math.min(px0, px1),
      Math.max(py0, py1),
      Math.max(px0, px1),
    ];

    const beforeIds = new Set(
      (await allRectBounds(page)).map((r) => r.id),
    );
    const s0 = await screenPoint(page, px0, py0);
    const s1 = await screenPoint(page, px1, py1);
    await page.mouse.move(s0.x, s0.y);
    await page.mouse.down();
    await page.waitForTimeout(40);
    await page.mouse.move(s1.x, s1.y, { steps: 6 });
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(400);

    const afterRects = await allRectBounds(page);
    const drawn = afterRects.find((r) => !beforeIds.has(r.id));
    expect(drawn, "exactly one new rectangle was drawn").toBeTruthy();
    const [t, l, btm, r] = drawn!.bounds;
    // ≤ 2 pt: the screen→doc round-trip + 6-step mouse interpolation can
    // land sub-pt off; a DPR-confusion bug would be off by ~2× (tens of
    // pt), not fractions.
    expect(Math.abs(t - expected[0]), "top in model pt").toBeLessThan(2);
    expect(Math.abs(l - expected[1]), "left in model pt").toBeLessThan(2);
    expect(Math.abs(btm - expected[2]), "bottom in model pt").toBeLessThan(2);
    expect(Math.abs(r - expected[3]), "right in model pt").toBeLessThan(2);
  });
});

// ── E2E-11 — pointer-capture loss mid-gesture (GSM-07, INV-8) ──────

test.describe("E2E-11 — pointer-capture loss aborts the gesture", () => {
  async function selectAndStartDrag(
    page: Page,
    ref: ElementRef,
    rect: PtRect,
  ): Promise<{ modelBefore: string; start: { x: number; y: number } }> {
    const [cx, cy] = centroid(rect);
    const start = await screenPoint(page, cx, cy);
    await page.mouse.click(start.x, start.y);
    await awaitGeometryMirror(page, 1);

    const modelBefore = await dumpElement(page, ref);
    await installGestureRecorder(page);
    await drainGestureLog(page);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y + 25, { steps: 5 });
    await page.waitForTimeout(120); // let the SAB drain apply the preview
    return { modelBefore, start };
  }

  test("AC-E2E-CAPLOSS-1 — pointercancel mid select-drag aborts (no commit, no mutation, model intact)", async ({
    page,
  }) => {
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    const rect = (await elementPageRectPt(page, target.ref))!;
    const { modelBefore } = await selectAndStartDrag(page, target.ref, rect);

    // Capture stolen: a native pointercancel on the wrapper.
    await dispatchOnWrapper(page, "pointercancel", { pointerId: 1 });
    await page.waitForTimeout(250);
    // A real pointer would still send its up afterwards; it must be inert.
    await page.mouse.up();
    await page.waitForTimeout(200);

    const log = await drainGestureLog(page);
    expect(
      countKind(log, "gestureCancelled"),
      "INV-8: pointercancel maps to abort",
    ).toBeGreaterThanOrEqual(1);
    expect(
      countKind(log, "gestureCommitted"),
      "INV-1: a cancelled gesture commits nothing",
    ).toBe(0);
    expect(
      countKind(log, "mutationApplied"),
      "INV-1: no mutation lands on abort",
    ).toBe(0);
    expect(
      await dumpElement(page, target.ref),
      "INV-2: the model is byte-identical to pre-drag",
    ).toBe(modelBefore);
  });

  test("AC-E2E-CAPLOSS-2 — window blur mid select-drag aborts; the late pointer-up is inert", async ({
    page,
  }) => {
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    const rect = (await elementPageRectPt(page, target.ref))!;
    const { modelBefore } = await selectAndStartDrag(page, target.ref, rect);

    // Alt-tab away: the window blurs while the drag is mid-flight.
    await dispatchOnWrapper(page, "blur", {});
    await page.waitForTimeout(200);

    const blurLog = await drainGestureLog(page);
    expect(
      countKind(blurLog, "gestureCancelled"),
      "INV-8: blur aborts the in-flight gesture at blur time",
    ).toBeGreaterThanOrEqual(1);
    expect(countKind(blurLog, "gestureCommitted"), "INV-1: no commit on blur").toBe(0);

    // The pointer eventually releases (focus returns); the stale up
    // must not resurrect / commit the aborted gesture.
    await page.mouse.up();
    await page.waitForTimeout(200);
    const upLog = await drainGestureLog(page);
    expect(
      countKind(upLog, "gestureCommitted"),
      "INV-8: the late pointer-up is inert (no stuck drag to commit)",
    ).toBe(0);
    expect(countKind(upLog, "mutationApplied")).toBe(0);

    expect(
      await dumpElement(page, target.ref),
      "INV-2: the model is byte-identical to pre-drag",
    ).toBe(modelBefore);
  });

  test("AC-E2E-CAPLOSS-3 — pointercancel mid draw-tool drag creates no frame", async ({
    page,
  }) => {
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];
    const before = await treeCount(page, "rectangle");

    await page.locator('[data-tool-slot="shape"]').click();
    await page.waitForTimeout(100);

    const s0 = await screenPoint(page, p0.widthPt * 0.2, p0.heightPt * 0.2);
    await page.mouse.move(s0.x, s0.y);
    await page.mouse.down();
    await page.mouse.move(s0.x + 60, s0.y + 45, { steps: 5 });
    await page.waitForTimeout(80);

    await dispatchOnWrapper(page, "pointercancel", { pointerId: 1 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    expect(
      await treeCount(page, "rectangle"),
      "GSM-07: a cancelled draw inserts no frame",
    ).toBe(before);
  });
});
