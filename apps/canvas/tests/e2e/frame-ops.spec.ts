// E2E op suite — frame & shape structure. Proves geometry-creating
// and -editing ops land on the canvas: insertFrame / insertLine /
// insertPath create visible geometry, resizeFrame moves the edges,
// each with a render diff in the affected region and a byte-identical
// undo. moveFrame is a notImplemented stub (capability matrix) —
// frame moves ride the translate gesture (proven in proving.spec
// AC-E2E-PROVE-2); deleteFrame's undo bug is owned by AC-E2E-PROVE-3.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementBoundsPt,
  elementPageRectPt,
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";
import { dumpElement } from "./harness/model-dump";
import { opSandwich, type PtRect } from "./harness/op-sandwich";
import { mutate } from "./harness/ui";

/** Pick a visible (paintable) swatch id so inserted frames, which
 *  inherit document_defaults for fill, actually render. */
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

async function setDefaultFill(page: Page, swatchId: string): Promise<void> {
  // Not undoable, no repaint — safe to run before the sandwich
  // baseline without perturbing it.
  await mutate(page, {
    op: "setDocumentDefaults",
    args: { fillColor: swatchId, strokeColor: swatchId, strokeWeight: 1 },
  });
}

function unionRect(a: PtRect, b: PtRect): PtRect {
  return {
    top: Math.min(a.top, b.top),
    left: Math.min(a.left, b.left),
    bottom: Math.max(a.bottom, b.bottom),
    right: Math.max(a.right, b.right),
  };
}

test.describe("E2E frame ops", () => {
  let fx: LoadedFixture;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
    const sw = await visibleSwatchId(page);
    if (sw) await setDefaultFill(page, sw);
  });

  test("AC-E2E-FRAME-1 — insertFrame creates a visible rectangle; undo removes it", async ({
    page,
  }) => {
    const pageInfo = fx.pages[0];
    const bounds: [number, number, number, number] = [60, 60, 180, 200];
    const region: PtRect = {
      top: bounds[0],
      left: bounds[1],
      bottom: bounds[2],
      right: bounds[3],
    };
    let created: ElementRef | null = null;

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      controlPage: {
        pageId: fx.pages[1].pageId,
        pageWidthPt: fx.pages[1].widthPt,
      },
      apply: async () => {
        const reply = (await mutate(page, {
          op: "insertFrame",
          args: { pageId: pageInfo.pageId, bounds },
        })) as { payload?: { createdId?: ElementRef | null } };
        created = reply.payload?.createdId ?? null;
      },
      expectModel: async () => {
        expect(created, "insertFrame returned a createdId").toBeTruthy();
        expect(await elementBoundsPt(page, created!)).not.toBeNull();
      },
      expectRestored: async () => {
        expect(
          await elementBoundsPt(page, created!),
          "inserted frame still resolvable after undo",
        ).toBeNull();
      },
    });
  });

  test("AC-E2E-FRAME-2 — insertLine draws a stroked line; undo removes it", async ({
    page,
  }) => {
    const pageInfo = fx.pages[0];
    const start: [number, number] = [40, 40];
    const end: [number, number] = [220, 160];
    const region: PtRect = {
      top: Math.min(start[1], end[1]),
      left: Math.min(start[0], end[0]),
      bottom: Math.max(start[1], end[1]),
      right: Math.max(start[0], end[0]),
    };
    let created: ElementRef | null = null;

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      // A diagonal line's bbox is mostly empty; only the stroke
      // band paints — assert change inside, don't demand zero
      // outside the slack-inflated diagonal envelope.
      containment: false,
      apply: async () => {
        const reply = (await mutate(page, {
          op: "insertLine",
          args: { pageId: pageInfo.pageId, start, end },
        })) as { payload?: { createdId?: ElementRef | null } };
        created = reply.payload?.createdId ?? null;
      },
      expectModel: async () => {
        // A graphic line carries no `frameBounds` rect — resolve its
        // existence through the geometry service (works for any kind).
        expect(created, "insertLine returned a createdId").toBeTruthy();
        expect(await elementPageRectPt(page, created!)).not.toBeNull();
      },
      expectRestored: async () => {
        expect(await elementPageRectPt(page, created!)).toBeNull();
      },
    });
  });

  test("AC-E2E-FRAME-3 — insertPath creates a filled polygon; undo removes it", async ({
    page,
  }) => {
    const pageInfo = fx.pages[0];
    const a = (x: number, y: number) => ({
      anchor: [x, y] as [number, number],
      left: [x, y] as [number, number],
      right: [x, y] as [number, number],
    });
    const region: PtRect = { top: 50, left: 50, bottom: 170, right: 190 };
    let created: ElementRef | null = null;

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      apply: async () => {
        const reply = (await mutate(page, {
          op: "insertPath",
          args: {
            pageId: pageInfo.pageId,
            anchors: [a(60, 60), a(180, 70), a(120, 160)],
            open: false,
          },
        })) as { payload?: { createdId?: ElementRef | null } };
        created = reply.payload?.createdId ?? null;
      },
      expectModel: async () => {
        expect(created, "insertPath returned a createdId").toBeTruthy();
        expect(await elementPageRectPt(page, created!)).not.toBeNull();
      },
      expectRestored: async () => {
        expect(await elementPageRectPt(page, created!)).toBeNull();
      },
    });
  });

  test("AC-E2E-FRAME-4 — resizeFrame moves the rectangle edges; undo restores them", async ({
    page,
  }) => {
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    const { ref, pageIndex } = target;
    const pageInfo = fx.pages[pageIndex];
    const before = (await elementBoundsPt(page, ref))!;
    const beforePage = (await elementPageRectPt(page, ref))!;
    // Grow the frame; region = union of old + new page footprints.
    const grown: [number, number, number, number] = [
      before.top,
      before.left,
      before.bottom + 60,
      before.right + 60,
    ];

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region: unionRect(beforePage, {
        top: beforePage.top,
        left: beforePage.left,
        bottom: beforePage.bottom + 60,
        right: beforePage.right + 60,
      }),
      dumpModel: () => dumpElement(page, ref),
      apply: async () => {
        await mutate(page, {
          op: "resizeFrame",
          args: { frameId: ref.id, bounds: grown },
        });
      },
      expectModel: async () => {
        const after = (await elementBoundsPt(page, ref))!;
        expect(after.bottom).toBeCloseTo(before.bottom + 60, 1);
        expect(after.right).toBeCloseTo(before.right + 60, 1);
      },
    });
  });
});
