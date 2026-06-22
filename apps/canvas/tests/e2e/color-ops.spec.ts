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

// E2E op suite — colour resources. The headline proof: editing a
// swatch that a frame USES repaints that frame (the colour change
// reached the rendered document, not just the palette). Resource
// creation (swatch / gradient / colour group) is model-only — nothing
// references it yet — so those assert the collection + a clean
// no-repaint. App-state colour ops (setColorSettings / setProofSetup /
// setInkSetting / setUseStandardLabForSpots) are not undoable and are
// proven to apply by the capability matrix.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";
import { dumpDoc } from "./harness/model-dump";
import { opSandwich } from "./harness/op-sandwich";
import { mutate } from "./harness/ui";

interface SwatchSummary {
  selfId: string;
  name: string;
  kind: string;
}

async function swatches(page: Page): Promise<SwatchSummary[]> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: { collection: (n: string) => Promise<SwatchSummary[]> };
        };
      }
    ).__canvas;
    return c.client.collection("swatches");
  });
}

async function makeSwatch(
  page: Page,
  name: string,
  value: number[],
): Promise<string> {
  await mutate(page, {
    op: "createSwatch",
    args: {
      spec: {
        selfId: null,
        name,
        space: "RGB",
        value,
        model: "Process",
        alternateSpace: null,
        alternateValue: [],
        tint: null,
        alpha: null,
      },
    },
  });
  const sw = await swatches(page);
  return sw[sw.length - 1].selfId;
}

test.describe("E2E colour ops", () => {
  let fx: LoadedFixture;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
  });

  test("AC-E2E-COLOR-1 — editSwatch on a used swatch repaints the frame @feat:color-swatches.color-groups @feat:color-swatches.gradients @feat:color-swatches.swatch.crud @level:happy", async ({
    page,
  }) => {
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    const rect: ElementRef = target.ref;
    const pageInfo = fx.pages[target.pageIndex];
    const region = (await elementPageRectPt(page, rect))!;

    // Setup (outside the measured op): a muted swatch, applied as the
    // rectangle's fill. Neither is undone by the sandwich.
    const sw = await makeSwatch(page, "e2e muted", [120, 120, 120]);
    await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: rect,
        path: "frameFillColor",
        value: { type: "colorRef", value: sw },
      },
    });

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      controlPage: {
        pageId: fx.pages[1].pageId,
        pageWidthPt: fx.pages[1].widthPt,
      },
      dumpModel: () => dumpDoc(page, ["swatches"]),
      apply: async () => {
        // Recolour + rename the in-use swatch → the frame must repaint.
        await mutate(page, {
          op: "editSwatch",
          args: {
            swatchId: sw,
            spec: {
              selfId: sw,
              name: "e2e vivid",
              space: "RGB",
              value: [240, 20, 30],
              model: "Process",
              alternateSpace: null,
              alternateValue: [],
              tint: null,
              alpha: null,
            },
          },
        });
      },
      expectModel: async () => {
        const s = (await swatches(page)).find((x) => x.selfId === sw);
        expect(s?.name, "swatch was renamed by editSwatch").toBe("e2e vivid");
      },
    });
  });

  async function resourceCreate(
    page: Page,
    label: string,
    op: unknown,
    collection: string,
    expectCount: number,
  ) {
    const pageInfo = fx.pages[0];
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      // Creating an unreferenced resource paints nothing.
      noRenderChange: true,
      dumpModel: () => dumpDoc(page, [collection]),
      apply: async () => {
        await mutate(page, op);
      },
      expectModel: async () => {
        const items = await page.evaluate(async (n) => {
          const c = (
            globalThis as unknown as {
              __canvas: {
                client: { collection: (n: string) => Promise<unknown[]> };
              };
            }
          ).__canvas;
          return (await c.client.collection(n)).length;
        }, collection);
        expect(items, `${label} grew ${collection}`).toBe(expectCount);
      },
    });
  }

  test("AC-E2E-COLOR-2 — createSwatch adds to the palette; undo removes it @feat:color-swatches.color-groups @feat:color-swatches.gradients @feat:color-swatches.swatch.crud @level:happy", async ({
    page,
  }) => {
    const before = (await swatches(page)).length;
    await resourceCreate(
      page,
      "createSwatch",
      {
        op: "createSwatch",
        args: {
          spec: {
            selfId: null,
            name: "e2e new",
            space: "RGB",
            value: [10, 200, 90],
            model: "Process",
            alternateSpace: null,
            alternateValue: [],
            tint: null,
            alpha: null,
          },
        },
      },
      "swatches",
      before + 1,
    );
  });

  test("AC-E2E-COLOR-3 — createGradient adds to the gradient list; undo removes it @feat:color-swatches.color-groups @feat:color-swatches.gradients @feat:color-swatches.swatch.crud @level:happy", async ({
    page,
  }) => {
    const sw = (await swatches(page))[0].selfId;
    const before = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: { collection: (n: string) => Promise<unknown[]> };
          };
        }
      ).__canvas;
      return (await c.client.collection("gradients")).length;
    });
    await resourceCreate(
      page,
      "createGradient",
      {
        op: "createGradient",
        args: {
          spec: {
            selfId: null,
            name: "e2e grad",
            kind: "Linear",
            stops: [
              { stopColor: sw, locationPct: 0, midpointPct: null },
              { stopColor: sw, locationPct: 100, midpointPct: null },
            ],
          },
        },
      },
      "gradients",
      before + 1,
    );
  });

  test("AC-E2E-COLOR-4 — createColorGroup adds to the group list; undo removes it @feat:color-swatches.color-groups @feat:color-swatches.gradients @feat:color-swatches.swatch.crud @level:happy", async ({
    page,
  }) => {
    const before = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: { collection: (n: string) => Promise<unknown[]> };
          };
        }
      ).__canvas;
      return (await c.client.collection("colorGroups")).length;
    });
    await resourceCreate(
      page,
      "createColorGroup",
      {
        op: "createColorGroup",
        args: { spec: { selfId: null, name: "e2e group", members: [] } },
      },
      "colorGroups",
      before + 1,
    );
  });
});
