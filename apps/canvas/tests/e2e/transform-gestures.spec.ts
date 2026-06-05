// E2E op suite — transform gestures with RENDER verification. The
// legacy translate/rotate/resize specs assert gesture geometry only;
// these prove the committed gesture repaints exactly the moved
// element and that undo restores the canvas byte-for-byte. PROVE-2
// covers a single-element translate on the geometry fixture; here the
// translate runs on the geometry-GROUPS fixture (rotated + nested
// content present) to prove the render diff holds amid compound
// transforms. (Group nodes aren't addressable via elementGeometry —
// the legacy group-transform spec owns group-target gestures.)

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";
import { opSandwich, type PtRect } from "./harness/op-sandwich";

async function commitTranslate(
  page: Page,
  ref: ElementRef,
  dx: number,
  dy: number,
): Promise<void> {
  await page.evaluate(
    async ({ ref, dx, dy }) => {
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
      await c.client.updateGesture(h, [dx, dy], { shift: false, alt: false });
      await c.client.commitGesture(h);
    },
    { ref, dx, dy },
  );
}

test.describe("E2E transform gestures", () => {
  let fx: LoadedFixture;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry-groups");
  });

  test("AC-E2E-XFORM-1 — translating a frame repaints its footprint amid compound transforms; undo restores it", async ({
    page,
  }) => {
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    expect(target, "geometry-groups has a rectangle").toBeTruthy();
    const ref = target.ref;
    const pageInfo = fx.pages[target.pageIndex];
    const startRect = (await elementPageRectPt(page, ref))!;
    const dx = 36;
    const dy = 28;
    const region: PtRect = {
      top: Math.min(startRect.top, startRect.top + dy),
      left: Math.min(startRect.left, startRect.left + dx),
      bottom: Math.max(startRect.bottom, startRect.bottom + dy),
      right: Math.max(startRect.right, startRect.right + dx),
    };

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      apply: async () => {
        await commitTranslate(page, ref, dx, dy);
      },
      expectModel: async () => {
        const after = (await elementPageRectPt(page, ref))!;
        // The footprint shifted (snap may nudge by a few pt).
        expect(Math.abs(after.left - (startRect.left + dx))).toBeLessThan(8);
        expect(Math.abs(after.top - (startRect.top + dy))).toBeLessThan(8);
      },
      expectRestored: async () => {
        const back = (await elementPageRectPt(page, ref))!;
        expect(back.left).toBeCloseTo(startRect.left, 0);
        expect(back.top).toBeCloseTo(startRect.top, 0);
      },
    });
  });
});
