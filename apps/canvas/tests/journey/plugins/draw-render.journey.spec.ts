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

// Journey: paged.draw RENDERED output — not just "the command applied",
// but "the pixels a designer sees actually changed".
//
// The sibling draw.journey.spec.ts proves the bundle's contributions DRIVE
// (anchor counts, baked weights, mutation outcomes). It never looks at the
// page. This one closes that gap: it drives the SAME real host path
// (loadBundle → command → host.document.mutate → native frameFillColor /
// frameStrokeWeight / pathfinderBoolean) and then reads the page back
// through the deterministic CPU snapshot (which composites native content
// AND any plugin sceneLayer) to assert the render VISIBLY changed.
//
// A built-in negative control runs first: two snapshots of the untouched
// blank page must diff to ~0, so every later "changed" is genuine
// plugin-rendered signal, not snapshot noise.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

/** Invoke a command through the real registry (the surface a shortcut/menu
 *  hits) and await the handler's mutation flow. */
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

/** Read back one of a frame/path's baked paint properties via the typed
 *  inspector query (the same facade the bundle reads). */
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
                entries?: Array<{ path: string; value?: { type: string; value?: unknown } | null }>;
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

test.describe("journey · paged.draw render output", () => {
  test("the paged.draw bundle's gradient-fill, stroke and pathfinder commands produce RENDERED change @feat:plugin-draw.pro-path-toolset @feat:plugin-draw.appearance @feat:plugin-platform.bundle-lifecycle @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const collected: string[] = [];

    // ── 0. NEGATIVE CONTROL — two snapshots of the untouched blank page
    //    must be stable (the deterministic CPU snapshot diffs to ~0 for an
    //    unchanged model). This proves a later "changed" is real signal. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. GRADIENT FILL (plugin) — draw a closed rectangle, select it, and
    //    invoke the bundle's linear-gradient command. It mints two stop
    //    swatches + a gradient and points frameFillColor at it; the gradient
    //    fill must RENDER over the (until now empty) frame. ──
    const r1 = await designer.drawRectangle({ x0: 160, y0: 170, x1: 420, y1: 360 });
    expect(r1, "drew a rectangle").not.toBe("");
    await designer.selectElement("rectangle", r1);

    const beforeFill = await designer.renderBytes();
    await invokeCommand(page, "media.paged.draw.command.fillGradientLinear");
    await expect
      .poll(async () => (await propOf(page, { kind: "rectangle", id: r1 }, "frameFillColor"))?.value ?? "", {
        timeout: 6_000,
      })
      .toEqual(expect.stringContaining("Gradient/"));
    const fillChanged = await designer.expectRenderChangesFrom(beforeFill);
    expect(fillChanged, "the gradient fill rendered onto the frame").toBeGreaterThan(64);

    // ── 2. STROKE (plugin) — the Appearance command bakes the front-most
    //    layer onto the frame's real frameStrokeWeight; the stroke edge must
    //    RENDER around the now-filled rectangle. ──
    const beforeStroke = await designer.renderBytes();
    await invokeCommand(page, "media.paged.draw.command.appearanceAddStroke");
    await expect
      .poll(async () => {
        const v = await propOf(page, { kind: "rectangle", id: r1 }, "frameStrokeWeight");
        return v?.type === "length" ? (v.value as number) ?? 0 : 0;
      }, { timeout: 6_000 })
      .toBeGreaterThan(0);
    await designer.expectRenderChangesFrom(beforeStroke);

    // ── 3. PATHFINDER UNITE (plugin, best-effort) — a second OVERLAPPING
    //    filled rectangle, then union the two. The merged silhouette renders
    //    differently from the two separate fills. Collected (not gating): the
    //    union geometry is the engine's contract, proven elsewhere; here we
    //    only assert that IF it drove, the page changed. ──
    try {
      const r2 = await designer.drawRectangle({ x0: 300, y0: 280, x1: 520, y1: 440 });
      await designer.applyFill("rectangle", r2, "Color/Black");
      await designer.selectElements([
        { kind: "rectangle", id: r1 },
        { kind: "rectangle", id: r2 },
      ]);
      const beforeUnite = await designer.renderBytes();
      await invokeCommand(page, "media.paged.draw.command.pathfinderUnite");
      await page.waitForTimeout(300);
      const afterUnite = await designer.renderBytes();
      const united = await designer.renderDiffPixels(beforeUnite, afterUnite);
      if (united <= 64) {
        collected.push(`pathfinder unite: render changed only ${united}px (≤64)`);
      }
    } catch (err) {
      collected.push(`pathfinder unite threw: ${String(err)}`);
    }

    // The gradient fill + stroke are HARD render assertions above (they gate
    // the test). The pathfinder render is collected so a partial drive is
    // visible without masking the proven steps.
    expect(collected, `paged.draw render steps that did not visibly render: ${collected.join("; ")}`).toEqual([]);
  });
});
