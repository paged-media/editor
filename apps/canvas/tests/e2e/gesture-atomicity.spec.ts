// E2E gesture suite — transactional integrity of the gesture channel,
// from the gesture test plan (thoughts/docs/paged/tests/gestures.md):
// INV-1 (a session commits as EXACTLY one Operation), INV-4 (undo
// symmetry), GSM-01 (begin→update×N→commit emits one op), GSM-03
// (zero-update commit never lands an empty Operation), GSM-05/IT-08
// (double begin rejected — concurrency guard), GSM-06 (stale handle
// after cancel rejected; machine is total), IT-03 lite (undo/redo
// round-trips stay byte-stable).

import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";
import {
  bounds,
  pagePng,
  redo,
  runGesture,
  undo,
} from "./harness/gesture";
import { dumpElement } from "./harness/model-dump";
import { opSandwich, type PtRect } from "./harness/op-sandwich";

// All gestures here run with disableSnap so the committed deltas are
// analytic — the snap pass would otherwise nudge end positions by up
// to 4 pt and every numeric assertion would need slop.
const RAW = { shift: false, alt: false, disableSnap: true };

test.describe("Gesture atomicity & undo symmetry", () => {
  let fx: LoadedFixture;
  let ref: ElementRef;
  let pageIndex: number;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    expect(target, "geometry fixture has a rectangle").toBeTruthy();
    ref = target.ref;
    pageIndex = target.pageIndex;
  });

  test("AC-E2E-GEST-ATOM-1 — GSM-01/INV-1/INV-4: five updates commit as one Operation; undo restores byte-identically @feat:editor-tools.gesture-lifecycle @feat:round-tripping.gesture-transactions @level:happy", async ({
    page,
  }) => {
    const pageInfo = fx.pages[pageIndex];
    const startRect = (await elementPageRectPt(page, ref))!;
    const dx = 40;
    const dy = 30;
    const region: PtRect = {
      top: Math.min(startRect.top, startRect.top + dy),
      left: Math.min(startRect.left, startRect.left + dx),
      bottom: Math.max(startRect.bottom, startRect.bottom + dy),
      right: Math.max(startRect.right, startRect.right + dx),
    };

    const { replies } = await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      apply: async () => {
        // Five monotonically-growing deltas — the worker rewrites the
        // SAME preview each time; only the commit lands an Operation.
        await runGesture(page, [ref], { kind: "translate" }, [
          { delta: [8, 6], mods: RAW },
          { delta: [16, 12], mods: RAW },
          { delta: [24, 18], mods: RAW },
          { delta: [32, 24], mods: RAW },
          { delta: [dx, dy], mods: RAW },
        ]);
      },
      expectModel: async () => {
        const after = (await elementPageRectPt(page, ref))!;
        expect(after.left).toBeCloseTo(startRect.left + dx, 1);
        expect(after.top).toBeCloseTo(startRect.top + dy, 1);
      },
      dumpModel: () => dumpElement(page, ref),
      expectRestored: async () => {
        const back = (await elementPageRectPt(page, ref))!;
        expect(back.left).toBeCloseTo(startRect.left, 1);
        expect(back.top).toBeCloseTo(startRect.top, 1);
      },
    });

    const commits = replies.filter((r) => r.kind === "gestureCommitted").length;
    const mutations = replies.filter((r) => r.kind === "mutationApplied").length;
    expect(commits, "INV-1: exactly one commit envelope").toBe(1);
    expect(mutations, "INV-1: no stray mutation envelopes").toBe(0);
  });

  test("AC-E2E-GEST-ATOM-2 — IT-03 lite: undo/redo round-trip ×10 stays byte-stable @feat:editor-tools.gesture-lifecycle @level:happy", async ({
    page,
  }) => {
    const pageInfo = fx.pages[pageIndex];
    const pre = await pagePng(page, pageInfo.pageId, pageInfo.widthPt);
    await runGesture(page, [ref], { kind: "translate" }, [
      { delta: [35, 22], mods: RAW },
    ]);
    const post = await pagePng(page, pageInfo.pageId, pageInfo.widthPt);
    expect(post.equals(pre), "the translate repainted").toBe(false);

    for (let i = 1; i <= 10; i++) {
      await undo(page);
      const u = await pagePng(page, pageInfo.pageId, pageInfo.widthPt);
      expect(u.equals(pre), `undo #${i} restores the pre-gesture raster`).toBe(
        true,
      );
      await redo(page);
      const r = await pagePng(page, pageInfo.pageId, pageInfo.widthPt);
      expect(r.equals(post), `redo #${i} restores the post-gesture raster`).toBe(
        true,
      );
    }
    await undo(page); // leave the doc at baseline
  });

  test("AC-E2E-GEST-ATOM-3 — GSM-03: zero-update commit lands no empty Operation on the undo stack @feat:editor-tools.gesture-lifecycle @level:edge", async ({
    page,
  }) => {
    const start = await bounds(page, ref);
    // A real translate first, so the undo stack's top is known.
    await runGesture(page, [ref], { kind: "translate" }, [
      { delta: [20, 0], mods: RAW },
    ]);
    const moved = await bounds(page, ref);
    expect(moved[1]).toBeCloseTo(start[1] + 20, 1);

    // Click-without-drag: begin → commit with zero updates.
    await runGesture(page, [ref], { kind: "translate" }, []);
    const after = await bounds(page, ref);
    for (let i = 0; i < 4; i++) {
      expect(after[i], "zero-update commit mutated nothing").toBeCloseTo(
        moved[i],
        3,
      );
    }

    // ONE undo must revert the REAL translate — if the empty commit
    // had pushed a phantom entry, this undo would consume it instead
    // and the frame would still sit at +20.
    await undo(page);
    const restored = await bounds(page, ref);
    expect(
      restored[1],
      "GSM-03: empty commit pushed a phantom undo entry",
    ).toBeCloseTo(start[1], 1);
  });

  test("AC-E2E-GEST-ATOM-4 — GSM-05/IT-08: second begin while active is rejected; first still commits @feat:editor-tools.gesture-lifecycle @level:happy", async ({
    page,
  }) => {
    const start = await bounds(page, ref);
    const result = await page.evaluate(
      async ({ ref }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                beginGesture: (n: unknown[], g: unknown) => Promise<number>;
                updateGesture: (
                  h: number,
                  d: [number, number],
                  m: unknown,
                ) => Promise<unknown>;
                commitGesture: (h: number) => Promise<unknown>;
              };
            };
          }
        ).__canvas;
        const h = await c.client.beginGesture([ref], { kind: "translate" });
        let secondError = "";
        try {
          await c.client.beginGesture([ref], { kind: "translate" });
        } catch (e) {
          secondError = String(e);
        }
        await c.client.updateGesture(h, [25, 10], {
          shift: false,
          alt: false,
          disableSnap: true,
        });
        await c.client.commitGesture(h);
        return { secondError };
      },
      { ref },
    );

    expect(result.secondError, "concurrent begin must be rejected").toContain(
      "alreadyActive",
    );
    const after = await bounds(page, ref);
    expect(after[1], "first gesture survived the rejected begin").toBeCloseTo(
      start[1] + 25,
      1,
    );
    await undo(page);
  });

  test("AC-E2E-GEST-ATOM-5 — GSM-06: update/commit on a stale handle after cancel are rejected; document untouched @feat:editor-tools.gesture-lifecycle @level:edge", async ({
    page,
  }) => {
    const modelBefore = await dumpElement(page, ref);
    const result = await page.evaluate(
      async ({ ref }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                beginGesture: (n: unknown[], g: unknown) => Promise<number>;
                updateGesture: (
                  h: number,
                  d: [number, number],
                  m: unknown,
                ) => Promise<unknown>;
                commitGesture: (h: number) => Promise<unknown>;
                cancelGesture: (h: number) => Promise<unknown>;
              };
            };
          }
        ).__canvas;
        const h = await c.client.beginGesture([ref], { kind: "translate" });
        await c.client.updateGesture(h, [30, 30], { shift: false, alt: false });
        await c.client.cancelGesture(h);
        let updateError = "";
        let commitError = "";
        try {
          await c.client.updateGesture(h, [10, 10], { shift: false, alt: false });
        } catch (e) {
          updateError = String(e);
        }
        try {
          await c.client.commitGesture(h);
        } catch (e) {
          commitError = String(e);
        }
        return { updateError, commitError };
      },
      { ref },
    );

    expect(result.updateError, "stale update rejected").toContain("failed");
    expect(result.commitError, "stale commit rejected").toContain("failed");
    expect(await dumpElement(page, ref), "document untouched").toBe(modelBefore);
  });
});
