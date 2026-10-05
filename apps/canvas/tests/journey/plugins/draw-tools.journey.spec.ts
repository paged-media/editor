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

// Journey: paged.draw PRO TOOLS — Pencil / Curvature (authoring) +
// Gradient Annotator (steering) + Measure (read-only), the gesture half
// of the pro-path-toolset.
//
// These are host-agnostic machines wrapped by thin gesture shims: the
// Pencil + Curvature commit ONE insertPath (a new path that RENDERS); the
// Gradient Annotator drag re-aims a gradient-filled selection's axis
// (frameGradientFillAngle / frameGradientFillLength); Measure is
// READ-ONLY (publishes a binding, no mutation). Each tool is activated
// through the real activation command (paged.tool.activate.<id>) and
// driven with real pointer input. Per-tool COLLECT-FAILURES: the Pencil
// author is the HARD gate (it proves the gesture spine reaches the
// bundle's machines); the rest collect so a partial drive is visible.
//
// The second test is the CUTTING pair in the rail's Scissors flyout,
// both HARD-gated on the path model read back after the gesture:
//   · Knife — a freehand drag across a closed filled rectangle splits it
//     into two closed pieces along the cut: the rectangle keeps its id
//     and becomes the left piece, the right piece is a NEW path, and one
//     undo puts the uncut rectangle back (the strip probe the knife
//     measures with must not leak into the history).
//   · Scissors (any point) — a click MID-SEGMENT of an open path (not on
//     an anchor, which is all the host's own Scissors can cut at) inserts
//     an anchor there and opens the path at it: one path, two open
//     subpaths meeting at the click; one undo restores the single run.

import { expect, test } from "@playwright/test";

import { dragMouse, screenPoint, treeIds } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

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

async function propOf(
  page: import("@playwright/test").Page,
  ref: { kind: string; id: string },
  path: string,
): Promise<{ type: string; value?: unknown } | null> {
  return page.evaluate(
    async ({ r, p }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              elementProperties: (id: unknown) => Promise<{
                entries?: Array<{
                  path: string;
                  value?: { type: string; value?: unknown } | null;
                }>;
              } | null>;
            };
          };
        }
      ).__canvas;
      const props = await c.client.elementProperties(r).catch(() => null);
      for (const e of props?.entries ?? []) {
        if (e.path === p) return e.value ?? null;
      }
      return null;
    },
    { r: ref, p: path },
  );
}

interface PathAnchorsResult {
  anchors: Array<{ anchor: [number, number] }>;
  subpathStarts: number[];
  subpathOpen?: boolean[];
}

/** The path model (anchors + contours), read through the worker client —
 *  the same query the bundle's cut planners resolve against. */
async function pathAnchorsOf(
  page: import("@playwright/test").Page,
  ref: { kind: string; id: string },
): Promise<PathAnchorsResult | null> {
  return page.evaluate(async (r) => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { pathAnchors: (id: unknown) => Promise<PathAnchorsResult | null> } };
      }
    ).__canvas;
    return c.client.pathAnchors(r).catch(() => null);
  }, ref);
}

/** `[left, right]` of an element's page box. Through `elementGeometry`,
 *  not the anchors: a freshly drawn rectangle has no explicit anchor
 *  table until something rewrites its path, but it always has a box. */
async function xExtentOf(
  page: import("@playwright/test").Page,
  ref: { kind: string; id: string },
): Promise<[number, number] | null> {
  return page.evaluate(async (r) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementGeometry: (
              ids: unknown[],
            ) => Promise<Array<{ bounds: [number, number, number, number] }>>;
          };
        };
      }
    ).__canvas;
    const g = await c.client.elementGeometry([r]).catch(() => []);
    return g[0] ? [g[0].bounds[1], g[0].bounds[3]] : null;
  }, ref);
}

/** Freehand drag across several screen points (down → moves → up). */
async function freehand(
  page: import("@playwright/test").Page,
  pts: Array<{ x: number; y: number }>,
): Promise<void> {
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  await page.waitForTimeout(20);
  for (const p of pts.slice(1)) {
    await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(60);
}

test.describe("journey · paged.draw pro tools", () => {
  test("a designer authors with the Pencil + Curvature, steers a gradient, and measures @feat:plugin-draw.pro-path-toolset @feat:plugin-platform.bundle-lifecycle @feat:plugin-platform.tool-registration @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const collected: string[] = [];

    // ── 1. PENCIL (HARD) — freehand a stroke; the machine RDP-simplifies
    //    + fits the samples and commits ONE insertPath → a new path. ──
    const before = await designer.renderBytes();
    const polysBefore = await designer.count("polygon");
    await invokeCommand(page, "paged.tool.activate.media.paged.draw.tool.pencil");
    const arc: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = 180 + t * 240;
      const y = 300 - Math.sin(t * Math.PI) * 90;
      arc.push(await screenPoint(page, x, y));
    }
    await freehand(page, arc);
    await expect
      .poll(() => designer.count("polygon"), { timeout: 8_000 })
      .toBeGreaterThan(polysBefore);
    // The freehand path renders (it carries the document's default paint).
    await designer.expectRenderChangesFrom(before);

    // ── 2. CURVATURE (collect) — clicks lay through-points; Enter
    //    commits one smooth path. ──
    try {
      const polysB = await designer.count("polygon");
      await invokeCommand(
        page,
        "paged.tool.activate.media.paged.draw.tool.curvature",
      );
      for (const [x, y] of [
        [200, 430],
        [300, 380],
        [400, 430],
        [500, 380],
      ] as const) {
        const s = await screenPoint(page, x, y);
        await page.mouse.move(s.x, s.y);
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(30);
      }
      await page.keyboard.press("Enter");
      await expect
        .poll(() => designer.count("polygon"), { timeout: 6_000 })
        .toBeGreaterThan(polysB);
    } catch (err) {
      collected.push(`curvature: ${String(err).split("\n")[0]}`);
    }

    // ── 3. GRADIENT ANNOTATOR (collect) — a gradient-filled rect, then a
    //    drag on canvas re-aims the axis (frameGradientFillAngle /
    //    Length). Assert one of the two axis props became a number. ──
    try {
      const rid = await designer.drawRectangle({ x0: 160, y0: 520, x1: 420, y1: 660 });
      const rref = { kind: "rectangle", id: rid };
      await designer.selectElement("rectangle", rid);
      await invokeCommand(page, "media.paged.draw.command.fillGradientLinear");
      await expect
        .poll(async () => (await propOf(page, rref, "frameFillColor"))?.value ?? "", {
          timeout: 6_000,
        })
        .toEqual(expect.stringContaining("Gradient/"));

      await invokeCommand(
        page,
        "paged.tool.activate.media.paged.draw.tool.gradientAnnotator",
      );
      const gFrom = await screenPoint(page, 190, 590);
      const gTo = await screenPoint(page, 400, 640);
      await dragMouse(page, gFrom, gTo, { steps: 8, settleMs: 150 });
      await expect
        .poll(async () => {
          const a = await propOf(page, rref, "frameGradientFillAngle");
          const l = await propOf(page, rref, "frameGradientFillLength");
          const an = a?.type === "length" ? (a.value as number) : null;
          const ln = l?.type === "length" ? (l.value as number) : null;
          return (an != null && Number.isFinite(an)) || (ln != null && ln > 0);
        }, { timeout: 6_000 })
        .toBe(true);
    } catch (err) {
      collected.push(`gradient annotator: ${String(err).split("\n")[0]}`);
    }

    // ── 4. MEASURE (collect) — read-only: activate + drag. It commits no
    //    mutation (publishes a readout binding), so the assertion is that
    //    activating + dragging does not throw and authors nothing new. ──
    try {
      const polysB = await designer.count("polygon");
      await invokeCommand(
        page,
        "paged.tool.activate.media.paged.draw.tool.measure",
      );
      const mFrom = await screenPoint(page, 200, 200);
      const mTo = await screenPoint(page, 420, 280);
      await dragMouse(page, mFrom, mTo, { steps: 6, settleMs: 120 });
      await page.waitForTimeout(150);
      // Measure is read-only — it must NOT have authored a path.
      expect(
        await designer.count("polygon"),
        "measure is read-only — no path authored",
      ).toBe(polysB);
    } catch (err) {
      collected.push(`measure: ${String(err).split("\n")[0]}`);
    }

    // The Pencil author + its render are HARD assertions above (they gate
    // the test). The curvature/gradient/measure steps collect so a
    // partial drive is visible without masking the proven gesture spine.
    expect(
      collected,
      `paged.draw pro-tool steps that did not drive: ${collected.join("; ")}`,
    ).toEqual([]);
  });

  test("a designer cuts a closed shape with the Knife and opens a path mid-segment with Scissors (any point) @feat:plugin-draw.pro-path-toolset @feat:plugin-platform.tool-registration @feat:plugin-platform.planar-regions-door @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. KNIFE — drag a straight-ish freehand cut top → bottom through
    //    x = 250 across a 150..350 rectangle, overshooting both edges. ──
    const rid = await designer.drawRectangle({ x0: 150, y0: 200, x1: 350, y1: 360 });
    const rect = { kind: "rectangle", id: rid };
    await designer.applyFill("rectangle", rid, "Color/Black");
    await designer.selectElement("rectangle", rid);
    const before = await xExtentOf(page, rect);
    expect(before, "the rectangle has a readable box").not.toBeNull();
    expect(before![0]).toBeCloseTo(150, 0);
    expect(before![1]).toBeCloseTo(350, 0);
    const polysBefore = await treeIds(page, "polygon");

    await invokeCommand(page, "paged.tool.activate.media.paged.draw.tool.knife");
    const cut: Array<{ x: number; y: number }> = [];
    for (const y of [170, 220, 270, 320, 390]) cut.push(await screenPoint(page, 250, y));
    await freehand(page, cut);

    // The cut adds exactly ONE piece…
    await expect
      .poll(async () => (await treeIds(page, "polygon")).length, { timeout: 10_000 })
      .toBe(polysBefore.length + 1);
    // …the rectangle keeps its id and is now the LEFT piece (150..250)…
    await expect
      .poll(async () => JSON.stringify((await xExtentOf(page, rect))?.map(Math.round)), {
        timeout: 8_000,
      })
      .toBe(JSON.stringify([150, 250]));
    // …and the new path is the RIGHT piece (250..350), closed.
    const piece = (await treeIds(page, "polygon")).find(
      (p) => !polysBefore.some((b) => b.id === p.id),
    )!;
    const pieceX = await xExtentOf(page, piece);
    expect(pieceX?.map(Math.round), "the new piece is the right half").toEqual([250, 350]);
    const pieceModel = await pathAnchorsOf(page, piece);
    expect(pieceModel?.subpathOpen?.some(Boolean) ?? false, "the piece is closed").toBe(false);

    // ── 2. ONE UNDO — the whole cut is one step; the strip the knife
    //    probed with is not in the history. ──
    await designer.runCommand("paged.editor.undo");
    await expect
      .poll(async () => (await treeIds(page, "polygon")).length, { timeout: 8_000 })
      .toBe(polysBefore.length);
    await expect
      .poll(async () => JSON.stringify((await xExtentOf(page, rect))?.map(Math.round)), {
        timeout: 8_000,
      })
      .toBe(JSON.stringify([150, 350]));

    // ── 3. SCISSORS (ANY POINT) — click the MIDDLE of an open path's
    //    first segment, far from either anchor. ──
    const sid = await designer.drawPath([
      [400, 450],
      [550, 450],
      [550, 600],
    ]);
    const path = { kind: "polygon", id: sid };
    await designer.applyStroke("polygon", sid, "Color/Black", 3);
    await designer.selectElement("polygon", sid);
    const uncut = await pathAnchorsOf(page, path);
    expect(uncut?.anchors.length).toBe(3);
    expect(uncut?.subpathStarts).toEqual([0]);
    const polysBeforeCut = await designer.count("polygon");

    await invokeCommand(page, "paged.tool.activate.media.paged.draw.tool.scissorsAnyPoint");
    const click = await screenPoint(page, 475, 450);
    await page.mouse.click(click.x, click.y);

    // One path, now TWO open runs that meet at the click.
    await expect
      .poll(async () => JSON.stringify((await pathAnchorsOf(page, path))?.subpathStarts), {
        timeout: 8_000,
      })
      .toBe(JSON.stringify([0, 2]));
    const opened = (await pathAnchorsOf(page, path))!;
    expect(opened.subpathOpen, "both runs are open").toEqual([true, true]);
    expect(opened.anchors).toHaveLength(5);
    // The new end of run 1 and the new start of run 2 sit at the click.
    for (const i of [1, 2]) {
      expect(opened.anchors[i]!.anchor[0]).toBeCloseTo(475, 0);
      expect(opened.anchors[i]!.anchor[1]).toBeCloseTo(450, 0);
    }
    expect(await designer.count("polygon"), "scissors splits in place").toBe(polysBeforeCut);

    // ── 4. ONE UNDO — insert + open are one batch. ──
    await designer.runCommand("paged.editor.undo");
    await expect
      .poll(async () => JSON.stringify((await pathAnchorsOf(page, path))?.subpathStarts), {
        timeout: 8_000,
      })
      .toBe(JSON.stringify([0]));
    expect((await pathAnchorsOf(page, path))?.anchors).toHaveLength(3);
  });
});
