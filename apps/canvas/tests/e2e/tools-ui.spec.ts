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

// E2E op suite — tools UI (the REAL viewport). The domain suites
// drive ops through panels / the wire; this one drives the canvas
// itself: load through the React file-input path so ViewportCanvas
// mounts and renders, fit page 0 (Home), activate the Rectangle tool
// from the rail, and DRAG with the mouse — proving the Tool→Operation
// spine end-to-end (pointer events → gesture handler → insertFrame
// Mutation → a frame in the document, undoable).
//
// This suite caught a real editor bug: ViewportCanvas.onPointerDown's
// useCallback omitted `props.toolGesture` from its deps, so a draw
// tool's handler (which arrives AFTER the tool is activated) stayed
// stale and the first drag fell through to the legacy select path —
// the Rectangle/Line/Pen tools silently never drew. Fixed by adding
// the dep; this suite is the regression guard.
//
// Page 0 sits at document origin and the load camera fits ALL pages,
// so the viewport centre is on the pasteboard. Home fits page 0 to
// the viewport; we then compute its on-screen centre from the live
// camera (`screen = doc·scale + t`) and drag there.

import { expect, test, type Page } from "@playwright/test";
import { fitFirstPage } from "../fidelity/canvas-driver";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

async function countKind(page: Page, kind: string): Promise<number> {
  return page.evaluate(async (k) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.tree()");
    const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
      id?: { kind: string } | null;
      children?: unknown[];
    }>;
    let n = 0;
    const visit = (node: {
      id?: { kind: string } | null;
      children?: unknown[];
    }) => {
      if (node.id && node.id.kind === k) n += 1;
      for (const ch of (node.children ?? []) as typeof tree) visit(ch);
    };
    for (const root of tree) visit(root);
    return n;
  }, kind);
}

/** Absolute screen centre of page 0, from the live camera + the
 *  viewport canvas wrapper rect. */
async function pageZeroScreenCenter(
  page: Page,
): Promise<{ x: number; y: number; scale: number }> {
  return page.evaluate(() => {
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
          handle: { pageSizesPt: [number, number][] };
          client: {
            camera: { read: () => { scale: number; tx: number; ty: number } };
          };
        };
      }
    ).__canvas;
    const [w0, h0] = c.handle.pageSizesPt[0];
    const cam = c.client.camera.read();
    return {
      x: wrap.left + (w0 / 2) * cam.scale + cam.tx,
      y: wrap.top + (h0 / 2) * cam.scale + cam.ty,
      scale: cam.scale,
    };
  });
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

async function activateRectangleTool(page: Page): Promise<void> {
  await page.locator('[data-tool-slot="shape"]').click();
  await expect(
    page.locator('[data-tool-slot="shape"][data-active="true"]'),
  ).toBeVisible();
}

test.describe("E2E tools-ui (real viewport drag)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    // Load through the REACT path so ViewportCanvas mounts + renders.
    await page.setInputFiles('input[type="file"]', fixturePath("geometry"));
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (globalThis as unknown as { __canvas: { ready: boolean } })
                .__canvas.ready,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    // Home → fit page 0 to the viewport (a large, centred drag target).
    await fitFirstPage(page);
    await expect
      .poll(() => pageZeroScreenCenter(page).then((p) => p.scale), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0.2);
  });

  test("AC-E2E-TOOLS-1 — dragging the Rectangle tool on the canvas creates a frame; undo removes it @feat:editor-tools.draw.rectangle @level:happy", async ({
    page,
  }) => {
    const before = await countKind(page, "rectangle");
    await activateRectangleTool(page);

    const c = await pageZeroScreenCenter(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.waitForTimeout(40);
    await page.mouse.move(c.x + 30, c.y + 22, { steps: 6 });
    await page.mouse.move(c.x + 65, c.y + 48, { steps: 6 });
    await page.waitForTimeout(40);
    await page.mouse.up();

    await expect
      .poll(() => countKind(page, "rectangle"), { timeout: 5_000 })
      .toBe(before + 1);

    await undo(page);
    await expect.poll(() => countKind(page, "rectangle")).toBe(before);
  });

  test("AC-E2E-TOOLS-2 — a click (no drag) with the Rectangle tool creates nothing @feat:editor-tools.draw.rectangle @level:gesture", async ({
    page,
  }) => {
    const before = await countKind(page, "rectangle");
    await activateRectangleTool(page);

    // A bare click ON the page (sub-threshold) opens a dialog in
    // InDesign, creates nothing here — the handler's MIN_SIZE_PT guard.
    const c = await pageZeroScreenCenter(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.up();

    await page.waitForTimeout(400);
    expect(await countKind(page, "rectangle")).toBe(before);
  });
});
