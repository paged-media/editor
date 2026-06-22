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

// Journey: paged.draw VECTOR-GRAPHIC EDIT CONTEXT — double-click a
// path-bearing element ENTERS anchor-editing; Esc pops back out.
//
// The bundle contributes a kind-claimed `vectorGraphic` edit context
// (entry: doubleClick) over the path kinds (polygon / rectangle /
// graphicLine / textFrame). Entering focuses the anchor-editing tool-set
// and raises the Stroke panel; a breadcrumb shows "Vector graphic". This
// journey authors a rectangle on a blank File ▸ New document,
// double-clicks it through the real ViewportCanvas, and asserts the
// context entered — via BOTH the user-visible breadcrumb chrome AND the
// journey context oracle (editContext.type === "vectorGraphic"). Esc pops
// the stack and the context clears.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

type ElementRef = { kind: string; id: string };

/** Screen point at the centre of an element's transformed page-0 bounds
 *  (the same derivation the edit-context e2e uses). */
async function elementScreenCenter(
  page: import("@playwright/test").Page,
  ref: ElementRef,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(async (id) => {
    let best: HTMLCanvasElement | null = null;
    let bestArea = 0;
    for (const cv of Array.from(document.querySelectorAll("canvas"))) {
      const r = cv.getBoundingClientRect();
      if (r.width * r.height > bestArea) {
        bestArea = r.width * r.height;
        best = cv;
      }
    }
    const wrap = (best?.parentElement ?? best)!.getBoundingClientRect();
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            camera: { read: () => { scale: number; tx: number; ty: number } };
            elementGeometry: (ids: unknown[]) => Promise<
              Array<{
                bounds: [number, number, number, number];
                itemTransform?:
                  | [number, number, number, number, number, number]
                  | null;
              }>
            >;
          };
        };
      }
    ).__canvas;
    const items = await c.client.elementGeometry([id]);
    const item = items[0];
    if (!item) return null;
    const [top, left, bottom, right] = item.bounds;
    const [a, b, cc, d, tx, ty] = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const px = a * cx + cc * cy + tx;
    const py = b * cx + d * cy + ty;
    const cam = c.client.camera.read();
    return {
      x: wrap.left + px * cam.scale + cam.tx,
      y: wrap.top + py * cam.scale + cam.ty,
    };
  }, ref);
}

test.describe("journey · paged.draw vectorGraphic edit context", () => {
  test("a designer double-clicks a path to enter the vectorGraphic context, then Esc exits @feat:plugin-draw.edit-context-live @feat:plugin-platform.bundle-lifecycle @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    // No context active on a fresh document — the chrome is absent.
    await expect(breadcrumb).toHaveCount(0);

    // ── 1. AUTHOR — a rectangle (a path-bearing kind the vectorGraphic
    //    context claims; it has no web metadata, so the webFrame object
    //    type does NOT claim it first). Filled so the double-click target
    //    is over ink. ──
    const id = await designer.drawRectangle({ x0: 170, y0: 170, x1: 440, y1: 360 });
    expect(id, "drew a rectangle").not.toBe("");
    const ref: ElementRef = { kind: "rectangle", id };
    await designer.applyFill("rectangle", id, "Color/Black");

    // Re-fit so the live camera is settled for the double-click mapping.
    await page.keyboard.press("Home");
    await page.waitForTimeout(400);

    // ── 2. DOUBLE-CLICK → enter the vectorGraphic edit context. ──
    const at = await elementScreenCenter(page, ref);
    expect(at, "the rectangle resolves to a screen point").not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);

    // The breadcrumb appears with the "Vector graphic" crumb — the
    // user-visible proof the context is active.
    await expect(breadcrumb, "the edit-context breadcrumb appears").toBeVisible({
      timeout: 6_000,
    });
    await expect(
      breadcrumb.locator('[data-edit-context-crumb="vectorGraphic"]'),
    ).toHaveText(/Vector graphic/);

    // The journey oracle agrees: the edit-context stack top is the
    // vectorGraphic context.
    await designer.expectContext({
      intent: "Double-click a path → vectorGraphic edit context entered",
      editContext: { type: "vectorGraphic" },
    });

    // ── 3. ESC — pop one level → back to the default surface. ──
    await page.keyboard.press("Escape");
    await expect(breadcrumb, "Esc pops the edit context").toHaveCount(0, {
      timeout: 6_000,
    });
    await designer.expectContext({
      intent: "Esc exits the vectorGraphic context → no edit context",
      editContext: { type: null },
    });
  });
});
