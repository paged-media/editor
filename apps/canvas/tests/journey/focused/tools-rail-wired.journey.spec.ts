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

// Journey: the rail tools that used to be DEAD.
//
// Frame (rectangle/ellipse/polygon), Rotate, Scale and Smooth all
// rendered in the rail, accepted a click and then silently did nothing
// — no gesture, no id routing anywhere in app code. They are now wired
// to engine arms that already existed (insertFrame / insertOval /
// insertPath, the `rotate` + `scale` gesture arms the selection chrome
// already drove, and `simplifyPath`). This journey drives each FROM
// THE RAIL through the real viewport, so a regression back to "renders
// but does nothing" fails here rather than in a user's hands.
//
// Collect-failures style (like the sibling focused journeys) so the
// report names exactly which tool stopped driving.

import { expect, test } from "@playwright/test";

import { activateTool, screenPoint, treeCount } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;
type Ref = { kind: string; id: string };

/** One decoded `elementProperties` entry (Value-wrapped). */
const readNumberProp = async (
  page: Page,
  ref: Ref,
  path: string,
): Promise<number | null> => {
  const v = (await page.evaluate(
    async ({ id, p }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (
                id: unknown,
              ) => Promise<{ entries: Array<{ path: string; value: unknown }> } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties(id);
      return props?.entries.find((e) => e.path === p)?.value ?? null;
    },
    { id: ref, p: path },
  )) as { value?: number } | null;
  return v?.value ?? null;
};

/** Anchor count of a path element — the Smooth oracle. */
const anchorCount = (page: Page, ref: Ref): Promise<number> =>
  page.evaluate(async (id) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            pathAnchors: (id: unknown) => Promise<{ anchors: unknown[] } | null>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.pathAnchors(id);
    return r?.anchors.length ?? 0;
  }, ref);

async function dragOnPage(
  page: Page,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  const a = await screenPoint(page, from[0], from[1]);
  const b = await screenPoint(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.waitForTimeout(40);
  await page.mouse.up();
}

test.describe("journey · rail tools that were dead", () => {
  test("frame tools draw, Rotate/Scale transform, Smooth simplifies @feat:editor-tools.draw.rectangle @feat:editor-tools.rotate @feat:editor-tools.scale @feat:editor-tools.draw.pen @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const fail: string[] = [];

    // RECTANGLE FRAME — the `frame` slot's group default (shortcut F,
    // and a live pill on the Design-mode toolbar). Drag → insertFrame.
    try {
      const before = await treeCount(page, "rectangle");
      await activateTool(page, "frame");
      await dragOnPage(page, [90, 90], [250, 200]);
      await expect
        .poll(() => treeCount(page, "rectangle"), { timeout: 5000 })
        .toBeGreaterThan(before);
    } catch (e) {
      fail.push(`frame.rectangle (${String(e).slice(0, 55)})`);
    }

    // ELLIPSE FRAME — Alt+click cycles the slot to it; drag → insertOval.
    try {
      const before = await treeCount(page, "oval");
      await page.locator('[data-tool-slot="frame"]').click({ modifiers: ["Alt"] });
      await expect(
        page.locator(
          '[data-tool-slot="frame"][data-tool="paged.tool.ellipseFrame"][data-active="true"]',
        ),
      ).toBeVisible();
      await dragOnPage(page, [300, 90], [430, 200]);
      await expect
        .poll(() => treeCount(page, "oval"), { timeout: 5000 })
        .toBeGreaterThan(before);
    } catch (e) {
      fail.push(`frame.ellipse (${String(e).slice(0, 55)})`);
    }

    // ROTATE — the `transform` slot faces Rotate (Free Transform is a
    // planned stub and never takes the face). Select a frame, drag →
    // the engine's `rotate` arm commits a non-zero rotation.
    try {
      const rectId = await designer.drawRectangle({ x0: 100, y0: 300, x1: 260, y1: 400 });
      const ref: Ref = { kind: "rectangle", id: rectId };
      await designer.selectElement("rectangle", rectId);
      await activateTool(page, "transform");
      await expect(
        page.locator(
          '[data-tool-slot="transform"][data-tool="paged.tool.rotate"][data-active="true"]',
        ),
      ).toBeVisible();
      await dragOnPage(page, [300, 350], [300, 250]);
      await expect
        .poll(async () => Math.abs((await readNumberProp(page, ref, "frameRotationAngle")) ?? 0), {
          timeout: 5000,
        })
        .toBeGreaterThan(0.5);
    } catch (e) {
      fail.push(`transform.rotate (${String(e).slice(0, 55)})`);
    }

    // SCALE — Alt+click cycles the transform slot to Scale; drag →
    // the `scale` arm moves the frame's scale off 1.0.
    try {
      const rectId = await designer.drawRectangle({ x0: 100, y0: 430, x1: 260, y1: 520 });
      const ref: Ref = { kind: "rectangle", id: rectId };
      await designer.selectElement("rectangle", rectId);
      await activateTool(page, "transform");
      await page
        .locator('[data-tool-slot="transform"]')
        .click({ modifiers: ["Alt"] });
      await expect(
        page.locator(
          '[data-tool-slot="transform"][data-tool="paged.tool.scale"][data-active="true"]',
        ),
      ).toBeVisible();
      await dragOnPage(page, [300, 470], [420, 560]);
      await expect
        .poll(async () => Math.abs(((await readNumberProp(page, ref, "frameScaleX")) ?? 1) - 1), {
          timeout: 5000,
        })
        .toBeGreaterThan(0.01);
    } catch (e) {
      fail.push(`transform.scale (${String(e).slice(0, 55)})`);
    }

    // SMOOTH — a pen path through near-collinear points carries anchors
    // that add nothing; the Smooth tool's `simplifyPath` drops them.
    try {
      const pathId = await designer.drawPath([
        [120, 620],
        [170, 621],
        [220, 620],
        [270, 621],
        [320, 620],
      ]);
      const ref: Ref = { kind: "polygon", id: pathId };
      const before = await anchorCount(page, ref);
      await designer.selectElement("polygon", pathId);
      // The Smooth tool lives behind the Pencil slot's flyout.
      await page.locator('[data-tool-slot="pencil"]').click({ button: "right" });
      await page
        .locator('[data-tool-flyout="pencil"] [data-tool="paged.tool.smooth"]')
        .click();
      await expect(
        page.locator(
          '[data-tool-slot="pencil"][data-tool="paged.tool.smooth"][data-active="true"]',
        ),
      ).toBeVisible();
      const p = await screenPoint(page, 220, 620);
      await page.mouse.click(p.x, p.y);
      await expect
        .poll(() => anchorCount(page, ref), { timeout: 5000 })
        .toBeLessThan(before);
    } catch (e) {
      fail.push(`pencil.smooth (${String(e).slice(0, 55)})`);
    }

    expect(fail, `rail tools that did not drive: ${fail.join(" | ")}`).toEqual([]);
  });
});
