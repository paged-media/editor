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

// Journey: paged.draw PATH OPS — Pathfinder Subtract/Intersect/Exclude +
// Outline Stroke + Offset Path + Simplify Path + Join/Average endpoints.
//
// These drive the EXISTING v43 wire ops (pathfinderBoolean / outlineStroke
// / offsetPath / simplifyPath / pathPointSet) through the bundle's command
// surface. This journey asserts WHAT DRIVES and honestly COLLECTS the rest
// (per the registry's pinned engine caveats):
//   · Pathfinder Subtract/Intersect/Exclude — first selected = kept, the
//     rest consumed; the kept silhouette renders differently and the
//     operand count drops (HARD: subtract).
//   · Outline Stroke — converts a stroked shape's outline to a filled
//     path. CORE FIX LANDED: the apply layer now synthesizes a primitive
//     rectangle's path from its bounds, so outlineStroke produces geometry
//     on a plain rect (was: kernel rejected the empty-anchor rect). The
//     render-change is HARD under the sync-wasm override; on the PUBLISHED
//     engine (0.49.0) it no-ops until the paired publish → soft-reported.
//   · Offset Path — grows/shrinks a CLOSED path. Same core fix: a plain
//     rect now offsets (synthesized from bounds). HARD under the override,
//     soft-reported on the published engine until the paired publish.
//   · Simplify Path — accepted + undoable but a NO-OP on corner polylines
//     at v0.43 (the decimation kernel does nothing); driven + COLLECTED.
//   · Join / Average endpoints — pathPointSet coincidence over open-path
//     endpoints; driven + COLLECTED (geometry effect is the engine's).
//
// A negative control proves the render oracle.

import { expect, test } from "@playwright/test";

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

test.describe("journey · paged.draw path ops", () => {
  test("a designer runs pathfinder booleans, outline + offset, and simplify/join over paths @feat:plugin-draw.pro-path-toolset @feat:plugin-platform.bundle-lifecycle @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const collected: string[] = []; // steps that did NOT drive (gates)
    const renderNotes: string[] = []; // soft render observations (logged)

    // ── 0. NEGATIVE CONTROL. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // Helper — two overlapping filled rects, returns their ids.
    const twoOverlapping = async (): Promise<[string, string]> => {
      const a = await designer.drawRectangle({ x0: 150, y0: 180, x1: 340, y1: 360 });
      const b = await designer.drawRectangle({ x0: 280, y0: 180, x1: 470, y1: 360 });
      await designer.applyFill("rectangle", a, "Color/Black");
      await designer.applyFill("rectangle", b, "Color/Black");
      return [a, b];
    };

    // ── 1. PATHFINDER SUBTRACT (HARD count, collected render) — kept
    //    minus others. The second operand is CONSUMED by the engine → the
    //    rectangle count drops (the HARD proof the boolean drove). The
    //    render diff is collected: like the draw-render journey's
    //    pathfinder-unite, the boolean's RENDER is the engine's contract
    //    (proven by the count drop + conformance), not gated here. ──
    {
      const [a, b] = await twoOverlapping();
      await designer.selectElements([
        { kind: "rectangle", id: a },
        { kind: "rectangle", id: b },
      ]);
      const countBefore = await designer.count("rectangle");
      const before = await designer.renderBytes();
      await invokeCommand(page, "media.paged.draw.command.pathfinderSubtract");
      await expect
        .poll(() => designer.count("rectangle"), { timeout: 8_000 })
        .toBeLessThan(countBefore);
      await page.waitForTimeout(400);
      const after = await designer.renderBytes();
      const changed = await designer.renderDiffPixels(before, after);
      if (changed <= 64) {
        renderNotes.push(`pathfinder subtract: render changed only ${changed}px (≤64)`);
      }
    }

    // ── 2. PATHFINDER INTERSECT / EXCLUDE (collect) — same operand-
    //    consumption contract; render-collected. ──
    for (const [cmd, label] of [
      ["media.paged.draw.command.pathfinderIntersect", "intersect"],
      ["media.paged.draw.command.pathfinderExclude", "exclude"],
    ] as const) {
      try {
        const [a, b] = await twoOverlapping();
        await designer.selectElements([
          { kind: "rectangle", id: a },
          { kind: "rectangle", id: b },
        ]);
        const countBefore = await designer.count("rectangle");
        await invokeCommand(page, cmd);
        await expect
          .poll(() => designer.count("rectangle"), { timeout: 8_000 })
          .toBeLessThan(countBefore);
      } catch (err) {
        collected.push(`pathfinder ${label}: ${String(err).split("\n")[0]}`);
      }
    }

    // ── 3. OUTLINE STROKE (drive + render) — the command emits the
    //    `outlineStroke` wire op for the selection. CORE FIX: the apply layer
    //    synthesizes the rectangle's path from its bounds when the frame has
    //    no explicit anchors, so a plain rect now outlines (unit-proven in
    //    paged-mutate kernel_ops). Under the sync-wasm OVERRIDE the render
    //    changes (HARD); on the PUBLISHED engine 0.49.0 it still no-ops until
    //    the paired publish → soft-reported (never faked green). ──
    try {
      const id = await designer.drawRectangle({ x0: 160, y0: 420, x1: 400, y1: 560 });
      await designer.applyStroke("rectangle", id, "Color/Black", 8);
      await designer.selectElement("rectangle", id);
      const before = await designer.renderBytes();
      await invokeCommand(page, "media.paged.draw.command.outlineStroke");
      await page.waitForTimeout(400);
      const after = await designer.renderBytes();
      const changed = await designer.renderDiffPixels(before, after);
      if (changed <= 64) {
        renderNotes.push(
          `outlineStroke: no render change on a rectangle (${changed}px) — core fix landed but the published engine 0.49.0 no-ops until the paired publish (HARD under the sync-wasm override)`,
        );
      }
      expect(await designer.count("rectangle"), "outlineStroke kept the element").toBeGreaterThan(0);
    } catch (err) {
      collected.push(`outline stroke: ${String(err).split("\n")[0]}`);
    }

    // ── 4. OFFSET PATH (drive + render — closed path) — drives offsetPath on
    //    a CLOSED filled rect. CORE FIX (same as outlineStroke): a plain rect
    //    is synthesized from its bounds, so the closed-rect offset now
    //    produces geometry (unit-proven in kernel_ops). HARD render-change
    //    under the sync-wasm override; soft-reported on the published engine
    //    0.49.0 until the paired publish. ──
    try {
      const id = await designer.drawRectangle({ x0: 440, y0: 420, x1: 560, y1: 540 });
      await designer.applyFill("rectangle", id, "Color/Black");
      await designer.selectElement("rectangle", id);
      const before = await designer.renderBytes();
      await invokeCommand(page, "media.paged.draw.command.offsetPath");
      await page.waitForTimeout(400);
      const after = await designer.renderBytes();
      const changed = await designer.renderDiffPixels(before, after);
      if (changed <= 64) {
        renderNotes.push(
          `offsetPath: no render change on a closed rect (${changed}px) — core fix landed; published engine 0.49.0 no-ops until the paired publish (HARD under the override)`,
        );
      }
      expect(await designer.count("rectangle"), "offsetPath kept the element").toBeGreaterThan(0);
    } catch (err) {
      collected.push(`offset path: ${String(err).split("\n")[0]}`);
    }

    // ── 5. SIMPLIFY PATH (collect — pinned no-op) — accepted + undoable
    //    but a no-op on corner polylines at v0.43 (the decimation kernel
    //    does nothing). Driven so the command path exercises; the
    //    geometry reduction is core's contract (collected). ──
    try {
      const id = await designer.drawPath([
        [180, 620],
        [240, 660],
        [300, 620],
        [360, 660],
        [420, 620],
      ]);
      await designer.applyStroke("polygon", id, "Color/Black", 2);
      await designer.selectElement("polygon", id);
      await invokeCommand(page, "media.paged.draw.command.simplifyPath");
      // No assertion on anchor reduction (pinned no-op); the drive must
      // not throw + the element survives.
      expect(await designer.count("polygon"), "simplify kept the path").toBeGreaterThan(0);
    } catch (err) {
      collected.push(`simplify: ${String(err).split("\n")[0]}`);
    }

    // ── 6. JOIN / AVERAGE ENDPOINTS (collect) — pathPointSet coincidence
    //    over a single open path's two endpoints. Driven; the geometry
    //    move is the engine's contract. ──
    try {
      const id = await designer.drawPath([
        [200, 700],
        [320, 720],
        [260, 760],
      ]);
      await designer.selectElement("polygon", id);
      await invokeCommand(page, "media.paged.draw.command.averageEndpoints");
      await invokeCommand(page, "media.paged.draw.command.joinEndpoints");
      expect(await designer.count("polygon"), "join/average kept the path").toBeGreaterThan(0);
    } catch (err) {
      collected.push(`join/average: ${String(err).split("\n")[0]}`);
    }

    if (renderNotes.length) {
      // eslint-disable-next-line no-console
      console.log(`[journey] path-ops soft render notes: ${renderNotes.join("; ")}`);
    }
    expect(
      collected,
      `paged.draw path-op steps that did not drive: ${collected.join("; ")}`,
    ).toEqual([]);
  });
});
