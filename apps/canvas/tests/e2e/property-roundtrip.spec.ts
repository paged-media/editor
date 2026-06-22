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

// E2E op suite — PropertyPath round-trips. Each writable frame
// property, set via setElementProperty (the exact mutation the
// Object/Stroke/Effects panels emit), must change the model, repaint
// the affected region, and restore byte-identically on undo. Frame
// properties run on the geometry fixture's rectangle (a solid,
// visible shape). Character/paragraph paths ride the text path's
// undo-cache bug and are covered by text-ops/style-ops.

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

/** Read one PropertyEntry's value from elementProperties. */
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
  const reply = (await mutate(page, {
    op: "createSwatch",
    args: {
      spec: {
        selfId: null,
        name: "e2e vivid",
        space: "RGB",
        value: [220, 20, 30],
        model: "Process",
        alternateSpace: null,
        alternateValue: [],
        tint: null,
        alpha: null,
      },
    },
  })) as { payload?: { createdId?: unknown } };
  void reply;
  // createSwatch's id isn't returned as createdId — read it back.
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

test.describe("E2E property round-trips", () => {
  let fx: LoadedFixture;
  let rect: ElementRef;
  let pageInfo: { pageId: string; widthPt: number };
  let region: PtRect;
  let red: string;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    rect = target.ref;
    pageInfo = fx.pages[target.pageIndex];
    region = (await elementPageRectPt(page, rect))!;
    red = (await createVividSwatch(page))!;
  });

  async function propSandwich(
    page: Page,
    opts: {
      label: string;
      value: unknown;
      path: string;
      containment?: boolean;
      assertValue: (v: unknown) => void;
    },
  ) {
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: opts.containment,
      controlPage: {
        pageId: fx.pages[1].pageId,
        pageWidthPt: fx.pages[1].widthPt,
      },
      dumpModel: () => dumpElement(page, rect),
      apply: async () => {
        await mutate(page, {
          op: "setElementProperty",
          args: { elementId: rect, path: opts.path, value: opts.value },
        });
      },
      expectModel: async () => {
        opts.assertValue(await readProp(page, rect, opts.path));
      },
    });
  }

  test("AC-E2E-PROP-opacity — frameOpacity lands + repaints @feat:color-swatches.fill-stroke-apply @feat:effects-transparency.opacity @level:happy", async ({
    page,
  }) => {
    await propSandwich(page, {
      label: "frameOpacity",
      path: "frameOpacity",
      value: { type: "length", value: 35 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(35),
    });
  });

  test("AC-E2E-PROP-fill — frameFillColor lands + repaints @feat:color-swatches.fill-stroke-apply @feat:effects-transparency.opacity @level:happy", async ({
    page,
  }) => {
    await propSandwich(page, {
      label: "frameFillColor",
      path: "frameFillColor",
      value: { type: "colorRef", value: red },
      assertValue: (v) => expect((v as { value: string }).value).toBe(red),
    });
  });

  test("AC-E2E-PROP-tint — frameFillTint lands + repaints @feat:color-swatches.fill-stroke-apply @feat:effects-transparency.opacity @level:happy", async ({
    page,
  }) => {
    await propSandwich(page, {
      label: "frameFillTint",
      path: "frameFillTint",
      value: { type: "length", value: 40 },
      assertValue: (v) => expect((v as { value: number }).value).toBe(40),
    });
  });

  test("AC-E2E-PROP-stroke — stroke colour + weight land + repaint @feat:color-swatches.fill-stroke-apply @feat:effects-transparency.opacity @level:happy", async ({
    page,
  }) => {
    // Stroke bleeds outside the frame's fill box → no containment.
    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      dumpModel: () => dumpElement(page, rect),
      apply: async () => {
        await mutate(page, {
          op: "batch",
          args: {
            ops: [
              {
                op: "setElementProperty",
                args: {
                  elementId: rect,
                  path: "frameStrokeColor",
                  value: { type: "colorRef", value: red },
                },
              },
              {
                op: "setElementProperty",
                args: {
                  elementId: rect,
                  path: "frameStrokeWeight",
                  value: { type: "length", value: 8 },
                },
              },
            ],
          },
        });
      },
      expectModel: async () => {
        expect(
          (
            (await readProp(page, rect, "frameStrokeColor")) as {
              value: string;
            }
          ).value,
        ).toBe(red);
        expect(
          (
            (await readProp(page, rect, "frameStrokeWeight")) as {
              value: number;
            }
          ).value,
        ).toBe(8);
      },
    });
  });
});
