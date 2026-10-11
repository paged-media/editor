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

// Journey: paged.draw's stroke and fill rows, through the HOST panels.
//
// paged.draw used to contribute two schema panels of its own, "Vector
// stroke" (`media.paged.draw.panel.stroke`) and "Vector fill"
// (`media.paged.draw.panel.fill`). Every row they carried is a core frame
// property, so the draw build from ux/panels-2026-10 (a0947ef) stopped
// contributing them and the host carries the rows instead: weight, colour,
// cap, dashes and arrowheads in the Stroke panel (`paged.stroke`, its
// "Dashes & arrows" section), corners in Object Options, the gradient's
// angle and length in Gradients (`paged.gradients`). Two panels for one
// stroke read as two different things.
//
// This journey proves the SAME user value the old one did, through the
// panels a designer now reaches:
//
//   1. on a Pen-drawn open path, an end arrowhead and a dash pattern set in
//      Stroke ▸ Dashes & arrows land in the model (read back through
//      `host.objects`), each as ONE undo step;
//   2. after applying a gradient, its angle set in the Gradients panel
//      lands in the model as one undo step;
//   3. the retired panels are gone from the registry, and draw's context
//      panel is "Draw settings" (`media.paged.draw.panel.properties`),
//      which still mounts from the catalog.
//
// Rows are addressed by the host's DOM hooks: every composition field
// renders `[data-property-field="<path>"]` (object-field.tsx), and a
// collapsible section is `[data-section="<title>"]` with a
// `[data-section-toggle]` header (leaves.tsx).

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";
import { objGet, undoOnce } from "../../e2e/harness/objects";

const RETIRED = ["media.paged.draw.panel.stroke", "media.paged.draw.panel.fill"];
const DRAW_SETTINGS = "media.paged.draw.panel.properties";

const field = (page: Page, panel: string, path: string) =>
  page.locator(`${panel} [data-property-field="${path}"]`).first();

/** An unset arrowhead reads as nothing (null / "") or core's "None". */
const isNone = (v: unknown) => v === null || v === "" || v === "None";

test.describe("journey · paged.draw stroke + fill rows in the host panels", () => {
  test("a designer sets an arrowhead and a dash pattern on a path in Stroke ▸ Dashes & arrows @feat:editor-shell.panels.stroke @feat:frames-paths.arrowheads @feat:frames-paths.stroke-dashed @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. AUTHOR — an open path with the Pen, stroked so it shows. ──
    const pathId = await designer.drawPath([
      [180, 420],
      [320, 420],
      [250, 500],
    ]);
    expect(pathId, "authored a path").not.toBe("");
    await designer.applyStroke("polygon", pathId, "Color/Black", 3);
    await designer.selectElement("polygon", pathId);
    const address = `polygon:${pathId}`;

    // ── 2. The host Stroke panel, its Dashes & arrows section opened. ──
    await designer.openPanel("paged.stroke");
    const STROKE = '[data-stroke-panel="ready"]';
    await expect(page.locator(STROKE)).toBeVisible({ timeout: 6_000 });
    const section = page.locator(`${STROKE} [data-section="Dashes & arrows"]`);
    await expect(section).toBeVisible();
    const toggle = section.locator("[data-section-toggle]");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // ── 3. END ARROWHEAD — pick "Triangle"; the model holds core's enum
    //    member, and one undo takes it back off. ──
    const end = field(page, STROKE, "frameStrokeEndArrowhead");
    await expect(end).toHaveAttribute("data-value-type", "enum");
    expect(isNone(await objGet(page, address, "frameStrokeEndArrowhead"))).toBe(true);
    await end.locator("select").selectOption({ label: "Triangle" });
    await expect
      .poll(() => objGet(page, address, "frameStrokeEndArrowhead"))
      .toBe("TriangleArrowHead");
    await undoOnce(page);
    await expect
      .poll(async () => isNone(await objGet(page, address, "frameStrokeEndArrowhead")))
      .toBe(true);
    // Set it again so the path keeps an arrowhead through the dash edit.
    await end.locator("select").selectOption("TriangleArrowHead");
    await expect
      .poll(() => objGet(page, address, "frameStrokeEndArrowhead"))
      .toBe("TriangleArrowHead");

    // ── 4. DASH PATTERN — a list of lengths (dash, gap … in pt), typed
    //    into the row and committed with Enter: one write, one undo. ──
    const dash = field(page, STROKE, "frameStrokeDashArray");
    await expect(dash).toHaveAttribute("data-value-type", "list");
    const dashInput = dash.locator("input").first();
    await dashInput.fill("6, 3");
    await dashInput.press("Enter");
    await expect.poll(() => objGet(page, address, "frameStrokeDashArray")).toEqual([6, 3]);
    await undoOnce(page);
    await expect
      .poll(async () => {
        const v = await objGet(page, address, "frameStrokeDashArray");
        return v === null || (Array.isArray(v) && v.length === 0);
      })
      .toBe(true);
    // The undo took ONLY the dash edit: the arrowhead stays.
    expect(await objGet(page, address, "frameStrokeEndArrowhead")).toBe("TriangleArrowHead");
  });

  test("a designer applies a gradient and sets its angle in the Gradients panel @feat:editor-shell.panels.gradients @feat:color-swatches.gradients @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const rectId = await designer.drawRectangle({ x0: 150, y0: 150, x1: 380, y1: 320 });
    expect(rectId, "drew a rectangle").not.toBe("");
    const gradient = await designer.createGradient("journey-grad", ["Color/Black", "Color/Paper"]);
    expect(gradient).toMatch(/^Gradient\//);
    await designer.applyFill("rectangle", rectId, gradient);
    await designer.selectElement("rectangle", rectId);
    const address = `rectangle:${rectId}`;
    await expect.poll(() => objGet(page, address, "frameFillColor")).toBe(gradient);

    await designer.openPanel("paged.gradients");
    const GRADIENTS = '[data-gradients-panel="ready"]';
    await expect(page.locator(GRADIENTS)).toBeVisible({ timeout: 6_000 });

    // ── ANGLE — the row draw's Vector fill panel carried, now in
    //    Gradients next to the applied gradient. ──
    const angle = field(page, GRADIENTS, "frameGradientFillAngle");
    await expect(angle).toHaveAttribute("data-value-type", "number");
    await expect(field(page, GRADIENTS, "frameGradientFillLength")).toHaveAttribute(
      "data-value-type",
      "length",
    );
    const before = await objGet(page, address, "frameGradientFillAngle");
    const next = before === 45 ? 30 : 45;
    const input = angle.locator("input").first();
    await input.click();
    await input.press("ControlOrMeta+a");
    await input.pressSequentially(String(next));
    await input.press("Enter");
    await expect.poll(() => objGet(page, address, "frameGradientFillAngle")).toBe(next);
    await undoOnce(page);
    await expect.poll(() => objGet(page, address, "frameGradientFillAngle")).toBe(before);
    // The fill is still the gradient: the undo took only the angle.
    expect(await objGet(page, address, "frameFillColor")).toBe(gradient);
  });

  test("Vector stroke and Vector fill are gone; draw's context panel is Draw settings, rendered from the catalog @feat:editor-shell.panels.stroke @feat:plugin-platform.bundle-lifecycle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const panels = await page.evaluate(() =>
      (
        globalThis as unknown as {
          __canvas: { registries: { panels: { list: () => Array<{ id: string }> } } };
        }
      ).__canvas.registries.panels.list().map((p) => p.id),
    );
    expect(panels.filter((id) => RETIRED.includes(id)), "retired panels are not registered").toEqual([]);
    expect(panels).toContain(DRAW_SETTINGS);

    const pathId = await designer.drawPath([
      [180, 420],
      [320, 420],
      [250, 500],
    ]);
    await designer.selectElement("polygon", pathId);
    await designer.openPanel(DRAW_SETTINGS);
    const settings = page.locator(`[data-schema-panel="${DRAW_SETTINGS}"]`);
    await expect(settings, "Draw settings mounts from the catalog").toBeVisible({ timeout: 6_000 });
    await expect(settings.locator('[data-schema-section="Path"]')).toBeVisible();
  });

  test("Properties shows Draw settings inline for artwork draw made, not for a plain rectangle @feat:editor-shell.panels.properties @feat:plugin-platform.bundle-lifecycle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const rectId = await designer.drawRectangle({ x0: 150, y0: 150, x1: 300, y1: 260 });
    expect(rectId, "drew a rectangle").not.toBe("");
    await designer.selectElement("rectangle", rectId);
    await designer.openPanel("paged.properties");
    const owned = page.locator('[data-properties-section="plugin-owned"]');
    // A plain rectangle carries no draw metadata: no draw surface here.
    await expect(owned).toHaveCount(0);

    // A radial repeat makes draw-owned artwork (the source carries draw's
    // `x-paged:media.paged.draw` envelope).
    await designer.runCommand("media.paged.draw.command.makeRadialRepeat");
    await designer.selectElement("rectangle", rectId);
    await expect(owned, "Draw settings inline for the repeat's source").toHaveCount(1, { timeout: 10_000 });
    await expect(owned).toHaveAttribute("data-properties-owner", "vectorGraphic");
    await expect(owned.getByText(/Radial repeat/).first()).toBeVisible();
  });
});
