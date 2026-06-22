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

import { expect, test } from "@playwright/test";

import { dragMouse, screenPoint } from "../../e2e/harness/viewport";
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
  test("a designer authors with the Pencil + Curvature, steers a gradient, and measures @feat:plugin-draw.pro-path-toolset @feat:plugin-platform.bundle-lifecycle @level:gesture", async ({
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
    const afterPencil = await designer.renderBytes();
    await designer.expectRenderChanged(before, afterPencil);

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
});
