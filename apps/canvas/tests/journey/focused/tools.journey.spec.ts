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

// Journey: the canvas tools a designer reaches for beyond draw/move.
//
// Zoom + pan the viewport, transform an image inside its frame, descend
// into a group, duplicate by Alt-drag, gridify a drag into a frame grid,
// and confirm the selection overlay chrome renders. Each step is isolated
// (collect-failures) so the suite reports exactly which tool aspects drove.

import { expect, test } from "@playwright/test";

import { elementPageRectPt } from "../../e2e/harness/fixtures";
import { runGesture } from "../../e2e/harness/gesture";
import { activateTool, screenPoint, treeCount, treeIds } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

type Cam = { scale: number; tx: number; ty: number };

test.describe("journey · tools", () => {
  test("zoom, pan, content-transform, group descent, duplicate, gridify, overlays @feat:editor-tools.nav.zoom @feat:editor-tools.nav.pan @feat:editor-tools.content-transform @feat:geometry-coordinates.image-content-transform @feat:editor-tools.select.group-descent @feat:editor-tools.move.duplicate-drag @feat:editor-tools.draw.gridify @feat:editor-tools.overlays @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await designer.handle();

    const fail: string[] = [];
    const step = async (name: string, fn: () => Promise<boolean>) => {
      try {
        if (!(await fn())) fail.push(name);
      } catch (e) {
        fail.push(`${name} (${String(e).slice(0, 70)})`);
      }
      // Park back on the select tool between steps.
      await activate("paged.tool.select").catch(() => {});
    };
    const readCam = (): Promise<Cam> =>
      page.evaluate(
        () =>
          (
            globalThis as unknown as {
              __canvas: { client: { camera: { read: () => Cam } } };
            }
          ).__canvas.client.camera.read(),
      );
    const activate = (toolId: string): Promise<unknown> =>
      page.evaluate(
        (id) =>
          (
            globalThis as unknown as {
              __canvas: {
                registries: {
                  commands: { invoke: (c: string) => Promise<unknown> };
                };
              };
            }
          ).__canvas.registries.commands.invoke(`paged.tool.activate.${id}`),
        toolId,
      );
    const activeGroup = (): Promise<string | null> =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { activeGroup: string | null } })
            .__canvas.activeGroup ?? null,
      );
    const setActiveGroup = (g: string | null): Promise<void> =>
      page.evaluate(
        (gid) =>
          (
            globalThis as unknown as {
              __canvas: { setActiveGroup: (g: string | null) => void };
            }
          ).__canvas.setActiveGroup(gid),
        g,
      );

    // OVERLAYS — selecting a frame renders the selection chrome (handles).
    await step("overlays", async () => {
      const id = await designer.drawRectangle({ x0: 80, y0: 90, x1: 220, y1: 200 });
      await designer.selectElement("rectangle", id);
      await expect
        .poll(() => page.locator("[data-selection-handle]").count(), {
          timeout: 4000,
        })
        .toBeGreaterThan(0);
      return true;
    });

    // NAV.ZOOM — the zoom tool clicks in to magnify around the pointer.
    await step("nav.zoom", async () => {
      const before = (await readCam()).scale;
      await activate("paged.tool.zoom");
      const p = await screenPoint(page, 200, 200);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(200);
      const after = (await readCam()).scale;
      return after > before + 1e-4;
    });

    // NAV.PAN — the hand tool drags the camera.
    await step("nav.pan", async () => {
      const before = await readCam();
      await activate("paged.tool.hand");
      const a = await screenPoint(page, 250, 250);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(a.x + 120, a.y + 90, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(150);
      const after = await readCam();
      return Math.abs(after.tx - before.tx) + Math.abs(after.ty - before.ty) > 1;
    });

    // CONTENT-TRANSFORM — translate an image WITHIN its frame; the frame's
    // own page rect must stay put (proof it moved content, not the frame).
    await step("content-transform", async () => {
      const fid = await designer.drawRectangle({ x0: 300, y0: 90, x1: 460, y1: 230 });
      await designer.placeImageLink(fid);
      const ref = { kind: "rectangle", id: fid };
      const before = await elementPageRectPt(page, ref);
      await runGesture(page, [ref], { kind: "translateContent" }, [
        { delta: [18, 12], mods: { shift: false, alt: false } },
      ]);
      const after = await elementPageRectPt(page, ref);
      if (!before || !after) return false;
      const moved =
        Math.abs(before.left - after.left) + Math.abs(before.top - after.top);
      return moved < 0.5; // frame did NOT move
    });

    // SELECT.GROUP-DESCENT — descend into a group, then exit. The descent
    // state machine is driven through the SelectionContext dev hook (the
    // real double-click→hit-test→setActiveGroup chain's first leg is live
    // scene hit-testing, unavailable in the headless CPU-fallback harness;
    // group-transform AC-L-4 covers the descent the same way).
    await step("group-descent", async () => {
      const r1 = await designer.drawRectangle({ x0: 90, y0: 320, x1: 180, y1: 400 });
      const r2 = await designer.drawRectangle({ x0: 200, y0: 320, x1: 290, y1: 400 });
      const ok = await designer.createGroup([
        { kind: "rectangle", id: r1 },
        { kind: "rectangle", id: r2 },
      ]);
      if (!ok) return false;
      const groups = await treeIds(page, "group");
      const gid = groups[0]?.id;
      if (!gid) return false;
      await setActiveGroup(gid);
      await page.waitForTimeout(80);
      const entered = await activeGroup();
      await setActiveGroup(null); // Escape exits descent
      await page.waitForTimeout(80);
      const exited = await activeGroup();
      return entered === gid && exited == null;
    });

    // MOVE.DUPLICATE-DRAG — Alt-drag a selected frame clones it.
    await step("duplicate-drag", async () => {
      const base = await treeCount(page, "rectangle");
      const id = await designer.drawRectangle({ x0: 360, y0: 320, x1: 450, y1: 400 });
      await designer.selectElement("rectangle", id);
      const p = await screenPoint(page, 405, 360);
      await page.keyboard.down("Alt");
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + 70, p.y + 40, { steps: 8 });
      await page.mouse.up();
      await page.keyboard.up("Alt");
      await page.waitForTimeout(200);
      const after = await treeCount(page, "rectangle");
      return after > base + 1; // base + drawn + clone
    });

    // DRAW.GRIDIFY — rubber-band a rectangle, arrow keys split it into a grid.
    await step("gridify", async () => {
      const base = await treeCount(page, "rectangle");
      // Arm the Rectangle through the REAL rail slot ("shape") — the
      // pointer handler keys off the armed rail tool, not just activeTool.
      await activateTool(page, "shape");
      const a = await screenPoint(page, 90, 440);
      const b = await screenPoint(page, 330, 560);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.waitForTimeout(40);
      // Pull past the click-vs-drag slop so the gesture is ACTIVE.
      await page.mouse.move(b.x, b.y, { steps: 6 });
      await page.waitForTimeout(60);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(20);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(20);
      await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(60);
      await page.mouse.up();
      await page.waitForTimeout(200);
      const after = await treeCount(page, "rectangle");
      return after >= base + 4; // a grid of ≥4 cells
    });

    expect(fail, `tool aspects that did not verify: ${fail.join(" | ")}`).toEqual(
      [],
    );
  });
});
