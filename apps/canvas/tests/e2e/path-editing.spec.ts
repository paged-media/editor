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

// E2E — PATH EDITING through the real viewport, against the real engine:
// dragging anchors, Bézier handles and segments, the anchor marquee,
// the keys, the Direct Selection tool, and the Pen on paths that
// already exist.
//
// The behaviour is paged.draw's (`DirectSelectMachine`, `PenMachine`),
// proven host-free in that repo's own specs and against a headless
// engine in its conformance suite. What only THIS tier can prove is the
// editor's half — that a real pointer on a real dot becomes the right
// hit, at the right zoom, on the right element, and that the plan the
// machine returns lands in the document as ONE undo step:
//
//   pointer → ViewportCanvas → DirectSelectSession → machine → one
//   batch → engine → pathAnchors → the overlay
//
// Every edit is asserted three ways, because each is a way a path edit
// goes wrong that a machine test cannot see:
//   · the engine's table is what the gesture asked for;
//   · the anchors the gesture did NOT name are byte-identical (an index
//     one off moves a neighbour);
//   · ONE undo restores the whole table.
//
// The document is built in-test (`buildPathEditIdml`): no generated
// fixture has a smooth anchor, a rotated path, two open paths and an
// element without an anchor table on one page. Positions are page-local
// pt; assertions on dragged values allow for the pointer's sub-pixel
// rounding, assertions on untouched ones do not.

import { expect, test, type Page } from "@playwright/test";

import { fitFirstPage, openCanvas, openPanel } from "../fidelity/canvas-driver";
import {
  PATH_EDIT_FIXTURE as FX,
  buildPathEditIdml,
} from "./harness/build-min-idml";
import { pagePng } from "./harness/gesture";
import { diffPngPixels } from "./harness/pixel-diff";
import { activateTool, screenPoint } from "./harness/viewport";

type Pt = [number, number];

interface ElementRef {
  kind: string;
  id: string;
}

interface Triple {
  anchor: Pt;
  left: Pt;
  right: Pt;
}

interface Table {
  anchors: Triple[];
  subpathStarts: number[];
  subpathOpen: boolean[];
  itemTransform: number[] | null;
}

interface CanvasGlobal {
  ready: boolean;
  elementSelection: ElementRef[];
  setElementSelection: (ids: ElementRef[]) => void;
  setElementGeometry: (items: unknown[]) => void;
  client: {
    pathAnchors: (id: ElementRef) => Promise<{
      anchors: Triple[];
      subpathStarts: number[];
      subpathOpen?: boolean[];
      itemTransform?: number[] | null;
    } | null>;
    setElementSelection: (
      ids: ElementRef[],
      mode: string,
    ) => Promise<ElementRef[]>;
    elementGeometry: (ids: ElementRef[]) => Promise<unknown[]>;
    undo: () => Promise<unknown>;
    sceneTree: () => Promise<TreeNode[]>;
  };
}

interface TreeNode {
  id?: ElementRef | null;
  children?: TreeNode[];
}

const PAGE_WIDTH_PT = 612;
/** Sub-pixel slack on a value the POINTER produced: screen px → pt →
 *  the engine's f32. Nowhere near a neighbouring anchor. */
const DRAG_EPS = 0.01;

// ---------------------------------------------------------------- reads

/** The engine's anchor table, or null when the element has none. */
async function tableOf(page: Page, ref: ElementRef): Promise<Table | null> {
  return page.evaluate(async (id) => {
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    const r = await c.client.pathAnchors(id).catch(() => null);
    if (!r) return null;
    return {
      anchors: r.anchors,
      subpathStarts: r.subpathStarts,
      subpathOpen: r.subpathOpen ?? [],
      itemTransform: r.itemTransform ?? null,
    };
  }, ref);
}

async function mustTable(page: Page, ref: ElementRef): Promise<Table> {
  const t = await tableOf(page, ref);
  if (!t) throw new Error(`no anchor table for ${JSON.stringify(ref)}`);
  return t;
}

/** Every element in the document, as `kind:id`, in tree order. */
async function elementKeys(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    const out: string[] = [];
    const visit = (n: TreeNode) => {
      if (n.id) out.push(`${n.id.kind}:${n.id.id}`);
      for (const ch of n.children ?? []) visit(ch);
    };
    for (const root of await c.client.sceneTree()) visit(root);
    return out;
  });
}

async function selection(page: Page): Promise<ElementRef[]> {
  return page.evaluate(
    () =>
      (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas
        .elementSelection,
  );
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    await c.client.undo();
  });
}

/** The selected anchors, as the overlay draws them (flat indices). */
async function selectedAnchors(page: Page): Promise<number[]> {
  return page
    .locator('[data-path-anchor$=":anchor"][data-selected="true"]')
    .evaluateAll((els) =>
      els.map((e) =>
        Number((e.getAttribute("data-path-anchor") ?? "").split(":")[0]),
      ),
    );
}

const near = (value: number, want: number) =>
  expect(Math.abs(value - want), `${value} ≈ ${want}`).toBeLessThan(DRAG_EPS);

function expectPoint(got: Pt, want: Pt, what: string): void {
  expect(
    Math.hypot(got[0] - want[0], got[1] - want[1]),
    `${what}: [${got}] ≈ [${want}]`,
  ).toBeLessThan(DRAG_EPS);
}

/** THE WRONG-NODE SYMPTOM: every anchor not named is byte-identical. */
function expectUntouched(after: Table, before: Table, indices: number[]): void {
  for (const i of indices) {
    expect(JSON.stringify(after.anchors[i]), `anchor ${i} untouched`).toBe(
      JSON.stringify(before.anchors[i]),
    );
  }
}

/** ONE undo, and the table is the original — all of it. */
async function expectOneUndoRestores(
  page: Page,
  ref: ElementRef,
  original: Table,
): Promise<void> {
  await undo(page);
  await expect.poll(() => tableOf(page, ref)).toEqual(original);
}

// --------------------------------------------------------------- driving

/** View ▸ Snap to points OFF. The specs that pin the pointer → geometry
 *  mapping drag to arbitrary points a few pt off other anchors' lines;
 *  with snapping on (the default) those land ON the lines, which is
 *  snapping working, not the mapping. Snapping has its own specs
 *  (AC-SNAP-*), with the default left on. */
async function snapOff(page: Page): Promise<void> {
  await page.evaluate(() =>
    (
      globalThis as unknown as {
        __canvas: { registries: { commands: { invoke: (c: string) => Promise<unknown> } } };
      }
    ).__canvas.registries.commands.invoke("paged.view.toggleSnapToPoints"),
  );
}

async function loadPathEditFixture(page: Page): Promise<void> {
  await openCanvas(page);
  // Through the React file-input path, so the viewport mounts.
  await page.setInputFiles('input[type="file"]', {
    name: "path-edit.idml",
    mimeType: "application/vnd.adobe.indesign-idml-package",
    buffer: Buffer.from(buildPathEditIdml()),
  });
  // Loaded THREE times over, and each is a different fact: the worker
  // holds the fixture; React's document handle is the fixture (it lands
  // a beat after the worker's reply); and the viewport that handle
  // mounts has a measured canvas. Fitting — or mapping a point — before
  // the last one races the mount.
  await expect
    .poll(async () => (await tableOf(page, FX.quad))?.anchors.length ?? 0, {
      timeout: 30_000,
    })
    .toBe(4);
  await expect
    .poll(
      () =>
        page.evaluate((pageId) => {
          const c = (
            globalThis as unknown as {
              __canvas: { ready: boolean; handle?: { pageIds: string[] } | null };
            }
          ).__canvas;
          if (!c.ready || c.handle?.pageIds[0] !== pageId) return 0;
          const cv = document.querySelector("[data-paged-canvas]");
          if (!cv) return 0;
          const r = cv.getBoundingClientRect();
          return Math.min(r.width, r.height);
        }, FX.pageId),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(10);
  await fitFirstPage(page);
  await expect.poll(() => cameraScale(page)).toBeGreaterThan(0);
}

/** Select programmatically — worker, React mirror and the geometry the
 *  chrome is drawn from — then Enter: the Selection tool's way in. */
async function enterPathEdit(page: Page, ref: ElementRef): Promise<void> {
  await page.evaluate(async (id) => {
    const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
    const ids = await c.client.setElementSelection([id], "replace");
    c.setElementSelection(ids);
    c.setElementGeometry(await c.client.elementGeometry(ids));
  }, ref);
  await expect.poll(() => selection(page)).toEqual([ref]);
  await page.keyboard.press("Enter");
  await expect(
    page.locator(`[data-path-edit="${ref.kind}:${ref.id}"]`),
  ).toHaveCount(1);
}

interface DragOptions {
  /** Held from just AFTER the press to just after the release — the
   *  machine reads Shift (constrain) and Alt (break the handle pair)
   *  per sample. Shift at the PRESS means something else (add to the
   *  selection), so it is never down then. */
  hold?: "Shift" | "Alt";
  /** Called with the pointer still down, at the end point. */
  beforeRelease?: () => Promise<void>;
}

/** Press at `from`, travel to `to`, release. Page-local pt. */
async function drag(
  page: Page,
  from: Pt,
  to: Pt,
  options: DragOptions = {},
): Promise<void> {
  const a = await screenPoint(page, from[0], from[1]);
  const b = await screenPoint(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  if (options.hold) await page.keyboard.down(options.hold);
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  if (options.beforeRelease) await options.beforeRelease();
  await page.mouse.up();
  if (options.hold) await page.keyboard.up(options.hold);
}

async function click(page: Page, at: Pt): Promise<void> {
  const s = await screenPoint(page, at[0], at[1]);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.up();
}

/** The Pen's click: the hover first (the tool resolves what is under
 *  the pointer from it), then down / up. */
async function penClick(page: Page, at: Pt): Promise<void> {
  const s = await screenPoint(page, at[0], at[1]);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.up();
  await page.waitForTimeout(30);
}

async function cameraScale(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __canvas: { client: { camera: { read: () => { scale: number } } } };
        }
      ).__canvas.client.camera.read().scale,
  );
}

/** View ▸ Zoom In about the viewport centre, repeated until the page
 *  shows at `atLeast` or more, and waited to REST each time: the
 *  command animates, and a pointer mapped mid-flight misses. Asserts
 *  the end state, not the step — how far one invocation zooms is the
 *  command's business. */
async function zoomInTo(page: Page, atLeast: number): Promise<number> {
  for (let i = 0; i < 8 && (await cameraScale(page)) < atLeast; i++) {
    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              commands: { invoke: (id: string) => Promise<unknown> };
            };
          };
        }
      ).__canvas;
      await c.registries.commands.invoke("paged.view.zoomIn");
    });
    // At rest: two reads a beat apart agree.
    let last = -1;
    await expect
      .poll(
        async () => {
          const now = await cameraScale(page);
          const settled = now === last;
          last = now;
          return settled;
        },
        { timeout: 5_000, intervals: [120] },
      )
      .toBe(true);
  }
  const scale = await cameraScale(page);
  expect(scale, "zoomed in").toBeGreaterThanOrEqual(atLeast);
  return scale;
}

/** Point on a cubic at `t`. */
function evalCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [
    w[0] * p0[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * p3[0],
    w[0] * p0[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * p3[1],
  ];
}

// ================================================================= specs

test.describe("E2E path editing — anchors, handles and segments", () => {
  test.beforeEach(async ({ page }) => {
    await loadPathEditFixture(page);
    await snapOff(page);
  });

  test("AC-PATHEDIT-1 — dragging an anchor moves it and ONLY it; the overlay previews, the page repaints, one undo restores @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:geometry-coordinates.path-topology-ops @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.quad);
    expect(before.anchors.map((a) => a.anchor)).toEqual([
      [100, 100],
      [300, 100],
      [300, 300],
      [100, 300],
    ]);
    const pngBefore = await pagePng(page, FX.pageId, PAGE_WIDTH_PT);
    await enterPathEdit(page, FX.quad);
    await expect(page.locator('[data-path-anchor$=":anchor"]')).toHaveCount(4);

    await drag(page, [300, 300], [330, 290], {
      beforeRelease: async () => {
        // THE PREVIEW: the dot is under the pointer and the anchor is
        // selected — while the document has not been touched.
        const end = await screenPoint(page, 330, 290);
        await expect
          .poll(async () => {
            const box = await page
              .locator('[data-path-anchor="2:anchor"]')
              .boundingBox();
            if (!box) return Infinity;
            return Math.hypot(
              box.x + box.width / 2 - end.x,
              box.y + box.height / 2 - end.y,
            );
          })
          .toBeLessThan(1.5);
        expect(await selectedAnchors(page)).toEqual([2]);
        expect(await mustTable(page, FX.quad)).toEqual(before);
      },
    });

    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors[2].anchor[0])
      .toBeGreaterThan(329);
    const after = await mustTable(page, FX.quad);
    // The anchor, handles and all, is where the pointer let go.
    for (const role of ["anchor", "left", "right"] as const) {
      expectPoint(after.anchors[2][role], [330, 290], `anchor 2 ${role}`);
    }
    expectUntouched(after, before, [0, 1, 3]);
    expect(after.subpathStarts).toEqual(before.subpathStarts);
    expect(after.subpathOpen).toEqual(before.subpathOpen);

    // The path really re-rendered: the corner's two edges moved.
    await expect
      .poll(async () => {
        const now = await pagePng(page, FX.pageId, PAGE_WIDTH_PT);
        return diffPngPixels(pngBefore, now).changed;
      })
      .toBeGreaterThan(40);

    await expectOneUndoRestores(page, FX.quad, before);
    // And the session re-seated on the undone table: the SAME drag again
    // lands in the same place, not on top of a stale preview.
    await expect
      .poll(async () => {
        const box = await page
          .locator('[data-path-anchor="2:anchor"]')
          .boundingBox();
        const home = await screenPoint(page, 300, 300);
        if (!box) return Infinity;
        return Math.hypot(
          box.x + box.width / 2 - home.x,
          box.y + box.height / 2 - home.y,
        );
      })
      .toBeLessThan(1.5);
    await drag(page, [300, 300], [330, 290]);
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors[2].anchor[0])
      .toBeGreaterThan(329);
    expectPoint(
      (await mustTable(page, FX.quad)).anchors[2].anchor,
      [330, 290],
      "anchor 2 after undo + redrag",
    );
  });

  test("AC-PATHEDIT-2 — a smooth anchor's handle drag swings BOTH handles; the opposite stays collinear and keeps its length @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:geometry-coordinates.bezier-path-geometry @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.arch);
    expect(before.anchors[1]).toEqual({
      anchor: [450, 200],
      left: [410, 200],
      right: [530, 200],
    });
    await enterPathEdit(page, FX.arch);
    // Three anchors, and the middle one's two handle dots.
    await expect(page.locator("[data-path-anchor]")).toHaveCount(5);

    // The right handle (80 long), swung straight down.
    await drag(page, [530, 200], [450, 280]);
    await expect
      .poll(async () => (await mustTable(page, FX.arch)).anchors[1].right[1])
      .toBeGreaterThan(279);
    const after = await mustTable(page, FX.arch);
    expectPoint(after.anchors[1].right, [450, 280], "dragged handle");
    // The left one is now straight UP, still 40 long.
    expectPoint(after.anchors[1].left, [450, 160], "opposite handle");
    expect(after.anchors[1].anchor).toEqual([450, 200]);
    expectUntouched(after, before, [0, 2]);

    // Two ops, ONE step.
    await expectOneUndoRestores(page, FX.arch, before);
  });

  test("AC-PATHEDIT-3 — Alt drags one handle and leaves the other where it was @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:geometry-coordinates.bezier-path-geometry @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.arch);
    await enterPathEdit(page, FX.arch);
    await drag(page, [530, 200], [450, 280], { hold: "Alt" });
    await expect
      .poll(async () => (await mustTable(page, FX.arch)).anchors[1].right[1])
      .toBeGreaterThan(279);
    const after = await mustTable(page, FX.arch);
    expectPoint(after.anchors[1].right, [450, 280], "dragged handle");
    // Byte-identical: the pair was broken, the left handle never moved.
    expect(after.anchors[1].left).toEqual([410, 200]);
    expect(after.anchors[1].anchor).toEqual([450, 200]);
    expectUntouched(after, before, [0, 2]);
    await expectOneUndoRestores(page, FX.arch, before);
  });

  test("AC-PATHEDIT-4 — dragging a segment bends it: the grabbed point follows the pointer, both anchors stay @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:geometry-coordinates.bezier-path-geometry @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.quad);
    await enterPathEdit(page, FX.quad);
    // The top edge (100,100)→(300,100) at its midpoint, pulled 30 up.
    await drag(page, [200, 100], [200, 70]);
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors[0].right[1])
      .toBeLessThan(99);
    const after = await mustTable(page, FX.quad);
    const [s, e] = after.anchors;
    const mid = evalCubic(s.anchor, s.right, e.left, e.anchor, 0.5);
    expect(Math.hypot(mid[0] - 200, mid[1] - 70)).toBeLessThan(0.25);
    // Only the segment's two INNER handles changed.
    expect(s.anchor).toEqual([100, 100]);
    expect(s.left).toEqual([100, 100]);
    expect(e.anchor).toEqual([300, 100]);
    expect(e.right).toEqual([300, 100]);
    expectUntouched(after, before, [2, 3]);
    // A segment drag selects nothing.
    expect(await selectedAnchors(page)).toEqual([]);
    await expectOneUndoRestores(page, FX.quad, before);
  });

  test("AC-PATHEDIT-5 — a marquee selects two anchors and one drag moves both, in one step @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:editor-tools.select.click-marquee @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.quad);
    await enterPathEdit(page, FX.quad);

    // A press on NOTHING, dragged over the right-hand edge's two ends.
    await drag(page, [280, 80], [320, 320], {
      beforeRelease: async () => {
        await expect(page.locator("[data-path-marquee]")).toHaveCount(1);
      },
    });
    await expect.poll(() => selectedAnchors(page)).toEqual([1, 2]);
    await expect(page.locator("[data-path-marquee]")).toHaveCount(0);
    // An ANCHOR marquee: the element selection did not change, and the
    // mode is still on.
    expect(await selection(page)).toEqual([FX.quad]);
    expect(await mustTable(page, FX.quad)).toEqual(before);

    // Press one of the two, drag: the whole selection travels.
    await drag(page, [300, 100], [320, 90]);
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors[2].anchor[0])
      .toBeGreaterThan(319);
    const after = await mustTable(page, FX.quad);
    expectPoint(after.anchors[1].anchor, [320, 90], "anchor 1");
    expectPoint(after.anchors[2].anchor, [320, 290], "anchor 2");
    expectUntouched(after, before, [0, 3]);
    expect(await selectedAnchors(page)).toEqual([1, 2]);

    await expectOneUndoRestores(page, FX.quad, before);
  });

  test("AC-PATHEDIT-6 — Shift constrains the drag to 45° steps from where it began @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.quad);
    await enterPathEdit(page, FX.quad);
    // 40 across and 3 down: Shift holds it on the horizontal.
    await drag(page, [100, 100], [140, 103], { hold: "Shift" });
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors[0].anchor[0])
      .toBeGreaterThan(139);
    const after = await mustTable(page, FX.quad);
    near(after.anchors[0].anchor[1], 100);
    near(after.anchors[0].anchor[0], 100 + Math.hypot(40, 3));
    expectUntouched(after, before, [1, 2, 3]);
    await expectOneUndoRestores(page, FX.quad, before);
  });

  test("AC-PATHEDIT-7 — arrow keys nudge the selected anchor, not the frame; each press is its own undo step @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:editor-shell.keyboard-shortcuts @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.quad);
    await enterPathEdit(page, FX.quad);
    await click(page, [300, 100]);
    await expect.poll(() => selectedAnchors(page)).toEqual([1]);

    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors[1].anchor)
      .toEqual([301, 100]);
    await page.keyboard.press("Shift+ArrowUp");
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors[1].anchor)
      .toEqual([301, 90]);

    const after = await mustTable(page, FX.quad);
    expectUntouched(after, before, [0, 2, 3]);
    // The ANCHOR moved. `paged.object.nudge*` (the same keys, one layer
    // out) yielded: the element's own transform is what it was.
    expect(after.itemTransform).toEqual(before.itemTransform);

    // Two plans, two steps: one undo takes back only the Shift+Up.
    await undo(page);
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors[1].anchor)
      .toEqual([301, 100]);
    await expectOneUndoRestores(page, FX.quad, before);
  });

  test("AC-PATHEDIT-8 — Delete removes the selected anchors in one step, and refuses to starve a contour @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:geometry-coordinates.path-topology-ops @feat:editor-shell.panels.problems @feat:round-tripping.undo-redo @level:edge", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.quad);
    await enterPathEdit(page, FX.quad);
    await drag(page, [280, 80], [320, 320]);
    await expect.poll(() => selectedAnchors(page)).toEqual([1, 2]);

    await page.keyboard.press("Delete");
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors.length)
      .toBe(2);
    const after = await mustTable(page, FX.quad);
    // The survivors are anchors 0 and 3, untouched; the FRAME survived
    // (`paged.object.delete` has the same key and yielded it).
    expect(after.anchors).toEqual([before.anchors[0], before.anchors[3]]);
    await expect.poll(() => selectedAnchors(page)).toEqual([]);
    await expectOneUndoRestores(page, FX.quad, before);

    // The same two again, plus one more by Shift-click: removing three
    // of a contour's four anchors would leave it with one.
    await drag(page, [280, 80], [320, 320]);
    await expect.poll(() => selectedAnchors(page)).toEqual([1, 2]);
    const s = await screenPoint(page, 100, 100);
    await page.keyboard.down("Shift");
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect.poll(() => selectedAnchors(page)).toEqual([0, 1, 2]);
    await page.keyboard.press("Backspace");

    await openPanel(page, "paged.problems");
    const problem = page.locator(
      '[data-problem][data-problem-bundle="paged.pathEdit"]',
    );
    await expect(problem).toHaveCount(1);
    await expect(problem.locator("[data-problem-message]")).toContainText(
      "keeps at least two anchors",
    );
    // Nothing was removed, and nothing was sent.
    expect(await mustTable(page, FX.quad)).toEqual(before);
    expect(await selectedAnchors(page)).toEqual([0, 1, 2]);
  });

  test("AC-PATHEDIT-9 — Escape mid-drag cancels with nothing sent, and the mode stays on @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:editor-tools.gesture-lifecycle @level:edge", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.quad);
    await enterPathEdit(page, FX.quad);
    await drag(page, [300, 300], [340, 340], {
      beforeRelease: async () => {
        await page.keyboard.press("Escape");
      },
    });
    // The dot is back on its corner and the document was never touched.
    const home = await screenPoint(page, 300, 300);
    await expect
      .poll(async () => {
        const box = await page
          .locator('[data-path-anchor="2:anchor"]')
          .boundingBox();
        if (!box) return Infinity;
        return Math.hypot(
          box.x + box.width / 2 - home.x,
          box.y + box.height / 2 - home.y,
        );
      })
      .toBeLessThan(1.5);
    expect(await mustTable(page, FX.quad)).toEqual(before);
    await expect(page.locator("[data-path-edit]")).toHaveCount(1);
    // An idle Escape is the mode's own: it leaves.
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-path-edit]")).toHaveCount(0);
  });

  test("AC-PATHEDIT-10 — the clicks the overlay always had still work: double-click converts, a segment click inserts @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:geometry-coordinates.path-topology-ops @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.quad);
    await enterPathEdit(page, FX.quad);

    // Double-click a corner → smooth: its handles leave the anchor.
    await click(page, [300, 300]);
    await click(page, [300, 300]);
    await expect
      .poll(async () => {
        const a = (await mustTable(page, FX.quad)).anchors[2];
        return Math.hypot(a.right[0] - a.anchor[0], a.right[1] - a.anchor[1]);
      })
      .toBeGreaterThan(5);
    const converted = await mustTable(page, FX.quad);
    expect(converted.anchors[2].anchor).toEqual([300, 300]);
    expectUntouched(converted, before, [0, 1, 3]);
    // The double-click was the anchor's — it did not also enter an
    // edit context for the polygon underneath it.
    await expect(page.locator("[data-path-edit]")).toHaveCount(1);
    await expectOneUndoRestores(page, FX.quad, before);

    // A click on the bottom edge (300,300)→(100,300) inserts there.
    await click(page, [200, 300]);
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors.length)
      .toBe(5);
    const grown = await mustTable(page, FX.quad);
    expectPoint(grown.anchors[3].anchor, [200, 300], "inserted anchor");
    expect(grown.anchors[4]).toEqual(before.anchors[3]);
    expectUntouched(grown, before, [0, 1]);
    await expect(page.locator('[data-path-anchor$=":anchor"]')).toHaveCount(5);
    await expectOneUndoRestores(page, FX.quad, before);
  });

  test("AC-PATHEDIT-13 — the grab size and the click slop are screen distances: both follow the zoom @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:editor-tools.nav.zoom @feat:round-tripping.undo-redo @level:edge", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.quad);
    await enterPathEdit(page, FX.quad);
    // One drag at the fitted zoom first, so the session is tuned to it.
    await drag(page, [300, 300], [330, 290]);
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors[2].anchor[0])
      .toBeGreaterThan(329);
    await expectOneUndoRestores(page, FX.quad, before);
    const fitted = await cameraScale(page);
    // The numbers below need the fitted page to show a point as less
    // than a pixel and a third; a 1600 × 1000 viewport gives ~0.79.
    expect(fitted).toBeLessThan(1.3);

    await zoomInTo(page, 2);

    // GRAB SIZE. 4 pt off the corner, diagonally: at the fitted zoom
    // that is ~3 px — inside the dot's 5.5 px half-side, a press ON the
    // anchor. Zoomed in it is > 8 px away: a press on nothing. So this
    // little drag is a marquee that encloses no anchor, and the click
    // that selected the corner a moment ago is undone by it.
    await click(page, [300, 300]);
    await expect.poll(() => selectedAnchors(page)).toEqual([2]);
    await drag(page, [304, 304], [306, 307]);
    await expect.poll(() => selectedAnchors(page)).toEqual([]);
    expect(await mustTable(page, FX.quad)).toEqual(before);

    // CLICK SLOP. 2 pt of travel: under 2 px at the fitted zoom — a
    // click, nothing moves. Zoomed in it is > 4 px: a drag.
    await drag(page, [300, 300], [302, 300]);
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors[2].anchor[0])
      .toBeGreaterThan(301.5);
    const after = await mustTable(page, FX.quad);
    expectPoint(after.anchors[2].anchor, [302, 300], "anchor 2");
    expectUntouched(after, before, [0, 1, 3]);
    await expectOneUndoRestores(page, FX.quad, before);
  });
});

test.describe("E2E path editing — a rotated path", () => {
  // The path's points live in the ELEMENT's space — here a frame turned
  // 30° about its origin and moved to (150, 400). The pointer, the
  // constraint, the nudge and the marquee are all measured on the PAGE;
  // what is written is the path's own coordinates. Inner (100, 0) shows
  // at page (236.60, 450).
  const [a, b, c, d, tx, ty] = FX.rotatedTransform;
  const toPage = (p: Pt): Pt => [
    a * p[0] + c * p[1] + tx,
    b * p[0] + d * p[1] + ty,
  ];
  /** A page-space delta, in the path's inner space (a pure rotation's
   *  inverse is its transpose). */
  const deltaToInner = (delta: Pt): Pt => [
    a * delta[0] + b * delta[1],
    c * delta[0] + d * delta[1],
  ];

  test.beforeEach(async ({ page }) => {
    await loadPathEditFixture(page);
  });

  test("AC-PATHEDIT-11 — the dots sit on the rotated outline, and a page-space drag is written in the path's own space @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:geometry-coordinates.path-topology-ops @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.rotated);
    expect(before.anchors.map((t) => t.anchor)).toEqual([
      [0, 0],
      [100, 0],
      [100, 60],
    ]);
    await enterPathEdit(page, FX.rotated);

    // Each dot is drawn where the item transform puts its anchor.
    for (const [i, inner] of [
      [0, [0, 0]],
      [1, [100, 0]],
      [2, [100, 60]],
    ] as [number, Pt][]) {
      const at = toPage(inner);
      const want = await screenPoint(page, at[0], at[1]);
      const box = await page
        .locator(`[data-path-anchor="${i}:anchor"]`)
        .boundingBox();
      expect(box, `dot ${i}`).not.toBeNull();
      expect(
        Math.hypot(
          box!.x + box!.width / 2 - want.x,
          box!.y + box!.height / 2 - want.y,
        ),
        `dot ${i} on its anchor`,
      ).toBeLessThan(1.5);
    }

    // 20 across and 10 up ON THE PAGE.
    const from = toPage([100, 0]);
    await drag(page, from, [from[0] + 20, from[1] - 10]);
    await expect
      .poll(async () => (await mustTable(page, FX.rotated)).anchors[1].anchor[0])
      .toBeGreaterThan(105);
    const after = await mustTable(page, FX.rotated);
    const moved = deltaToInner([20, -10]);
    expectPoint(
      after.anchors[1].anchor,
      [100 + moved[0], 0 + moved[1]],
      "anchor 1, inner space",
    );
    expectUntouched(after, before, [0, 2]);
    // A path edit moves points; the element's transform is untouched.
    expect(after.itemTransform).toEqual(before.itemTransform);
    await expectOneUndoRestores(page, FX.rotated, before);
  });

  test("AC-PATHEDIT-12 — on a rotated path Shift constrains along the SCREEN's axes, the arrows nudge on the page, and the marquee selects where anchors show @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:editor-tools.select.click-marquee @feat:editor-shell.keyboard-shortcuts @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.rotated);
    await enterPathEdit(page, FX.rotated);

    // Shift: 40 across and 3 down on the page → horizontal ON THE PAGE,
    // which is a diagonal in the path's own turned space.
    const from = toPage([100, 0]);
    await drag(page, from, [from[0] + 40, from[1] + 3], { hold: "Shift" });
    await expect
      .poll(async () => (await mustTable(page, FX.rotated)).anchors[1].anchor[0])
      .toBeGreaterThan(120);
    const constrained = deltaToInner([Math.hypot(40, 3), 0]);
    expectPoint(
      (await mustTable(page, FX.rotated)).anchors[1].anchor,
      [100 + constrained[0], constrained[1]],
      "Shift-constrained anchor, inner space",
    );
    await expectOneUndoRestores(page, FX.rotated, before);

    // A marquee round where anchor 2 SHOWS (page space), then a nudge:
    // one point to the right on the page.
    const shown = toPage([100, 60]);
    await drag(
      page,
      [shown[0] - 12, shown[1] + 14],
      [shown[0] + 14, shown[1] - 10],
    );
    await expect.poll(() => selectedAnchors(page)).toEqual([2]);
    await page.keyboard.press("ArrowRight");
    const step = deltaToInner([1, 0]);
    await expect
      .poll(async () => {
        const p = (await mustTable(page, FX.rotated)).anchors[2].anchor;
        return Math.hypot(p[0] - (100 + step[0]), p[1] - (60 + step[1]));
      })
      .toBeLessThan(1e-3);
    expectUntouched(await mustTable(page, FX.rotated), before, [0, 1]);

    // Delete it: an open contour of three keeps two.
    await page.keyboard.press("Delete");
    await expect
      .poll(async () => (await mustTable(page, FX.rotated)).anchors.length)
      .toBe(2);
    expect((await mustTable(page, FX.rotated)).anchors).toEqual([
      before.anchors[0],
      before.anchors[1],
    ]);
    // Delete, then the nudge: two steps back to the original.
    await undo(page);
    await expect
      .poll(async () => (await mustTable(page, FX.rotated)).anchors.length)
      .toBe(3);
    await expectOneUndoRestores(page, FX.rotated, before);
  });
});

test.describe("E2E path editing — the Direct Selection tool", () => {
  test.beforeEach(async ({ page }) => {
    await loadPathEditFixture(page);
  });

  test("AC-DIRECT-1 — a click on a path shows its anchors and edits them, with no Enter in between @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:editor-shell.tool-rail @feat:editor-tools.select.click-marquee @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.openA);
    await activateTool(page, "directSelect");
    await expect(page.locator("[data-path-edit]")).toHaveCount(0);

    // One click on the path: selected, and in path-edit mode.
    await click(page, [200, 650]);
    await expect.poll(() => selection(page)).toEqual([FX.openA]);
    await expect(
      page.locator(`[data-path-edit="polygon:${FX.openA.id}"]`),
    ).toHaveCount(1);
    await expect(page.locator('[data-path-anchor$=":anchor"]')).toHaveCount(3);

    // …and the very next drag moves a point.
    await drag(page, [200, 700], [200, 720]);
    await expect
      .poll(async () => (await mustTable(page, FX.openA)).anchors[1].anchor[1])
      .toBeGreaterThan(719);
    const after = await mustTable(page, FX.openA);
    expectPoint(after.anchors[1].anchor, [200, 720], "dragged anchor");
    expectUntouched(after, before, [0, 2]);
    await expectOneUndoRestores(page, FX.openA, before);
  });

  test("AC-DIRECT-2 — a click on a non-path element still selects it; another path takes the mode over; putting the tool down leaves it @feat:editor-tools.path.direct-edit @feat:plugin-draw.direct-selection @feat:editor-shell.tool-rail @feat:editor-tools.select.click-marquee @level:gesture", async ({
    page,
  }) => {
    await activateTool(page, "directSelect");
    await click(page, [200, 650]);
    await expect(page.locator("[data-path-edit]")).toHaveCount(1);

    // The ellipse has no anchor table: selected, nothing to edit.
    await click(page, [480, 110]);
    await expect.poll(() => selection(page)).toEqual([FX.oval]);
    await expect(page.locator("[data-path-edit]")).toHaveCount(0);

    // Straight from one path to another: the mode follows the click.
    await click(page, [200, 200]);
    await expect.poll(() => selection(page)).toEqual([FX.quad]);
    await expect(
      page.locator(`[data-path-edit="polygon:${FX.quad.id}"]`),
    ).toHaveCount(1);
    await click(page, [450, 250]);
    await expect.poll(() => selection(page)).toEqual([FX.arch]);
    await expect(
      page.locator(`[data-path-edit="polygon:${FX.arch.id}"]`),
    ).toHaveCount(1);

    // Empty paper: deselected.
    await click(page, [580, 400]);
    await expect.poll(() => selection(page)).toEqual([]);
    await expect(page.locator("[data-path-edit]")).toHaveCount(0);

    // Back on a path, then the Selection tool: the path stays selected
    // and the anchors go — Selection needs its Enter.
    await click(page, [200, 200]);
    await expect(page.locator("[data-path-edit]")).toHaveCount(1);
    await activateTool(page, "select");
    await expect(page.locator("[data-path-edit]")).toHaveCount(0);
    expect(await selection(page)).toEqual([FX.quad]);
    // Holding Cmd spring-loads Direct Selection over every Cmd chord.
    // That is modifier posture, not the tool being picked: no anchors.
    await page.keyboard.down("Meta");
    await expect(
      page.locator('[data-tool-slot="directSelect"][data-active="true"]'),
    ).toBeVisible();
    await expect(page.locator("[data-path-edit]")).toHaveCount(0);
    await page.keyboard.up("Meta");

    // And picking Direct Selection up again, with the path still
    // selected, shows them without a click.
    await activateTool(page, "directSelect");
    await expect(
      page.locator(`[data-path-edit="polygon:${FX.quad.id}"]`),
    ).toHaveCount(1);

    // Escape puts the anchors away for THIS selection — and they stay
    // away, although the tool would otherwise bring them straight back.
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-path-edit]")).toHaveCount(0);
    await page.waitForTimeout(250);
    await expect(page.locator("[data-path-edit]")).toHaveCount(0);
    expect(await selection(page)).toEqual([FX.quad]);
    // Clicking the path again is asking again.
    await click(page, [200, 200]);
    await expect(
      page.locator(`[data-path-edit="polygon:${FX.quad.id}"]`),
    ).toHaveCount(1);
  });
});

test.describe("E2E path editing — the Pen on existing paths", () => {
  test.beforeEach(async ({ page }) => {
    await loadPathEditFixture(page);
    await snapOff(page);
    await activateTool(page, "pen");
  });

  test("AC-PENX-1 — pressing an open path's endpoint continues it: ONE element, more anchors, one undo @feat:editor-tools.draw.pen @feat:plugin-draw.pen-machine @feat:plugin-draw.pen-existing-paths @feat:geometry-coordinates.path-topology-ops @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.openA);
    const elements = await elementKeys(page);

    await penClick(page, [300, 600]); // upa's END
    await penClick(page, [340, 560]);
    await penClick(page, [330, 520]);
    await page.keyboard.press("Enter");

    await expect
      .poll(async () => (await mustTable(page, FX.openA)).anchors.length)
      .toBe(5);
    const after = await mustTable(page, FX.openA);
    expectPoint(after.anchors[3].anchor, [340, 560], "first added anchor");
    expectPoint(after.anchors[4].anchor, [330, 520], "second added anchor");
    // The path's own three anchors are untouched and it is still ONE
    // open contour — nothing was created beside it.
    expectUntouched(after, before, [0, 1, 2]);
    expect(after.subpathOpen).toEqual([true]);
    expect(await elementKeys(page)).toEqual(elements);
    // The continued path is the selection.
    await expect.poll(() => selection(page)).toEqual([FX.openA]);

    await expectOneUndoRestores(page, FX.openA, before);
  });

  test("AC-PENX-2 — ending on the path's own other endpoint closes it; one undo reopens it @feat:editor-tools.draw.pen @feat:plugin-draw.pen-machine @feat:plugin-draw.pen-existing-paths @feat:frames-paths.path.close @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.openA);
    const elements = await elementKeys(page);

    await penClick(page, [300, 600]); // END
    await penClick(page, [200, 560]);
    await penClick(page, [100, 600]); // its own START

    await expect
      .poll(async () => (await mustTable(page, FX.openA)).subpathOpen)
      .toEqual([false]);
    const after = await mustTable(page, FX.openA);
    // The inserts AND the close: four anchors, no fifth on the start.
    expect(after.anchors).toHaveLength(4);
    expectPoint(after.anchors[3].anchor, [200, 560], "added anchor");
    expectUntouched(after, before, [0, 1, 2]);
    expect(await elementKeys(page)).toEqual(elements);

    await expectOneUndoRestores(page, FX.openA, before);
  });

  test("AC-PENX-3 — ending on ANOTHER open path's endpoint joins the two into one element; one undo brings both back @feat:editor-tools.draw.pen @feat:plugin-draw.pen-machine @feat:plugin-draw.pen-existing-paths @feat:frames-paths.path.join @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const beforeA = await mustTable(page, FX.openA);
    const beforeB = await mustTable(page, FX.openB);
    const elements = await elementKeys(page);
    const keyB = `${FX.openB.kind}:${FX.openB.id}`;
    expect(elements).toContain(keyB);

    await penClick(page, [300, 600]); // upa's END
    await penClick(page, [340, 580]);
    await penClick(page, [380, 620]); // upb's START

    await expect.poll(() => elementKeys(page)).not.toContain(keyB);
    // ONE element now carries both paths and the bridge between them:
    // A's three, the anchor drawn, then B's two — B's start exactly
    // where it was, not a twin beside it.
    const joined = await mustTable(page, FX.openA);
    expect(joined.anchors).toHaveLength(6);
    expectUntouched(joined, beforeA, [0, 1, 2]);
    expectPoint(joined.anchors[3].anchor, [340, 580], "bridge anchor");
    expect(joined.anchors[4].anchor).toEqual([380, 620]);
    expect(joined.anchors[5].anchor).toEqual([520, 700]);
    expect(joined.subpathOpen).toEqual([true]);
    expect(await elementKeys(page)).toEqual(
      elements.filter((k) => k !== keyB),
    );
    expect(await tableOf(page, FX.openB)).toBeNull();

    // ONE undo: both elements, both tables.
    await undo(page);
    await expect.poll(() => tableOf(page, FX.openB)).toEqual(beforeB);
    expect(await mustTable(page, FX.openA)).toEqual(beforeA);
    expect(await elementKeys(page)).toEqual(elements);
  });

  test("AC-PENX-4 — on the SELECTED path a segment click adds an anchor and an anchor click deletes one; elsewhere the Pen still draws a new path @feat:editor-tools.draw.pen @feat:plugin-draw.pen-machine @feat:plugin-draw.pen-existing-paths @feat:geometry-coordinates.path-topology-ops @feat:frames-paths.path.insert @feat:round-tripping.undo-redo @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.quad);
    const elements = await elementKeys(page);
    // Select the square (the Pen follows the selection on the wire).
    await page.evaluate(async (id) => {
      const g = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      const ids = await g.client.setElementSelection([id], "replace");
      g.setElementSelection(ids);
    }, FX.quad as ElementRef);
    await expect.poll(() => selection(page)).toEqual([FX.quad]);

    // The top edge's midpoint → one more anchor, the shape unchanged.
    await penClick(page, [200, 100]);
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors.length)
      .toBe(5);
    const grown = await mustTable(page, FX.quad);
    expectPoint(grown.anchors[1].anchor, [200, 100], "added anchor");
    expect(await elementKeys(page)).toEqual(elements);

    // That anchor again → gone.
    await penClick(page, [200, 100]);
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors.length)
      .toBe(4);
    expect((await mustTable(page, FX.quad)).anchors.map((t) => t.anchor)).toEqual(
      before.anchors.map((t) => t.anchor),
    );

    // Each was its own step.
    await undo(page);
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors.length)
      .toBe(5);
    await expectOneUndoRestores(page, FX.quad, before);

    // Away from every path the Pen is the plain pen: a NEW element.
    await penClick(page, [420, 420]);
    await penClick(page, [520, 420]);
    await penClick(page, [470, 500]);
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await elementKeys(page)).length).toBe(
      elements.length + 1,
    );
    expect(await mustTable(page, FX.quad)).toEqual(before);
    await undo(page);
    await expect.poll(() => elementKeys(page)).toEqual(elements);
  });
});

// SNAPPING (RFI C-68) — the host half of draw-geometry's `snapPoint`. The
// tolerance is 6 SCREEN px, so every offset below is a fraction of a
// point at the fitted zoom: inside it, and still a visible miss without
// snapping. Cmd turns it off for the gesture's samples.
test.describe("E2E path editing — snapping", () => {
  test.beforeEach(async ({ page }) => {
    await loadPathEditFixture(page);
  });

  test("AC-SNAP-1 — a dragged anchor lands on another anchor's alignment line; Cmd lets it miss @feat:editor-tools.path.direct-edit @level:gesture", async ({
    page,
  }) => {
    const before = await mustTable(page, FX.quad);
    await enterPathEdit(page, FX.quad);
    // Anchor 0 (100,100) dragged to just above the bottom edge's y = 300
    // (anchors 2 and 3): it lands ON the line, and x is the pointer's.
    await drag(page, [100, 100], [150, 299.4]);
    await expect.poll(async () => (await mustTable(page, FX.quad)).anchors[0].anchor[1]).toBe(300);
    const snapped = await mustTable(page, FX.quad);
    expect(Math.abs(snapped.anchors[0].anchor[0] - 150)).toBeLessThan(0.75);
    expectUntouched(snapped, before, [1, 2, 3]);
    await expectOneUndoRestores(page, FX.quad, before);

    // The same drag with Cmd held from the press: no snap.
    await enterPathEdit(page, FX.quad);
    await page.keyboard.down("Meta");
    await drag(page, [100, 100], [150, 299.4]);
    await page.keyboard.up("Meta");
    await expect
      .poll(async () => (await mustTable(page, FX.quad)).anchors[0].anchor[1])
      .not.toBe(100);
    expect((await mustTable(page, FX.quad)).anchors[0].anchor[1]).not.toBe(300);
  });

  test("AC-SNAP-2 — the Pen places on the page edge and on its own anchor's line @feat:editor-tools.draw.pen @feat:plugin-draw.pen-machine @level:gesture", async ({
    page,
  }) => {
    await activateTool(page, "pen");
    const elements = await elementKeys(page);
    // 0.4 pt in from the page's left edge, then level with the first
    // anchor give or take 0.4 pt — both well inside 6 px.
    await penClick(page, [0.4, 480]);
    await penClick(page, [250, 480.4]);
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await elementKeys(page)).length).toBe(elements.length + 1);
    const added = (await elementKeys(page)).find((k) => !elements.includes(k))!;
    const [kind, id] = added.split(":");
    const table = await mustTable(page, { kind, id });
    expect(table.anchors).toHaveLength(2);
    expect(table.anchors[0].anchor[0]).toBe(0);
    expect(table.anchors[1].anchor[1]).toBe(table.anchors[0].anchor[1]);
  });
});
