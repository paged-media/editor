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

// ED-9 — selection chrome and the control bar in PAGE space.
//
// The engine's `elementGeometry` answers in SPREAD space (its bounds and
// item transform are the IDML item's, never moved by the page's origin
// inside its spread), while the canvas draws each page at its own
// origin and every other read — hit tests, carets, cell rects — is
// page-local. So wherever a page does not start at its spread's origin
// the selection landed beside the object: on a verso of a facing spread
// the control bar read L −476 / R −232 and the frame was drawn on the
// pasteboard, and on an InDesign document (spread origin at the spine,
// half a page up) every page was off. sample.idml is such a document.
//
// The oracle is the engine's own page-local answer for the same
// element: the hit test's `frameBounds`.

import { expect, test, type Page } from "@playwright/test";

import type { ElementGeometryItem, PageId, WorkerToMain } from "@paged-media/client";

import { pageOrigin } from "../../../../packages/shell/src/state/page-space";
import { openCanvas } from "../fidelity/canvas-driver";
import { sampleFixture } from "./harness/fixtures";
import { selectElements } from "./harness/ui";
import { screenPoint } from "./harness/viewport";

interface Hit {
  element: { kind: string; id: string };
  frame: { left: number; top: number; right: number; bottom: number };
}

/** An element on page `index` and its page-local box, by hit test. */
async function elementOnPage(page: Page, index: number): Promise<Hit> {
  const hit = await page.evaluate(async (pi) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          handle: { pageIds: string[]; pageSizesPt: [number, number][] };
          client: {
            send: (m: unknown) => Promise<{
              payload?: {
                element?: { kind: string; id: string } | null;
                frameBounds?: { left: number; top: number; right: number; bottom: number } | null;
              };
            }>;
          };
        };
      }
    ).__canvas;
    const pageId = c.handle.pageIds[pi];
    const [w, h] = c.handle.pageSizesPt[pi];
    for (let gy = 0.1; gy < 0.95; gy += 0.1) {
      for (let gx = 0.1; gx < 0.95; gx += 0.1) {
        const r = await c.client.send({
          kind: "hitTest",
          payload: { pageId, docPoint: [w * gx, h * gy], filter: "any" },
        });
        const p = r.payload;
        if (p?.element && p.frameBounds && p.element.kind !== "group") {
          return { element: p.element, frame: p.frameBounds };
        }
      }
    }
    return null;
  }, index);
  expect(hit, `an element on page ${index + 1}`).not.toBeNull();
  return hit!;
}

async function controlValue(page: Page, field: string): Promise<number> {
  const raw = await page.locator(`[data-control-field="${field}"] input`).inputValue();
  return Number.parseFloat(raw);
}

test.describe("ED-9 — selection geometry in page space", () => {
  for (const index of [0, 1]) {
    test(`AC-PAGESPACE-${index + 1} — on page ${index + 1} of a facing spread the control bar reads the page-local box @feat:editor-shell.context-toolbars @level:edge`, async ({
      page,
    }) => {
      await openCanvas(page);
      await page.setInputFiles('input[type="file"]', sampleFixture("sample"));
      await page.waitForFunction(
        () => (globalThis as unknown as { __canvas?: { ready?: boolean } }).__canvas?.ready === true,
        null,
        { timeout: 60_000 },
      );
      const hit = await elementOnPage(page, index);
      await selectElements(page, [hit.element]);

      await expect.poll(() => controlValue(page, "x")).toBeCloseTo(hit.frame.left, 0);
      expect(await controlValue(page, "y")).toBeCloseTo(hit.frame.top, 0);
      expect(await controlValue(page, "w")).toBeCloseTo(hit.frame.right - hit.frame.left, 0);
    });
  }

  test("AC-PAGESPACE-3 — the selection chrome is drawn on the object, not beside it @feat:editor-shell.context-toolbars @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await page.setInputFiles('input[type="file"]', sampleFixture("sample"));
    await page.waitForFunction(
      () => (globalThis as unknown as { __canvas?: { ready?: boolean } }).__canvas?.ready === true,
      null,
      { timeout: 60_000 },
    );
    await page.keyboard.press("Home");
    const hit = await elementOnPage(page, 0);
    await selectElements(page, [hit.element]);
    const chrome = page.locator('polygon[stroke="var(--overlay-selection)"]').first();
    await expect(chrome).toBeAttached();
    const expected = await screenPoint(page, hit.frame.left, hit.frame.top);
    await expect
      .poll(async () => {
        const box = await chrome.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return [r.left, r.top];
        });
        return Math.max(Math.abs(box[0] - expected.x), Math.abs(box[1] - expected.y));
      })
      .toBeLessThan(3);
  });
});

// The measurement itself, against a scripted engine: a frame straddling
// the spine of a facing spread, owned by the recto, hit from the verso.
// Once the engine answers elementGeometry in page space, that frame's box
// is recto-local while the hit's frameBounds is verso-local, so measuring
// the verso from it reads the difference between the two pages' origins.
test.describe("ED-9 — the page-origin measurement", () => {
  test("AC-PAGESPACE-4 — a page is measured only from an element it owns @feat:editor-shell.context-toolbars @level:edge", async () => {
    const verso = "uverso" as PageId;
    const recto = "urecto" as PageId;
    const straddler = { kind: "frame", id: "ustraddle" };
    const owned = { kind: "frame", id: "uowned" };
    // Page-local engine (the fixed core): every box is in its owner's space.
    const geometry: Record<string, ElementGeometryItem> = {
      ustraddle: {
        id: straddler,
        pageId: recto,
        bounds: [100, -40, 200, 60],
        itemTransform: [1, 0, 0, 1, 0, 0],
      } as unknown as ElementGeometryItem,
      uowned: {
        id: owned,
        pageId: verso,
        bounds: [300, 100, 400, 200],
        itemTransform: [1, 0, 0, 1, 0, 0],
      } as unknown as ElementGeometryItem,
    };
    const client = {
      subscribe: () => () => undefined,
      collection: async () => [
        { selfId: verso, sizePt: [540, 720] },
        { selfId: recto, sizePt: [540, 720] },
      ],
      elementGeometry: async (ids: Array<{ id: string }>) => ids.map((i) => geometry[i.id]!),
      // The first probe point lands on the straddler (its verso half,
      // verso-local), every later one on the verso's own frame.
      send: (() => {
        let calls = 0;
        return async (): Promise<WorkerToMain> =>
          ({
            kind: "hitResult",
            payload:
              calls++ === 0
                ? { element: straddler, frameBounds: { left: 500, top: 100, right: 600, bottom: 200 } }
                : { element: owned, frameBounds: { left: 100, top: 300, right: 200, bottom: 400 } },
          }) as unknown as WorkerToMain;
      })(),
    };
    const origin = await pageOrigin(client as never, verso);
    expect(origin, "a page-local engine leaves the verso unshifted").toEqual([0, 0]);
  });
});
