// E2E op suite — the undo stack + replay determinism. A heterogeneous
// sequence of clean (byte-identical-safe) ops is applied, then the
// whole stack is walked back to zero and the canvas must return to
// the load-time pixels EXACTLY (the engine's determinism guarantee:
// CPU renderer, single-threaded, signature-keyed layout cache). Redo
// returns the end state byte-for-byte. Finally a fresh reload +
// replay of the same sequence must reproduce the same pixels — the
// E2E mirror of core's AC-E-7 replay-determinism test.
//
// Text edits + deleteFrame + middle insertPage are excluded — each
// has a known engine bug (text emit cache / invert transform /
// pipeline grow) tracked by its own suite; this proves the stack is
// byte-clean for the ops that should be.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, snapshotPagePng } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";

async function snap(
  page: Page,
  pageId: string,
  widthPt: number,
): Promise<Buffer> {
  const widthPx = 460;
  const dpi = (widthPx * 72) / widthPt;
  return Buffer.from(await snapshotPagePng(page, pageId, widthPx, dpi));
}

async function mutate(page: Page, m: unknown): Promise<void> {
  await page.evaluate(async (mm) => {
    await (
      globalThis as unknown as {
        __canvas: { client: { mutate: (m: unknown) => Promise<unknown> } };
      }
    ).__canvas.client.mutate(mm);
  }, m);
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas.client.undo();
  });
}

async function redo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as {
        __canvas: { client: { redo: () => Promise<unknown> } };
      }
    ).__canvas.client.redo();
  });
}

async function lastSwatchId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<Array<{ selfId: string }>>;
          };
        };
      }
    ).__canvas;
    const sw = await c.client.collection("swatches");
    return sw[sw.length - 1].selfId;
  });
}

async function translate(
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

/** Apply the 5-op sequence; returns the number of undo steps it
 *  pushed (createSwatch + 4 frame ops). */
async function applySequence(
  page: Page,
  rect: ElementRef,
  bounds: number[],
): Promise<number> {
  // 1) createSwatch (deterministic minted id).
  await mutate(page, {
    op: "createSwatch",
    args: {
      spec: {
        selfId: null,
        name: "e2e stack",
        space: "RGB",
        value: [230, 60, 20],
        model: "Process",
        alternateSpace: null,
        alternateValue: [],
        tint: null,
        alpha: null,
      },
    },
  });
  const red = await lastSwatchId(page);
  // 2) opacity, 3) fill, 4) resize, 5) translate.
  await mutate(page, {
    op: "setElementProperty",
    args: {
      elementId: rect,
      path: "frameOpacity",
      value: { type: "length", value: 50 },
    },
  });
  await mutate(page, {
    op: "setElementProperty",
    args: {
      elementId: rect,
      path: "frameFillColor",
      value: { type: "colorRef", value: red },
    },
  });
  await mutate(page, {
    op: "resizeFrame",
    args: {
      frameId: rect.id,
      bounds: [bounds[0], bounds[1], bounds[2] + 30, bounds[3] + 30],
    },
  });
  await translate(page, rect, 24, 18);
  return 5;
}

test.describe("E2E undo stack + determinism", () => {
  let fx: LoadedFixture;
  let rect: ElementRef;
  let pageInfo: { pageId: string; widthPt: number };
  let bounds: number[];

  async function loadAndResolve(page: Page) {
    fx = await loadFixture(page, "geometry");
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    rect = target.ref;
    pageInfo = fx.pages[target.pageIndex];
    const props = await page.evaluate(async (id) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries: Array<{ path: string; value: unknown }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const p = await c.client.elementProperties(id);
      return (
        (
          p?.entries.find((e) => e.path === "frameBounds")?.value as
            | {
                value: number[];
              }
            | undefined
        )?.value ?? null
      );
    }, rect);
    bounds = props!;
  }

  test("AC-E2E-UNDO-1 — a 5-op stack undoes to byte-identical baseline and redoes to byte-identical end", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openCanvas(page);
    await loadAndResolve(page);

    const base = await snap(page, pageInfo.pageId, pageInfo.widthPt);
    const steps = await applySequence(page, rect, bounds);
    const end = await snap(page, pageInfo.pageId, pageInfo.widthPt);
    expect(end.equals(base), "sequence changed the canvas").toBe(false);

    for (let i = 0; i < steps; i++) await undo(page);
    const afterUndo = await snap(page, pageInfo.pageId, pageInfo.widthPt);
    expect(
      afterUndo.equals(base),
      "undoing the whole stack did not restore the load-time canvas byte-for-byte",
    ).toBe(true);

    for (let i = 0; i < steps; i++) await redo(page);
    const afterRedo = await snap(page, pageInfo.pageId, pageInfo.widthPt);
    expect(
      afterRedo.equals(end),
      "redoing the whole stack did not reproduce the end canvas byte-for-byte",
    ).toBe(true);
  });

  test("AC-E2E-UNDO-2 — replay determinism: a fresh reload + replay reproduces the same pixels", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openCanvas(page);
    await loadAndResolve(page);
    await applySequence(page, rect, bounds);
    const firstEnd = await snap(page, pageInfo.pageId, pageInfo.widthPt);

    // Fresh reload of the same document; replay the identical
    // sequence (minted ids are deterministic) → identical pixels.
    await loadAndResolve(page);
    await applySequence(page, rect, bounds);
    const secondEnd = await snap(page, pageInfo.pageId, pageInfo.widthPt);

    expect(
      secondEnd.equals(firstEnd),
      "replaying the same op sequence on a fresh load produced different pixels (non-determinism)",
    ).toBe(true);
  });
});
