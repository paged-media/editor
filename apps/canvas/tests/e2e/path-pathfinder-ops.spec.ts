// E2E op suite — path topology + pathfinder. pathfinderBoolean is
// the headline: two overlapping rectangles union into one shape (the
// others deleted), visibly changing the canvas, and a single undo
// restores both. pathPointRemove drops a vertex from a scratch
// polygon and reshapes its outline. Both prove the geometry edit
// reached the rendered document.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";
import { opSandwich, type PtRect } from "./harness/op-sandwich";
import { mutate } from "./harness/ui";

async function visibleSwatchId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (
              n: string,
            ) => Promise<Array<{ selfId: string; kind: string }>>;
          };
        };
      }
    ).__canvas;
    const sw = await c.client.collection("swatches");
    const paint = sw.find(
      (s) => s.kind === "process" || s.kind === "black" || s.kind === "spot",
    );
    return (paint ?? sw[0])?.selfId ?? null;
  });
}

async function insertRect(
  page: Page,
  pageId: string,
  bounds: [number, number, number, number],
): Promise<ElementRef> {
  const reply = (await mutate(page, {
    op: "insertFrame",
    args: { pageId, bounds },
  })) as { payload?: { createdId?: ElementRef } };
  return reply.payload!.createdId!;
}

const ANCHOR = (x: number, y: number) => ({
  anchor: [x, y] as [number, number],
  left: [x, y] as [number, number],
  right: [x, y] as [number, number],
});

test.describe("E2E path + pathfinder ops", () => {
  let fx: LoadedFixture;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
    const sw = await visibleSwatchId(page);
    if (sw) {
      await mutate(page, {
        op: "setDocumentDefaults",
        args: { fillColor: sw, strokeColor: sw, strokeWeight: 1 },
      });
    }
  });

  test("AC-E2E-PATHF-1 — pathfinderBoolean union merges two rects; undo restores both @feat:frames-paths.pathfinder-boolean @feat:geometry-coordinates.path-topology-ops @level:happy", async ({
    page,
  }) => {
    const pageInfo = fx.pages[0];
    // Two overlapping scratch rectangles (setup; not undone by the
    // sandwich).
    const a = await insertRect(page, pageInfo.pageId, [40, 40, 120, 120]);
    const b = await insertRect(page, pageInfo.pageId, [90, 90, 180, 180]);
    const region: PtRect = { top: 40, left: 40, bottom: 180, right: 180 };

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      // The boolean re-inserts the consumed sibling on undo; if that
      // ever loses geometry the render diff catches it. (deleteFrame
      // has a known invert bug — track here if it surfaces.)
      apply: async () => {
        await mutate(page, {
          op: "pathfinderBoolean",
          args: { kept: a, others: [b], kind: "union" },
        });
      },
      expectModel: async () => {
        // The consumed sibling is gone; the kept shape remains.
        expect(await elementPageRectPt(page, b)).toBeNull();
        expect(await elementPageRectPt(page, a)).not.toBeNull();
      },
      expectRestored: async () => {
        expect(await elementPageRectPt(page, b)).not.toBeNull();
        expect(await elementPageRectPt(page, a)).not.toBeNull();
      },
    });
  });

  test("AC-E2E-PATHF-2 — pathPointRemove reshapes a polygon's outline", async ({
    page,
  }) => {
    const pageInfo = fx.pages[0];
    // A 5-vertex star-ish polygon (setup).
    const poly = (
      (await mutate(page, {
        op: "insertPath",
        args: {
          pageId: pageInfo.pageId,
          anchors: [
            ANCHOR(60, 40),
            ANCHOR(150, 70),
            ANCHOR(120, 160),
            ANCHOR(60, 160),
            ANCHOR(30, 90),
          ],
          open: false,
        },
      })) as { payload?: { createdId?: ElementRef } }
    ).payload!.createdId!;
    const region = (await elementPageRectPt(page, poly))!;

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      apply: async () => {
        await mutate(page, {
          op: "pathPointRemove",
          args: { elementId: poly, index: 1 },
        });
      },
      expectModel: async () => {
        // Still a resolvable shape after dropping a vertex.
        expect(await elementPageRectPt(page, poly)).not.toBeNull();
      },
    });
  });
});
