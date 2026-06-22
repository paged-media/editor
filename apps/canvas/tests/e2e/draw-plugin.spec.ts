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

// E2E — paged.draw tool suite (plugin-draw milestone D2, the REAL
// viewport). Drives the Pen + anchor tools exactly as a user would:
// activate from the rail / shortcut, click & drag on the canvas,
// commit with Enter or by closing on the first anchor — proving the
// pointer events → @paged-media/draw-tools machine → Mutation chain
// end-to-end (insertPath, then pathPointInsert / pathPointRemove /
// pathPointCurveType through the anchor planners), undoable on the
// shared history.
//
// Coverage:
//   AC-DRAW-1  pen click×3 + Enter → open 3-anchor path; undo removes
//   AC-DRAW-2  pen click-drag → smooth anchor (mirrored handles)
//   AC-DRAW-3  pen click-first-anchor → closed path
//   AC-DRAW-4  Escape cancels — nothing created
//   AC-DRAW-5  add anchor splits the segment 3→4; delete returns 4→3;
//              convert toggles corner→smooth on a vertex

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

type ElementRef = { kind: string; id: string };

type PathAnchorTriple = {
  anchor: [number, number];
  left: [number, number];
  right: [number, number];
};

interface PathAnchorsResult {
  pageId: string;
  anchors: PathAnchorTriple[];
  subpathStarts: number[];
  subpathOpen?: boolean[];
}

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

/** The current single element selection (the pen's post-insert
 *  selection — how the suite addresses the path it just drew). */
async function selectedElement(page: Page): Promise<ElementRef | null> {
  return page.evaluate(async () => {
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
    const r = await c.client.executeScript("paged.selection()");
    const ids = JSON.parse(r.output[0] ?? "[]") as ElementRef[];
    return ids.length === 1 ? ids[0] : null;
  });
}

async function pathAnchorsOf(
  page: Page,
  ref: ElementRef,
): Promise<PathAnchorsResult | null> {
  return page.evaluate(async (r) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            pathAnchors: (id: unknown) => Promise<PathAnchorsResult | null>;
          };
        };
      }
    ).__canvas;
    return c.client.pathAnchors(r).catch(() => null);
  }, ref);
}

/** Absolute screen centre of page 0, from the live camera + the
 *  viewport canvas wrapper rect (the tools-ui helper). */
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

async function activatePenTool(page: Page): Promise<void> {
  await page.locator('[data-tool-slot="pen"]').click();
  await expect(
    page.locator('[data-tool-slot="pen"][data-active="true"]'),
  ).toBeVisible();
}

/** Click (down+up, no travel) at absolute screen coords. */
async function clickAt(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.up();
  await page.waitForTimeout(30);
}

/** Draw a 3-click open triangle path with the pen; returns its
 *  selected element ref. Vertices relative to page-0 centre. */
async function drawTriangle(
  page: Page,
  c: { x: number; y: number },
): Promise<ElementRef> {
  await activatePenTool(page);
  await clickAt(page, c.x, c.y);
  await clickAt(page, c.x + 80, c.y);
  await clickAt(page, c.x + 40, c.y + 60);
  await page.keyboard.press("Enter");
  await expect.poll(() => selectedElement(page), { timeout: 5_000 }).not.toBeNull();
  return (await selectedElement(page))!;
}

test.describe("E2E draw-plugin (pen + anchor tools, real viewport)", () => {
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
    // Home → fit page 0 to the viewport (a large, centred target).
    await page.keyboard.press("Home");
    await page.waitForTimeout(1200);
    await expect
      .poll(() => pageZeroScreenCenter(page).then((p) => p.scale), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0.2);
  });

  test("AC-DRAW-1 — pen click×3 + Enter creates an open 3-anchor path; undo removes it @feat:plugin-draw.anchor-add @feat:plugin-draw.anchor-convert @feat:plugin-draw.anchor-delete @feat:plugin-platform.bundle-lifecycle @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const before = await countKind(page, "polygon");
    const c = await pageZeroScreenCenter(page);
    const ref = await drawTriangle(page, c);

    await expect
      .poll(() => countKind(page, "polygon"), { timeout: 5_000 })
      .toBe(before + 1);

    const snap = (await pathAnchorsOf(page, ref))!;
    expect(snap.anchors).toHaveLength(3);
    // Open path — the machine committed { open: true }.
    expect(snap.subpathOpen?.[0] ?? false).toBe(true);
    // Clicks are corner anchors: handles collapsed onto the point.
    for (const a of snap.anchors) {
      expect(Math.hypot(a.left[0] - a.anchor[0], a.left[1] - a.anchor[1])).toBeLessThan(1e-3);
      expect(Math.hypot(a.right[0] - a.anchor[0], a.right[1] - a.anchor[1])).toBeLessThan(1e-3);
    }

    await undo(page);
    await expect.poll(() => countKind(page, "polygon")).toBe(before);
  });

  test("AC-DRAW-2 — pen click-drag pulls mirrored smooth handles @feat:plugin-draw.anchor-add @feat:plugin-draw.anchor-convert @feat:plugin-draw.anchor-delete @feat:plugin-platform.bundle-lifecycle @level:gesture", async ({
    page,
  }) => {
    const before = await countKind(page, "polygon");
    const c = await pageZeroScreenCenter(page);
    await activatePenTool(page);
    // Corner first…
    await clickAt(page, c.x, c.y);
    // …then a drag: down at the anchor, pull 40px right.
    await page.mouse.move(c.x + 80, c.y);
    await page.mouse.down();
    await page.waitForTimeout(30);
    await page.mouse.move(c.x + 120, c.y, { steps: 5 });
    await page.waitForTimeout(30);
    await page.mouse.up();
    await page.keyboard.press("Enter");

    await expect
      .poll(() => countKind(page, "polygon"), { timeout: 5_000 })
      .toBe(before + 1);
    const ref = (await selectedElement(page))!;
    const snap = (await pathAnchorsOf(page, ref))!;
    expect(snap.anchors).toHaveLength(2);
    const smooth = snap.anchors[1];
    const out = Math.hypot(
      smooth.right[0] - smooth.anchor[0],
      smooth.right[1] - smooth.anchor[1],
    );
    const inn = Math.hypot(
      smooth.left[0] - smooth.anchor[0],
      smooth.left[1] - smooth.anchor[1],
    );
    // ~40 px pulled at the fit-zoom scale — assert it's clearly a
    // smooth pair, mirrored within tolerance.
    expect(out).toBeGreaterThan(5);
    expect(Math.abs(out - inn)).toBeLessThan(1);

    await undo(page);
    await expect.poll(() => countKind(page, "polygon")).toBe(before);
  });

  test("AC-DRAW-3 — clicking the first anchor closes the path @feat:plugin-draw.anchor-add @feat:plugin-draw.anchor-convert @feat:plugin-draw.anchor-delete @feat:plugin-platform.bundle-lifecycle @level:gesture", async ({
    page,
  }) => {
    const before = await countKind(page, "polygon");
    const c = await pageZeroScreenCenter(page);
    await activatePenTool(page);
    await clickAt(page, c.x, c.y);
    await clickAt(page, c.x + 80, c.y);
    await clickAt(page, c.x + 40, c.y + 60);
    // Close: click the first anchor again (within the 6px tolerance).
    await clickAt(page, c.x, c.y);

    await expect
      .poll(() => countKind(page, "polygon"), { timeout: 5_000 })
      .toBe(before + 1);
    const ref = (await selectedElement(page))!;
    const snap = (await pathAnchorsOf(page, ref))!;
    expect(snap.anchors).toHaveLength(3);
    expect(snap.subpathOpen?.[0] ?? false).toBe(false);

    await undo(page);
    await expect.poll(() => countKind(page, "polygon")).toBe(before);
  });

  test("AC-DRAW-4 — Escape cancels the in-progress path; nothing is created @feat:plugin-draw.anchor-add @feat:plugin-draw.anchor-convert @feat:plugin-draw.anchor-delete @feat:plugin-platform.bundle-lifecycle @level:gesture", async ({
    page,
  }) => {
    const before = await countKind(page, "polygon");
    const c = await pageZeroScreenCenter(page);
    await activatePenTool(page);
    await clickAt(page, c.x, c.y);
    await clickAt(page, c.x + 80, c.y);
    await page.keyboard.press("Escape");

    await page.waitForTimeout(400);
    expect(await countKind(page, "polygon")).toBe(before);
  });

  test("AC-DRAW-5 — add anchor splits a segment; delete removes it; convert smooths a corner @feat:plugin-draw.anchor-add @feat:plugin-draw.anchor-convert @feat:plugin-draw.anchor-delete @feat:plugin-platform.bundle-lifecycle @level:gesture", async ({
    page,
  }) => {
    const c = await pageZeroScreenCenter(page);
    const ref = await drawTriangle(page, c);
    expect((await pathAnchorsOf(page, ref))!.anchors).toHaveLength(3);

    // Add Anchor Point — click the midpoint of the straight first
    // segment (c → c+80,0). The planner projects onto the cubic and
    // batches the curve-preserving 3-op insert.
    await page.keyboard.press("=");
    await clickAt(page, c.x + 40, c.y);
    await expect
      .poll(
        () => pathAnchorsOf(page, ref).then((s) => s?.anchors.length ?? 0),
        { timeout: 5_000 },
      )
      .toBe(4);

    // Delete Anchor Point — click the anchor we just added.
    await page.keyboard.press("-");
    await clickAt(page, c.x + 40, c.y);
    await expect
      .poll(
        () => pathAnchorsOf(page, ref).then((s) => s?.anchors.length ?? 0),
        { timeout: 5_000 },
      )
      .toBe(3);

    // Convert Direction Point — the MIDDLE vertex (both neighbours
    // present; the engine's smooth derivation falls back to corner on
    // open-path endpoints, apply.rs "need both neighbours" rule).
    await page.keyboard.press("Shift+C");
    await clickAt(page, c.x + 80, c.y);
    await expect
      .poll(
        async () => {
          const snap = await pathAnchorsOf(page, ref);
          if (!snap) return 0;
          const a = snap.anchors[1];
          return Math.hypot(
            a.right[0] - a.anchor[0],
            a.right[1] - a.anchor[1],
          );
        },
        { timeout: 5_000 },
      )
      .toBeGreaterThan(0.5);
  });
});
