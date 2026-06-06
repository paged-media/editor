// E2E op suite — Stroke panel apply layer (W2.2). The stroke-detail
// fields the panel flips live (type / join / alignment / gap colour)
// emit `setElementProperty` on their `frameStroke*` paths; this proves
// each round-trips through the rendered document.
//
// Targets the geometry fixture's rectangle (the kind whose apply arms
// reach join / miter / alignment — the others are Rectangle-only parse
// fields). A visible stroke (weight + colour + dashed type) is
// established in `beforeEach` so the detail edits actually repaint:
//   • a strokeless rect can't show a type/join/alignment change;
//   • the gap-colour under-pass only paints beneath a dashed/dotted
//     pattern (renderer shapes.rs gap-colour second pass).
// That setup mutation is OUTSIDE each sandwich, so the sandwich
// baseline is the already-stroked rect and undo restores to it.
//
// Stroke bleeds outside the fill box → no containment assertion.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";
import { dumpElement } from "./harness/model-dump";
import { opSandwich, type PtRect } from "./harness/op-sandwich";
import { mutate } from "./harness/ui";

async function readProp(
  page: Page,
  ref: ElementRef,
  path: string,
): Promise<unknown> {
  return page.evaluate(
    async ({ id, p }) => {
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
      const props = await c.client.elementProperties(id);
      return props?.entries.find((e) => e.path === p)?.value ?? null;
    },
    { id: ref, p: path },
  );
}

async function createVividSwatch(page: Page): Promise<string | null> {
  await mutate(page, {
    op: "createSwatch",
    args: {
      spec: {
        selfId: null,
        name: "e2e stroke vivid",
        space: "RGB",
        value: [10, 200, 230],
        model: "Process",
        alternateSpace: null,
        alternateValue: [],
        tint: null,
        alpha: null,
      },
    },
  });
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
    return sw[sw.length - 1]?.selfId ?? null;
  });
}

test.describe("E2E stroke op round-trips", () => {
  let fx: LoadedFixture;
  let rect: ElementRef;
  let pageInfo: { pageId: string; widthPt: number };
  let region: PtRect;
  let cyan: string;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
    rect = fx.firstRectangle!;
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    pageInfo = fx.pages[target.pageIndex];
    region = (await elementPageRectPt(page, rect))!;
    cyan = (await createVividSwatch(page))!;
    // Establish a visible DASHED stroke so the detail edits repaint.
    await mutate(page, {
      op: "batch",
      args: {
        ops: [
          {
            op: "setElementProperty",
            args: {
              elementId: rect,
              path: "frameStrokeWeight",
              value: { type: "length", value: 6 },
            },
          },
          {
            op: "setElementProperty",
            args: {
              elementId: rect,
              path: "frameStrokeColor",
              value: { type: "colorRef", value: cyan },
            },
          },
          {
            op: "setElementProperty",
            args: {
              elementId: rect,
              path: "frameStrokeType",
              value: { type: "text", value: "StrokeStyle/$ID/Dashed" },
            },
          },
        ],
      },
    });
  });

  test("AC-E2E-STROKE-type — Dashed → Dotted lands + repaints, undo restores", async ({
    page,
  }) => {
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      dumpModel: () => dumpElement(page, rect),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: rect,
            path: "frameStrokeType",
            value: { type: "text", value: "StrokeStyle/$ID/Dotted" },
          },
        });
      },
      expectModel: async () => {
        expect(
          (
            (await readProp(page, rect, "frameStrokeType")) as { value: string }
          ).value,
        ).toBe("StrokeStyle/$ID/Dotted");
      },
    });
  });

  test("AC-E2E-STROKE-join — MiterEndJoin → RoundEndJoin lands + repaints, undo restores", async ({
    page,
  }) => {
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      dumpModel: () => dumpElement(page, rect),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: rect,
            path: "frameStrokeJoin",
            value: { type: "text", value: "RoundEndJoin" },
          },
        });
      },
      expectModel: async () => {
        expect(
          (
            (await readProp(page, rect, "frameStrokeJoin")) as { value: string }
          ).value,
        ).toBe("RoundEndJoin");
      },
    });
  });

  test("AC-E2E-STROKE-align — Center → Outside lands + repaints, undo restores", async ({
    page,
  }) => {
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      dumpModel: () => dumpElement(page, rect),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: rect,
            path: "frameStrokeAlignment",
            value: { type: "text", value: "OutsideAlignment" },
          },
        });
      },
      expectModel: async () => {
        expect(
          (
            (await readProp(page, rect, "frameStrokeAlignment")) as {
              value: string;
            }
          ).value,
        ).toBe("OutsideAlignment");
      },
    });
  });

  test("AC-E2E-STROKE-gap-color — gap swatch under-paints the dashed stroke, undo restores", async ({
    page,
  }) => {
    // The dashed stroke (beforeEach) makes the gap-colour second pass
    // visible: a continuous under-stroke in the gap colour beneath the
    // dashes (renderer shapes.rs).
    let magenta: string;
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      dumpModel: () => dumpElement(page, rect),
      apply: async () => {
        magenta = (await createVividSwatch(page))!;
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: rect,
            path: "frameStrokeGapColor",
            value: { type: "colorRef", value: magenta },
          },
        });
      },
      expectModel: async () => {
        expect(
          (
            (await readProp(page, rect, "frameStrokeGapColor")) as {
              value: string;
            }
          ).value,
        ).toBe(magenta);
      },
    });
  });

  // Miter limit only re-renders when a sharp join's miter would
  // overflow the limit; a rectangle's 90° corners at the default
  // weight/limit don't cross that threshold, so the edit lands in the
  // model but produces no visible delta on this fixture.
  test.fixme(
    "AC-E2E-STROKE-miter — needs a sharp-cornered (polygon) fixture to show the miter delta",
    async () => {},
  );

  // Gap tint only modulates the gap colour; with the gap-colour pass a
  // tint change is a subtle alpha shift that may fall under the
  // sandwich's byte threshold. Pending a dedicated gap-tint fixture
  // with a high-contrast gap colour.
  test.fixme(
    "AC-E2E-STROKE-gap-tint — needs a high-contrast gap colour to exceed the diff threshold",
    async () => {},
  );
});
