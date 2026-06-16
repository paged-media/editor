// E2E gesture suite — Esc/cancel rollback, from the gesture test plan
// (thoughts/docs/paged/tests/gestures.md): E2E-07 "Esc-cancel each
// gesture family", INV-1 (a session emits 0 Operations on abort),
// INV-2 (post-abort state byte-identical to pre-begin), INV-8 (no
// path leaves the machine dragging). Channel tests cancel every
// supported family and assert the FULL invariant — model dump deep-
// equal AND page raster byte-identical AND zero commit/mutation
// envelopes; the legacy per-gesture specs only checked geometry.
// Two real-input tests prove the Escape WIRING (document-level
// keydown under pointer capture) for the select-drag and draw-tool
// paths.

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
  pagePng,
  updateGesture,
  type GestureAnchor,
  type GestureSpec,
} from "./harness/gesture";
import { dumpElement } from "./harness/model-dump";
import {
  activateTool,
  awaitGeometryMirror,
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

/** Cancel-rollback for one family: begin → update×2 → cancel, then
 *  INV-1 (zero commits) + INV-2 (model + raster byte-identical). */
async function assertCancelRollsBack(
  page: Page,
  fx: LoadedFixture,
  ref: ElementRef,
  pageIndex: number,
  spec: GestureSpec,
  anchor: GestureAnchor | null,
): Promise<void> {
  const pageInfo = fx.pages[pageIndex];
  await installGestureRecorder(page);
  await drainGestureLog(page);

  const modelBefore = await dumpElement(page, ref);
  const pngBefore = await pagePng(page, pageInfo.pageId, pageInfo.widthPt);

  const h = await beginGesture(page, [ref], spec, anchor);
  await updateGesture(page, h, [31, 17], { shift: false, alt: false });
  await updateGesture(page, h, [48, 26], { shift: false, alt: false });
  await cancelGesture(page, h);

  const log = await drainGestureLog(page);
  expect(countKind(log, "gestureCancelled"), "one cancelled envelope").toBe(1);
  expect(countKind(log, "gestureCommitted"), "INV-1: no commit on abort").toBe(0);
  expect(countKind(log, "mutationApplied"), "INV-1: no mutation on abort").toBe(0);
  expect(countKind(log, "gestureFailed"), "no failure envelope").toBe(0);

  expect(await dumpElement(page, ref), "INV-2: model restored").toBe(modelBefore);
  const pngAfter = await pagePng(page, pageInfo.pageId, pageInfo.widthPt);
  expect(
    pngAfter.equals(pngBefore),
    "INV-2: raster byte-identical after cancel",
  ).toBe(true);
}

test.describe("E2E-07 — cancel rolls back every gesture family (channel)", () => {
  let fx: LoadedFixture;
  let target: { ref: ElementRef; pageIndex: number };
  let pageRect: PtRect;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
    target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    expect(target, "geometry fixture has a rectangle").toBeTruthy();
    pageRect = (await elementPageRectPt(page, target.ref))!;
  });

  test("AC-E2E-GEST-CANCEL-1 — translate @feat:editor-tools.gesture-lifecycle @level:edge", async ({ page }) => {
    await assertCancelRollsBack(
      page,
      fx,
      target.ref,
      target.pageIndex,
      { kind: "translate" },
      null,
    );
  });

  test("AC-E2E-GEST-CANCEL-2 — resize (southEast) @feat:editor-tools.gesture-lifecycle @level:edge", async ({ page }) => {
    await assertCancelRollsBack(
      page,
      fx,
      target.ref,
      target.pageIndex,
      { kind: "resize", handle: "southEast" },
      null,
    );
  });

  test("AC-E2E-GEST-CANCEL-3 — rotate @feat:editor-tools.gesture-lifecycle @level:edge", async ({ page }) => {
    const [cx, cy] = centroid(pageRect);
    await assertCancelRollsBack(
      page,
      fx,
      target.ref,
      target.pageIndex,
      { kind: "rotate" },
      { pageId: fx.pages[target.pageIndex].pageId, pointInPage: [cx + 100, cy] },
    );
  });

  test("AC-E2E-GEST-CANCEL-4 — scale @feat:editor-tools.gesture-lifecycle @level:edge", async ({ page }) => {
    const [cx, cy] = centroid(pageRect);
    await assertCancelRollsBack(
      page,
      fx,
      target.ref,
      target.pageIndex,
      { kind: "scale" },
      {
        pageId: fx.pages[target.pageIndex].pageId,
        pointInPage: [cx + 100, cy - 100],
      },
    );
  });

  test("AC-E2E-GEST-CANCEL-5 — shear @feat:editor-tools.gesture-lifecycle @level:edge", async ({ page }) => {
    // Shear needs a vertical lever arm from the pivot (the union
    // centroid) — anchor straight above the centroid.
    const [cx, cy] = centroid(pageRect);
    await assertCancelRollsBack(
      page,
      fx,
      target.ref,
      target.pageIndex,
      { kind: "shear" },
      { pageId: fx.pages[target.pageIndex].pageId, pointInPage: [cx, cy - 80] },
    );
  });

  test("AC-E2E-GEST-CANCEL-6 — translateContent (images fixture) @feat:editor-tools.gesture-lifecycle @level:edge", async ({
    page,
  }) => {
    const ifx = await loadFixture(page, "images");
    const imgFrame = ifx.frames.find((f) => f.ref.kind === "rectangle");
    expect(imgFrame, "images fixture has an image rectangle").toBeTruthy();
    await assertCancelRollsBack(
      page,
      ifx,
      imgFrame!.ref,
      imgFrame!.pageIndex,
      { kind: "translateContent" },
      null,
    );
  });
});

// ── real-input Escape wiring ──────────────────────────────────────
// The channel tests above prove the worker's rollback; these prove
// the SHELL's Escape path: a document-level keydown listener fires
// while pointer capture is held by the canvas wrapper, cancels the
// worker gesture, and the subsequent pointer-up commits nothing.

test.describe("E2E-07 — real-input Escape (wiring)", () => {
  test("AC-E2E-GEST-CANCEL-7 — Escape mid select-drag aborts; pointer-up commits nothing @feat:editor-tools.gesture-lifecycle @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    const rect = (await elementPageRectPt(page, target.ref))!;
    const modelBefore = await dumpElement(page, target.ref);

    // Body-drag begins a worker translate only when the pointer lands
    // on an already-selected element. Select through the REAL click
    // path (pointer → hit-test → onHit): the React geometry mirror
    // the viewport reads refreshes only via the interaction handlers,
    // not when a test installs a selection programmatically.
    const [cx, cy] = centroid(rect);
    const start = await screenPoint(page, cx, cy);
    await page.mouse.click(start.x, start.y);
    await awaitGeometryMirror(page, 1);

    await installGestureRecorder(page);
    await drainGestureLog(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y + 25, { steps: 5 });
    await page.waitForTimeout(120); // let the SAB drain apply the preview
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(300);

    const log = await drainGestureLog(page);
    expect(countKind(log, "gestureCommitted"), "INV-1: Escape killed the commit").toBe(0);
    expect(countKind(log, "mutationApplied")).toBe(0);
    expect(countKind(log, "gestureCancelled"), "the worker saw the cancel").toBeGreaterThanOrEqual(1);
    expect(await dumpElement(page, target.ref), "INV-2: model untouched").toBe(modelBefore);
  });

  test("AC-E2E-GEST-CANCEL-8 — Escape mid draw-tool drag creates nothing @feat:editor-tools.gesture-lifecycle @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const before = await treeCount(page, "rectangle");

    await activateTool(page, "shape");

    const p0 = fx.pages[0];
    const start = await screenPoint(page, p0.widthPt * 0.2, p0.heightPt * 0.2);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 45, { steps: 5 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await treeCount(page, "rectangle");
    expect(after, "DR/Esc: aborted draw must not insert a frame").toBe(before);
  });
});
