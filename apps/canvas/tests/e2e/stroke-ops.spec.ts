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

  test("AC-E2E-STROKE-type — Dashed → Dotted lands + repaints, undo restores @feat:editor-shell.panels.stroke @level:gesture", async ({
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

  test("AC-E2E-STROKE-join — MiterEndJoin → RoundEndJoin lands + repaints, undo restores @feat:editor-shell.panels.stroke @level:happy", async ({
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

  test("AC-E2E-STROKE-align — Center → Outside lands + repaints, undo restores @feat:editor-shell.panels.stroke @level:happy", async ({
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

  test("AC-E2E-STROKE-gap-color — gap swatch lands + under-paints beneath the dashes, undo restores @feat:editor-shell.panels.stroke @level:happy", async ({
    page,
  }) => {
    // `frameStrokeGapColor` round-trips on the wire (model + undo
    // asserted) AND core now paints the gap-colour under-stroke beneath
    // the dashes (render-honor batch, core 27f7d0a) — a vivid gap swatch
    // over the beforeEach dashed stroke produces a pixel delta. The
    // gap-colour second pass (renderer shapes.rs) is now exercised; the
    // pixel gate is ENFORCED (noRenderChange dropped).
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

  // 0.35.2 punch-list fix: `frameStrokeMiterLimit` now applies to
  // Polygon / GraphicLine closed paths, not Rectangle-only (the old
  // blocker: paged-mutate apply REJECTED the mutation on non-Rectangle
  // kinds, so even a sharp polygon couldn't be driven through this path).
  // On 0.35.2 the mutation is accepted, dirties the page, and the
  // renderer clips the corner spikes when the limit tightens.
  //
  // FIXTURE NOTE: this loads `strokes-fills`, NOT the beforeEach
  // `geometry` rect. (a) `geometry` has no polygon at all; (b) on a
  // Polygon, `frameStrokeWeight` / `frameStrokeColor` are STILL
  // `notImplemented` on the 0.35.2 wire (only miter/join/type/gap apply),
  // so a heavy visible stroke can't be SET — but the `strokes-fills`
  // polygon already carries an 18 pt black stroke baked in at parse, with
  // corners sharp enough that limit 20→1 clips them to a measurable
  // delta. Establish Miter join + a large limit OUTSIDE the sandwich so
  // the baseline is the long-spike state; the sandwich then tightens to 1.
  test("AC-E2E-STROKE-miter — frameStrokeMiterLimit clips the polygon's sharp corners (0.35.2)", async ({
    page,
  }) => {
    const sf = await loadFixture(page, "strokes-fills");
    const poly = sf.firstPolygon;
    test.skip(!poly, "strokes-fills fixture has no polygon");
    const target = sf.frames.find((f) => f.ref.kind === "polygon")!;
    const polyPage = sf.pages[target.pageIndex];
    const polyRegion = (await elementPageRectPt(page, poly!))!;
    // Miter join + a large (non-clipping) limit. Outside the sandwich so
    // the baseline already carries the long-spike (limit=20) state.
    await mutate(page, {
      op: "batch",
      args: {
        ops: [
          {
            op: "setElementProperty",
            args: {
              elementId: poly!,
              path: "frameStrokeJoin",
              value: { type: "text", value: "MiterEndJoin" },
            },
          },
          {
            op: "setElementProperty",
            args: {
              elementId: poly!,
              path: "frameStrokeMiterLimit",
              value: { type: "length", value: 20 },
            },
          },
        ],
      },
    });
    await opSandwich(page, {
      pageId: polyPage.pageId,
      pageWidthPt: polyPage.widthPt,
      region: polyRegion,
      containment: false,
      dumpModel: () => dumpElement(page, poly!),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: {
            elementId: poly!,
            path: "frameStrokeMiterLimit",
            value: { type: "length", value: 1 },
          },
        });
      },
      expectModel: async () => {
        expect(
          (
            (await readProp(page, poly!, "frameStrokeMiterLimit")) as {
              value: number;
            }
          ).value,
        ).toBe(1);
      },
    });
  });

  // 0.35.2 punch-list fix: `frameStrokeGapTint` now lightens the gap
  // colour the renderer paints between the dashes. Set a vivid (magenta)
  // gap colour outside the sandwich so the baseline shows the gap
  // under-pass at full strength; the sandwich then drops the gap tint to
  // 20%, lightening the under-painted gap → a pixel delta.
  test("AC-E2E-STROKE-gap-tint — frameStrokeGapTint lightens the rendered gap colour (0.35.2) @feat:editor-shell.panels.stroke @level:happy", async ({
    page,
  }) => {
    const magenta = (await createVividSwatch(page))!;
    // Establish a full-strength gap colour under the beforeEach dashed
    // stroke (the gap-colour under-pass paints it). Outside the sandwich
    // so the baseline is the un-tinted (vivid) gap.
    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: rect,
        path: "frameStrokeGapColor",
        value: { type: "colorRef", value: magenta },
      },
    });
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
            path: "frameStrokeGapTint",
            value: { type: "length", value: 20 },
          },
        });
      },
      expectModel: async () => {
        expect(
          (
            (await readProp(page, rect, "frameStrokeGapTint")) as {
              value: number;
            }
          ).value,
        ).toBe(20);
      },
    });
  });
});
