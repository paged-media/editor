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

// Journey: paged.draw STROKE DASH presets — Solid / Dashed / Dotted /
// Dash-dot through the bundle's command surface.
//
// `frameStrokeDashArray` is a VECTOR value above the scalar schema
// binding ceiling, so each dash style ships as a COMMAND
// (media.paged.draw.command.strokeDash{Solid,Dashed,Dotted,DashDot})
// that commits a fixed `lengths` array to the selection. This journey
// drives the same real host path a menu/shortcut hits
// (registries.commands.invoke), reads the baked dash array back through
// the typed inspector, AND render-verifies that going from a SOLID
// stroke to a DASHED stroke visibly changes the page (the gaps between
// dashes drop ink). Solid → Dashed is the load-bearing render assertion;
// the per-preset wire shapes are asserted by reading the array back.
//
// A negative control runs first: two snapshots of the untouched blank
// page must be stable, so every later "changed" is genuine signal.
//
// The second test drives the CUSTOM dash — Draw ▸ Stroke ▸ Dashes…
// (media.paged.draw.command.strokeDashOptions). That command mutates
// NOTHING: it raises the Path Options panel at its "Stroke dashes"
// section, whose six dash/gap fields are the only way to type a dash
// pattern the four presets do not offer. The journey asserts the panel
// opens AT that section with the selection counted, that the command
// alone left the stroke solid, and that ticking "Dashed", typing a
// two-pair pattern and pressing Apply bakes exactly that run — then
// that one undo restores the solid stroke.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

/** Invoke a command through the real registry (the surface a
 *  shortcut/menu hits) and await the handler's mutation flow. */
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

/** Read a frame/path's baked `frameStrokeDashArray` (the alternating
 *  on/off pt run) via the inspector property query. `[]` = solid. */
async function dashArrayOf(
  page: import("@playwright/test").Page,
  ref: { kind: string; id: string },
): Promise<number[]> {
  return page.evaluate(
    async (r) => {
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
        if (e.path === "frameStrokeDashArray" && e.value?.type === "lengths") {
          return (e.value.value as number[]) ?? [];
        }
      }
      return [];
    },
    ref,
  );
}

test.describe("journey · paged.draw stroke dash", () => {
  test("a designer dashes a stroked rectangle through the strokeDash preset commands @feat:plugin-draw.stroke-dash-commands @feat:plugin-platform.bundle-lifecycle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. NEGATIVE CONTROL — the blank page is render-stable. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. AUTHOR — a rectangle with a thick black stroke so dash gaps
    //    are unmistakably visible (a stroke with a wide on/off run drops
    //    a lot of ink between dashes). ──
    const ref = { kind: "rectangle", id: await designer.drawRectangle({ x0: 150, y0: 160, x1: 440, y1: 360 }) };
    expect(ref.id, "drew a rectangle").not.toBe("");
    await designer.applyStroke("rectangle", ref.id, "Color/Black", 6);
    await designer.selectElement("rectangle", ref.id);

    // ── 2. SOLID baseline — the Solid preset CLEARS the dash array. ──
    await invokeCommand(page, "media.paged.draw.command.strokeDashSolid");
    await expect
      .poll(() => dashArrayOf(page, ref), { timeout: 6_000 })
      .toEqual([]);
    const solid = await designer.renderBytes();

    // ── 3. DASHED — commits a 6/3 on/off run; the gaps drop ink, so the
    //    rendered stroke VISIBLY changes vs the solid baseline. ──
    await invokeCommand(page, "media.paged.draw.command.strokeDashDashed");
    await expect
      .poll(() => dashArrayOf(page, ref), { timeout: 6_000 })
      .toEqual([6, 3]);
    await designer.expectRenderChangesFrom(solid);

    // ── 4. DOTTED / DASH-DOT — assert each preset bakes its documented
    //    wire run (the §12.3 shape, read back from the engine). ──
    await invokeCommand(page, "media.paged.draw.command.strokeDashDotted");
    await expect
      .poll(() => dashArrayOf(page, ref), { timeout: 6_000 })
      .toEqual([1, 3]);

    await invokeCommand(page, "media.paged.draw.command.strokeDashDashDot");
    await expect
      .poll(() => dashArrayOf(page, ref), { timeout: 6_000 })
      .toEqual([6, 3, 1, 3]);

    // ── 5. BACK TO SOLID — the Solid preset clears the array again (the
    //    gate is reversible, not one-shot). ──
    await invokeCommand(page, "media.paged.draw.command.strokeDashSolid");
    await expect
      .poll(() => dashArrayOf(page, ref), { timeout: 6_000 })
      .toEqual([]);
  });

  test("a designer types a custom dash pattern in the Dashes… options panel @feat:plugin-draw.stroke-dash-commands @feat:frames-paths.stroke-dashed @feat:plugin-platform.panel-registration @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const ref = { kind: "rectangle", id: await designer.drawRectangle({ x0: 150, y0: 160, x1: 440, y1: 360 }) };
    expect(ref.id, "drew a rectangle").not.toBe("");
    await designer.applyStroke("rectangle", ref.id, "Color/Black", 6);
    await designer.selectElement("rectangle", ref.id);
    await expect.poll(() => dashArrayOf(page, ref), { timeout: 6_000 }).toEqual([]);
    const solid = await designer.renderBytes();

    // ── 1. THE "…" COMMAND RAISES THE PANEL AT ITS SECTION — and writes
    //    nothing on its own. ──
    await invokeCommand(page, "media.paged.draw.command.strokeDashOptions");
    const panel = page.locator('[data-draw-pathopts-panel="dash"]');
    await expect(panel, "the Path Options panel opened at Stroke dashes").toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page.locator('[data-draw-pathopts-section="dash"][data-draw-pathopts-open="true"]'),
    ).toBeVisible();
    await expect(panel, "the panel counts the one selected path").toHaveAttribute(
      "data-draw-pathopts-targets",
      "1",
    );
    // The section follows the selection: a solid path loads unticked.
    const dashed = page.locator('[data-draw-pathopts-toggle="dash.dashed"]');
    await expect(dashed).not.toBeChecked();
    expect(await dashArrayOf(page, ref), "opening the panel changed nothing").toEqual([]);

    // ── 2. TYPE A PATTERN THE PRESETS DO NOT HAVE — 8 on / 4 off /
    //    2 on / 4 off — and Apply it. ──
    await dashed.check();
    for (const [field, value] of [
      ["dash.dash1", 8],
      ["dash.gap1", 4],
      ["dash.dash2", 2],
      ["dash.gap2", 4],
    ] as const) {
      await page.locator(`[data-draw-pathopts-field="${field}"]`).fill(String(value));
    }
    // The readout shows the run an Apply will write before it is written.
    await expect(page.locator("[data-draw-pathopts-dash-pattern]")).toContainText("8");
    expect(await dashArrayOf(page, ref), "typing alone writes nothing").toEqual([]);

    const apply = page.locator('[data-draw-pathopts-apply="dash"]');
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect
      .poll(() => dashArrayOf(page, ref), { timeout: 6_000 })
      .toEqual([8, 4, 2, 4]);
    // The gaps drop ink: the stroke visibly changes vs the solid baseline.
    await designer.expectRenderChangesFrom(solid);

    // ── 3. ONE UNDO STEP — the dash Apply is a single journal entry. ──
    await designer.runCommand("paged.editor.undo");
    await expect
      .poll(() => dashArrayOf(page, ref), { timeout: 6_000 })
      .toEqual([]);
  });
});
