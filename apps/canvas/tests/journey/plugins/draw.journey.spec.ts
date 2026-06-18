// Journey: the paged.draw plugin — authoring + refining a vector path.
//
// A designer drives the built-in Pen to author a path, then refines it
// with the paged.draw BUNDLE's anchor-editing companions (Add / Delete /
// Convert), and finally stacks a stroke through the bundle's Appearance
// command — exactly the W2.5 division of labor: the host's Pen authors,
// the plugin edits. This proves the bundle's contributions drive through
// the real editor host (loadBundle → contributeTool → host facades →
// Mutation), end to end, the way the e2e draw-plugin spec proves them in
// the fixture viewport — here on a blank File ▸ New document.
//
// Per-step COLLECT-FAILURES: each refinement records its outcome rather
// than aborting, so one run reveals which contributions drove. The pen
// author + at least the add/delete/convert anchor edits are expected to
// drive (the e2e proves them green); the stroke is best-effort.

import { expect, test } from "@playwright/test";

import { screenPoint, treeCount, treeIds } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

type ElementRef = { kind: string; id: string };

interface PathAnchorsResult {
  pageId: string;
  anchors: Array<{
    anchor: [number, number];
    left: [number, number];
    right: [number, number];
  }>;
  subpathStarts: number[];
  subpathOpen?: boolean[];
}

/** The path's anchor model, read through the worker client (the same
 *  query the bundle's anchor planners hit). */
async function pathAnchorsOf(
  page: import("@playwright/test").Page,
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

async function anchorCount(
  page: import("@playwright/test").Page,
  ref: ElementRef,
): Promise<number> {
  return (await pathAnchorsOf(page, ref))?.anchors.length ?? 0;
}

/** Click (down+up, no travel) at absolute screen coords — the pointer
 *  gesture the pen + anchor tools consume (mirrors draw-plugin.spec). */
async function clickAt(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.up();
  await page.waitForTimeout(30);
}

/** Read back a frame/path's baked stroke weight (pt) via the inspector
 *  property query — 0 when it carries no stroke. */
async function strokeWeightOf(
  page: import("@playwright/test").Page,
  ref: ElementRef,
): Promise<number> {
  return page.evaluate(async (r) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementProperties: (id: unknown) => Promise<{
              entries?: Array<{ path: string; value?: { type: string; value?: number } | null }>;
            } | null>;
          };
        };
      }
    ).__canvas;
    const props = await c.client.elementProperties(r).catch(() => null);
    for (const e of props?.entries ?? []) {
      if (e.path === "frameStrokeWeight" && e.value?.type === "length") {
        return e.value.value ?? 0;
      }
    }
    return 0;
  }, ref);
}

/** Invoke a command through the real registry (the stable surface a
 *  shortcut/menu hits). */
async function invokeCommand(
  page: import("@playwright/test").Page,
  id: string,
): Promise<void> {
  await page.evaluate((cmdId) => {
    const cmd = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: {
              invoke?: (id: string) => Promise<void>;
              execute?: (id: string) => Promise<void>;
              run?: (id: string) => Promise<void>;
            };
          };
        };
      }
    ).__canvas.registries.commands;
    const fn = cmd.invoke ?? cmd.execute ?? cmd.run;
    return fn?.call(cmd, cmdId);
  }, id);
}

test.describe("journey · paged.draw plugin", () => {
  test("a designer authors a path with the Pen, then refines its anchors and stroke with the paged.draw bundle @feat:plugin-draw.anchor-add @feat:plugin-draw.anchor-delete @feat:plugin-draw.anchor-convert @feat:plugin-platform.bundle-lifecycle @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const failures: string[] = [];

    // ── 1. AUTHOR — drive the built-in Pen: three clicks lay corner
    //    anchors, Enter commits one open path (the host authors). Map
    //    page-0-local pt to screen px through the live camera. ──
    const before = await treeCount(page, "polygon");
    await invokeCommand(page, "paged.tool.activate.paged.tool.pen");
    const o = await screenPoint(page, 180, 220);
    await clickAt(page, o.x, o.y);
    const p1 = await screenPoint(page, 320, 220);
    await clickAt(page, p1.x, p1.y);
    const p2 = await screenPoint(page, 250, 320);
    await clickAt(page, p2.x, p2.y);
    await page.keyboard.press("Enter");

    await expect
      .poll(() => treeCount(page, "polygon"), { timeout: 6_000 })
      .toBe(before + 1);

    // The newly authored path is the single selection the anchor tools
    // act on; address it by the fresh polygon id.
    const after = await treeIds(page, "polygon");
    const id = after.find((p) => p.id)?.id ?? "";
    const ref: ElementRef = { kind: "polygon", id };
    expect(id, "the Pen authored a polygon").not.toBe("");

    let snap = await pathAnchorsOf(page, ref);
    expect(snap?.anchors, "the authored path has 3 anchors").toHaveLength(3);
    expect(snap?.subpathOpen?.[0] ?? false, "Pen committed an open path").toBe(true);

    // Re-fit so the live camera is settled for the refinement clicks.
    await page.keyboard.press("Home");
    await page.waitForTimeout(400);

    // ── 2. ADD ANCHOR — `=` arms the bundle's Add tool; clicking the
    //    midpoint of the first (straight) segment splits it 3 → 4. ──
    await page.keyboard.press("=");
    const mid = await screenPoint(page, 250, 220);
    await clickAt(page, mid.x, mid.y);
    try {
      await expect
        .poll(() => anchorCount(page, ref), { timeout: 6_000 })
        .toBe(4);
    } catch {
      failures.push(`add anchor: count stayed ${await anchorCount(page, ref)} (expected 4)`);
    }

    // ── 3. DELETE ANCHOR — `-` arms Delete; clicking the anchor we just
    //    added returns 4 → 3. ──
    await page.keyboard.press("-");
    await clickAt(page, mid.x, mid.y);
    try {
      await expect
        .poll(() => anchorCount(page, ref), { timeout: 6_000 })
        .toBe(3);
    } catch {
      failures.push(`delete anchor: count stayed ${await anchorCount(page, ref)} (expected 3)`);
    }

    // ── 4. CONVERT ANCHOR — `shift+c` arms Convert; clicking the MIDDLE
    //    vertex (both neighbours present, so the smooth derivation
    //    applies) pulls out an out-handle (corner → smooth). ──
    const beforeConvert = await pathAnchorsOf(page, ref);
    const midVertex = beforeConvert?.anchors[1];
    await page.keyboard.press("Shift+C");
    const v = await screenPoint(page, 320, 220);
    await clickAt(page, v.x, v.y);
    try {
      await expect
        .poll(
          async () => {
            const s = await pathAnchorsOf(page, ref);
            const a = s?.anchors[1];
            if (!a) return 0;
            return Math.hypot(a.right[0] - a.anchor[0], a.right[1] - a.anchor[1]);
          },
          { timeout: 6_000 },
        )
        .toBeGreaterThan(0.5);
    } catch {
      const a = (await pathAnchorsOf(page, ref))?.anchors[1];
      const handle = a
        ? Math.hypot(a.right[0] - a.anchor[0], a.right[1] - a.anchor[1])
        : -1;
      failures.push(
        `convert anchor: out-handle |${handle.toFixed(3)}| not > 0.5 (was corner ${
          midVertex ? "with collapsed handles" : "?"
        })`,
      );
    }

    // ── 5. STROKE (best-effort) — the bundle's Appearance command stacks
    //    a stroke layer and BAKES the front-most layer onto the frame's
    //    real frameStrokeWeight; assert the baked weight became positive. ──
    await invokeCommand(page, "media.paged.draw.command.appearanceAddStroke");
    try {
      await expect
        .poll(() => strokeWeightOf(page, ref), { timeout: 6_000 })
        .toBeGreaterThan(0);
    } catch {
      failures.push(
        `stroke: baked frameStrokeWeight stayed ${await strokeWeightOf(page, ref)} (expected > 0)`,
      );
    }

    // One run, all the bundle contributions reported. The pen author and
    // the 3-anchor commit above are HARD assertions (they gate the test);
    // the per-step refinements collect so a partial drive is visible.
    expect(failures, `paged.draw refinement steps that did not drive: ${failures.join("; ")}`).toEqual([]);
  });
});
