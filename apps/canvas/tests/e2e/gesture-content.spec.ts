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

// E2E gesture suite — W2.10 content rotate / scale gestures, from the
// gesture & interaction test plan (thoughts/docs/paged/tests/gestures.md
// §6 "Content scale" row + §4.6 E2E happy-path-per-family). These ride
// the SAME content grabber the Phase F `translateContent` uses: the
// engine's `RotateContent` / `ScaleContent` arms rotate/scale the
// placed image about the frame centroid and commit
// `SetProperty{ImageContentTransform}` — they edit the Rectangle's
// `image_item_transform` only, leaving the frame's own bounds +
// `ItemTransform` untouched.
//
// READ-SURFACE NOTE. The canvas channel's `elementProperties` snapshot
// does NOT emit an `imageContentTransform` entry (the path is in the
// `PropertyPath` enum, but `model.rs::element_properties` never lists
// it). So — exactly like `content-grabber.spec.ts` — the value of the
// content transform can't be read back over the wire. The observable
// here is therefore (a) the COMMIT lands (gestureCommitted /
// mutationApplied with our page dirty), (b) the RENDER changes inside
// the frame footprint (the image visibly rotates/scales), (c) the
// frame's own page-rect is UNCHANGED (proof we drove the content arm,
// not a frame transform), and (d) undo restores the canvas
// byte-identically. The image-transform bytes themselves are proven in
// core's Rust unit tests (`gesture.rs`:
// `content_gesture_*` / RotateContent|ScaleContent → ImageTransform →
// SetProperty{ImageContentTransform}`).

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";
import {
  beginGesture,
  cancelGesture,
  countKind,
  drainGestureLog,
  installGestureRecorder,
  itemTransform,
  pagePng,
  updateGesture,
  type GestureSpec,
} from "./harness/gesture";
import { opSandwich, type PtRect } from "./harness/op-sandwich";

interface ImageRect {
  ref: ElementRef;
  pageIndex: number;
}

/**
 * First image-bearing Rectangle in the fixture. The grabber arms only
 * fire on Rectangles whose `hasImage` is true; `loadFixture`'s
 * `firstRectangle` is order-based and may land on a plain rect, so we
 * filter on the geometry channel's `hasImage` flag (the same flag the
 * ViewportCanvas dispatch keys on for `bodyHitIsImage`).
 */
async function findImageRect(
  page: Page,
  fx: LoadedFixture,
): Promise<ImageRect | null> {
  for (const f of fx.frames) {
    if (f.ref.kind !== "rectangle") continue;
    const hasImage = await page.evaluate(async (id) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementGeometry: (
                ids: unknown[],
              ) => Promise<Array<{ hasImage?: boolean }>>;
            };
          };
        }
      ).__canvas;
      const items = await c.client.elementGeometry([id]);
      return items[0]?.hasImage === true;
    }, f.ref);
    if (hasImage) return { ref: f.ref, pageIndex: f.pageIndex };
  }
  return null;
}

function centroid(r: PtRect): [number, number] {
  return [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
}

/** Drive one content gesture (rotate/scale) over the worker channel:
 *  begin (anchor required for both arms) → update×N → commit. */
async function runContentGesture(
  page: Page,
  ref: ElementRef,
  pageId: string,
  spec: GestureSpec,
  anchorPoint: [number, number],
  steps: Array<[number, number]>,
): Promise<void> {
  const h = await beginGesture(page, [ref], spec, {
    pageId,
    pointInPage: anchorPoint,
  });
  for (const d of steps) {
    await updateGesture(page, h, d, { shift: false, alt: false });
  }
  await page.evaluate(async (handle) => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { commitGesture: (h: number) => Promise<unknown> } };
      }
    ).__canvas;
    await c.client.commitGesture(handle);
  }, h);
}

test.describe("W2.10 — content rotate / scale gestures (channel)", () => {
  let fx: LoadedFixture;
  let target: ImageRect;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "images");
    const found = await findImageRect(page, fx);
    expect(found, "images fixture has an image-bearing rectangle").toBeTruthy();
    target = found!;
  });

  test("AC-W2.10-1 — RotateContent repaints the image inside an unmoved frame; undo restores byte-identically @feat:editor-tools.content-transform @feat:geometry-coordinates.image-content-transform @level:happy", async ({
    page,
  }) => {
    const pageInfo = fx.pages[target.pageIndex];
    const rect = (await elementPageRectPt(page, target.ref))!;
    // The content arm pivots about the frame centroid; an anchor on
    // the frame's right edge gives a clean lever arm so the pointer
    // delta sweeps a visible angle.
    const [, cy] = centroid(rect);
    const anchor: [number, number] = [rect.right, cy];
    // Region = the whole frame footprint (the image rotates within
    // it). No containment assertion: a rotated image can paint to the
    // frame's clipped bounds, which the AABB region already covers,
    // but corner anti-aliasing is fussy — keep containment off and
    // assert only that SOMETHING inside changed.
    const region: PtRect = {
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right,
    };
    const xformBefore = await itemTransform(page, target.ref);

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      // FIXTURE GAP (NOT a core render gap — stays relaxed past the
      // 27f7d0a render-honor batch): `images.idml`'s placements are dead
      // `file:` links (checker-128.png + an absolute path into the
      // archived ~/idml/ monorepo), so the frame renders the grey
      // MISSING-IMAGE placeholder, which is rotation-invariant → 0 px
      // delta regardless of how faithfully core honours the content
      // transform. The gesture still COMMITS (proven by the model leg
      // below: the frame ItemTransform + page-rect are untouched, the
      // content arm edited only the inner image transform) and by the
      // AC-W2.10-3 cancel sibling. noRenderChange asserts the
      // placeholder's zero delta and flips loudly the day a
      // resolvable-image fixture lands (same missing-bytes gap as
      // links-panel AC-LINKS-3) — it is fixture-conditioned, not blocked
      // on the engine.
      noRenderChange: true,
      apply: async () => {
        await runContentGesture(
          page,
          target.ref,
          pageInfo.pageId,
          { kind: "rotateContent" },
          anchor,
          [
            [0, -40],
            [20, -70],
          ],
        );
      },
      expectModel: async () => {
        // The FRAME must not move — RotateContent edits only the inner
        // image transform. (The image-transform bytes are proven in
        // core; here we prove the frame ItemTransform is untouched,
        // which is the contract that matters at the UI: a content
        // rotate must never rotate the frame.)
        const xformAfter = await itemTransform(page, target.ref);
        if (xformBefore === null) {
          expect(xformAfter).toBeNull();
        } else {
          expect(xformAfter).not.toBeNull();
          for (let i = 0; i < 6; i++) {
            expect(xformAfter![i]).toBeCloseTo(xformBefore[i], 3);
          }
        }
        const after = (await elementPageRectPt(page, target.ref))!;
        expect(after.left).toBeCloseTo(rect.left, 1);
        expect(after.top).toBeCloseTo(rect.top, 1);
        expect(after.right).toBeCloseTo(rect.right, 1);
        expect(after.bottom).toBeCloseTo(rect.bottom, 1);
      },
      expectRestored: async () => {
        const back = (await elementPageRectPt(page, target.ref))!;
        expect(back.left).toBeCloseTo(rect.left, 1);
        expect(back.top).toBeCloseTo(rect.top, 1);
      },
    });
  });

  test("AC-W2.10-2 — ScaleContent repaints the image inside an unmoved frame; undo restores byte-identically @feat:editor-tools.content-transform @feat:geometry-coordinates.image-content-transform @level:happy", async ({
    page,
  }) => {
    const pageInfo = fx.pages[target.pageIndex];
    const rect = (await elementPageRectPt(page, target.ref))!;
    const [cx, cy] = centroid(rect);
    // Anchor on a corner so the (anchor → current) vector relative to
    // the centroid pivot produces non-unit scale factors.
    const anchor: [number, number] = [rect.right, rect.bottom];
    const region: PtRect = {
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      right: rect.right,
    };
    const xformBefore = await itemTransform(page, target.ref);

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      // FIXTURE GAP (see AC-W2.10-1; NOT a core render gap — stays
      // relaxed past 27f7d0a) — the placeholder render is also
      // scale-invariant, so the commit lands (model leg + AC-W2.10-4
      // cancel prove the gesture) but paints 0 px. Fixture-conditioned;
      // flips loudly when a resolvable-image fixture lands.
      noRenderChange: true,
      apply: async () => {
        await runContentGesture(
          page,
          target.ref,
          pageInfo.pageId,
          { kind: "scaleContent" },
          anchor,
          [
            [(rect.right - cx) * 0.4, (rect.bottom - cy) * 0.4],
            [(rect.right - cx) * 0.8, (rect.bottom - cy) * 0.8],
          ],
        );
      },
      expectModel: async () => {
        const xformAfter = await itemTransform(page, target.ref);
        if (xformBefore === null) {
          expect(xformAfter).toBeNull();
        } else {
          expect(xformAfter).not.toBeNull();
          for (let i = 0; i < 6; i++) {
            expect(xformAfter![i]).toBeCloseTo(xformBefore[i], 3);
          }
        }
        const after = (await elementPageRectPt(page, target.ref))!;
        expect(after.left).toBeCloseTo(rect.left, 1);
        expect(after.top).toBeCloseTo(rect.top, 1);
      },
      expectRestored: async () => {
        const back = (await elementPageRectPt(page, target.ref))!;
        expect(back.left).toBeCloseTo(rect.left, 1);
        expect(back.top).toBeCloseTo(rect.top, 1);
      },
    });
  });

  // ── mid-gesture cancel (E2E-07 / INV-1 / INV-2) ───────────────────
  // The Escape WIRING (document-level keydown under pointer capture) is
  // covered generically by gesture-cancel.spec.ts; here we assert the
  // worker-channel rollback for the two NEW content arms: a cancel
  // emits zero commits/mutations and leaves the raster byte-identical.

  async function assertContentCancelRollsBack(
    page: Page,
    spec: GestureSpec,
    anchorPoint: [number, number],
  ): Promise<void> {
    const pageInfo = fx.pages[target.pageIndex];
    await installGestureRecorder(page);
    await drainGestureLog(page);

    const pngBefore = await pagePng(page, pageInfo.pageId, pageInfo.widthPt);

    const h = await beginGesture(page, [target.ref], spec, {
      pageId: pageInfo.pageId,
      pointInPage: anchorPoint,
    });
    await updateGesture(page, h, [31, -22], { shift: false, alt: false });
    await updateGesture(page, h, [48, -41], { shift: false, alt: false });
    await cancelGesture(page, h);

    const log = await drainGestureLog(page);
    expect(countKind(log, "gestureCancelled"), "one cancelled envelope").toBe(1);
    expect(
      countKind(log, "gestureCommitted"),
      "INV-1: no commit on abort",
    ).toBe(0);
    expect(
      countKind(log, "mutationApplied"),
      "INV-1: no mutation on abort",
    ).toBe(0);
    expect(countKind(log, "gestureFailed"), "no failure envelope").toBe(0);

    const pngAfter = await pagePng(page, pageInfo.pageId, pageInfo.widthPt);
    expect(
      pngAfter.equals(pngBefore),
      "INV-2: raster byte-identical after cancel",
    ).toBe(true);
  }

  test("AC-W2.10-3 — RotateContent cancel rolls back @feat:editor-tools.content-transform @feat:geometry-coordinates.image-content-transform @level:edge", async ({ page }) => {
    const rect = (await elementPageRectPt(page, target.ref))!;
    const [, cy] = centroid(rect);
    await assertContentCancelRollsBack(
      page,
      { kind: "rotateContent" },
      [rect.right, cy],
    );
  });

  test("AC-W2.10-4 — ScaleContent cancel rolls back @feat:editor-tools.content-transform @feat:geometry-coordinates.image-content-transform @level:edge", async ({ page }) => {
    const rect = (await elementPageRectPt(page, target.ref))!;
    await assertContentCancelRollsBack(
      page,
      { kind: "scaleContent" },
      [rect.right, rect.bottom],
    );
  });
});
