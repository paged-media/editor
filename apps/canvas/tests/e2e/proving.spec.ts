// E2E op suite — harness proving tests. Three operations of
// different shapes validate the sandwich invariants (UI-driven
// panel commit, gesture lifecycle, structural mutate) before the
// domain suites scale out on top of them.

import { test, expect } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementBoundsPt,
  elementPageRectPt,
  loadFixture,
  type LoadedFixture,
} from "./harness/fixtures";
import { dumpElement } from "./harness/model-dump";
import { opSandwich } from "./harness/op-sandwich";
import { fillRowMetric, mutate, openPanel, selectElements } from "./harness/ui";

test.describe("E2E harness proving", () => {
  let fx: LoadedFixture;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
  });

  test("AC-E2E-PROVE-1 — opacity via the Object panel lands on the canvas @feat:round-tripping.undo-redo @feat:the-renderer.snapshots @level:happy", async ({
    page,
  }) => {
    const target = fx.frames.find((f) => f.ref.kind === "rectangle");
    expect(target, "geometry fixture has a rectangle").toBeTruthy();
    const { ref, pageIndex } = target!;
    const pageInfo = fx.pages[pageIndex];
    const bounds = (await elementPageRectPt(page, ref))!;

    await selectElements(page, [ref]);
    await openPanel(page, "paged.object-transform");

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region: bounds,
      controlPage: {
        pageId: fx.pages[(pageIndex + 1) % fx.pageCount].pageId,
        pageWidthPt: fx.pages[(pageIndex + 1) % fx.pageCount].widthPt,
      },
      dumpModel: () => dumpElement(page, ref),
      apply: async () => {
        // The REAL UI path: type into the kit Opacity metric.
        await fillRowMetric(
          page,
          '[data-object-transform-panel="ready"]',
          "Opacity",
          30,
        );
      },
      expectModel: async () => {
        const dump = await dumpElement(page, ref);
        expect(dump).toContain('"path":"frameOpacity"');
        expect(dump).toContain('"value":30');
      },
    });
  });

  test("AC-E2E-PROVE-2 — translate gesture repaints exactly the moved frame @feat:round-tripping.undo-redo @feat:the-renderer.snapshots @level:gesture", async ({
    page,
  }) => {
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    const { ref, pageIndex } = target;
    const pageInfo = fx.pages[pageIndex];
    const before = (await elementBoundsPt(page, ref))!;
    const pageRect = (await elementPageRectPt(page, ref))!;
    const dx = 40;
    const dy = 24;
    // Region = union of the before/after PAGE-space footprints
    // (translation commutes through the item transform).
    const region = {
      top: Math.min(pageRect.top, pageRect.top + dy),
      left: Math.min(pageRect.left, pageRect.left + dx),
      bottom: Math.max(pageRect.bottom, pageRect.bottom + dy),
      right: Math.max(pageRect.right, pageRect.right + dx),
    };

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      apply: async () => {
        await page.evaluate(
          async ({ ref, dx, dy }) => {
            const c = (
              globalThis as unknown as {
                __canvas: {
                  client: {
                    beginGesture: (
                      nodes: unknown[],
                      gesture: unknown,
                    ) => Promise<number>;
                    updateGesture: (
                      handle: number,
                      delta: [number, number],
                      modifiers: unknown,
                    ) => Promise<unknown>;
                    commitGesture: (handle: number) => Promise<unknown>;
                  };
                };
              }
            ).__canvas;
            const handle = await c.client.beginGesture([ref], {
              kind: "translate",
            });
            // Delta is the `[dx, dy]` tuple (translate.spec idiom).
            await c.client.updateGesture(handle, [dx, dy], {
              shift: false,
              alt: false,
            });
            await c.client.commitGesture(handle);
          },
          { ref, dx, dy },
        );
      },
      expectModel: async () => {
        const after = (await elementBoundsPt(page, ref))!;
        // Phase E snapping may nudge the delta by up to ~4pt.
        expect(Math.abs(after.left - (before.left + dx))).toBeLessThanOrEqual(
          4.5,
        );
        expect(Math.abs(after.top - (before.top + dy))).toBeLessThanOrEqual(
          4.5,
        );
      },
      expectRestored: async () => {
        const restored = (await elementBoundsPt(page, ref))!;
        expect(restored.left).toBeCloseTo(before.left, 1);
        expect(restored.top).toBeCloseTo(before.top, 1);
      },
    });
  });

  test("AC-E2E-PROVE-3 — deleteFrame removes the pixels; undo restores byte-identically @feat:round-tripping.undo-redo @feat:the-renderer.snapshots @level:happy", async ({
    page,
  }) => {
    // ENGINE BUG (found 2026-06-05, FIXED in core 2026-06-06,
    // protocol v27): undoing RemoveNode re-inserted the frame with an
    // IDENTITY item transform. NodeSpec now carries item_transform
    // through the RemoveNode capture → undo round-trip (engine-side
    // guard: paged-mutate remove_node_undo_restores_item_transform).
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    const { ref, pageIndex } = target;
    const pageInfo = fx.pages[pageIndex];
    const bounds = (await elementBoundsPt(page, ref))!;
    const pageRect = (await elementPageRectPt(page, ref))!;

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region: pageRect,
      // No UI path for arbitrary frame deletion yet (Edit ▸ Delete
      // rides selection; covered in frame-ops) — wire-level here.
      apply: async () => {
        await mutate(page, { op: "deleteFrame", args: { frameId: ref.id } });
      },
      expectModel: async () => {
        const gone = await elementBoundsPt(page, ref);
        expect(gone, "frame still resolvable after deleteFrame").toBeNull();
      },
      expectRestored: async () => {
        const back = (await elementBoundsPt(page, ref))!;
        expect(back.left).toBeCloseTo(bounds.left, 1);
        // The PAGE-space rect must also restore — catches an undo
        // that re-inserts the node but loses its item transform.
        const backPage = (await elementPageRectPt(page, ref))!;
        expect(backPage.left, "item transform lost by undo").toBeCloseTo(
          pageRect.left,
          1,
        );
        expect(backPage.top, "item transform lost by undo").toBeCloseTo(
          pageRect.top,
          1,
        );
      },
    });
  });
});
