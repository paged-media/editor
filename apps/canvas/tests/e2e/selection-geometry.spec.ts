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

// The selection box follows a selection made by anything but a click.
//
// The box is drawn from the shell's geometry mirror, which only the
// shell's own paths (click, marquee, gesture commit, the object verbs)
// refreshed. A plugin's `host.selection.set` and the live scripts'
// `editor.select` set the selection and left the mirror alone, so the box
// stayed on the previous selection. Found filming paged.sheet: the chart
// it placed was selected — the control bar said "Group" — while the box
// sat on the table selected before.
//
// The mirror is asserted against what a click would have written for the
// same selection: the engine's `elementGeometry` for the selected ids.
// A group answers no geometry (engine 0.71.8), so a selected group shows
// no box, on every path alike.

import { expect, test, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openPanel } from "../fidelity/canvas-driver";
import { Designer } from "../journey/driver/designer";
import { activateTool, screenPoint } from "./harness/viewport";

type Ref = { kind: string; id: string };

const CHART_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "harness/sheet-09-chart.xlsx",
);

interface CanvasGlobal {
  __canvas: {
    elementSelection: Ref[];
    elementGeometry: Array<{ id: Ref }>;
    client: {
      elementGeometry: (ids: Ref[]) => Promise<Array<{ id: Ref }>>;
      executeScript: (s: string) => Promise<{ output: string[]; error: string | null }>;
    };
  };
}

const key = (r: Ref) => `${r.kind}:${r.id}`;
const keys = (rs: Ref[]) => rs.map(key).sort();

/** The selection the panels read, the engine's own, and the ids the
 *  selection box is drawn from. */
async function selectionState(page: Page): Promise<{
  shell: string[];
  engine: string[];
  box: string[];
}> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const r = await c.client.executeScript("paged.selection()");
    const engine = JSON.parse(r.output[0] ?? "[]") as Ref[];
    const k = (x: Ref) => `${x.kind}:${x.id}`;
    return {
      shell: c.elementSelection.map(k).sort(),
      engine: engine.map(k).sort(),
      box: c.elementGeometry.map((g) => k(g.id)).sort(),
    };
  });
}

/** What a click on the current selection would put in the mirror. */
async function clickGeometry(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const items = await c.client.elementGeometry(c.elementSelection);
    return items.map((g) => `${g.id.kind}:${g.id.id}`).sort();
  });
}

/** The magenta outlines the selection-chrome overlay drew. */
const drawnBoxes = (page: Page) =>
  page.locator('polygon[stroke="var(--overlay-selection)"]');

/** Select with the Selection tool, by a real click at a page point. */
async function clickAt(page: Page, x: number, y: number): Promise<void> {
  await activateTool(page, "select");
  const p = await screenPoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}

async function filledRect(
  designer: Designer,
  rect: { x0: number; y0: number; x1: number; y1: number },
): Promise<Ref> {
  const id = await designer.drawRectangle(rect);
  await designer.applyFill("rectangle", id);
  return { kind: "rectangle", id };
}

test.describe("selection box follows a programmatic selection", () => {
  test("a bundle's host.selection.set moves the box to what it selected @feat:editor-tools.overlays @feat:plugin-draw.select-same @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const a = await filledRect(designer, { x0: 60, y0: 60, x1: 160, y1: 140 });
    const b = await filledRect(designer, { x0: 220, y0: 60, x1: 320, y1: 140 });

    await clickAt(page, 110, 100);
    await expect.poll(async () => (await selectionState(page)).box).toEqual([key(a)]);
    await expect(drawnBoxes(page)).toHaveCount(1);

    // paged.draw's Select same ▸ Fill selects through host.selection.set,
    // and selects nothing else: no mutation follows to refresh the box.
    await designer.runCommand("media.paged.draw.command.selectSameFill");
    await expect.poll(async () => (await selectionState(page)).engine).toEqual(keys([a, b]));

    const state = await selectionState(page);
    expect(state.shell).toEqual(keys([a, b]));
    await expect.poll(async () => (await selectionState(page)).box).toEqual(keys([a, b]));
    expect((await selectionState(page)).box).toEqual(await clickGeometry(page));
    await expect(drawnBoxes(page)).toHaveCount(2);
  });

  test("the chart paged.sheet places and selects takes the box off the previous selection @feat:editor-tools.overlays @feat:sheet.chart.engine @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const table = await filledRect(designer, { x0: 60, y0: 600, x1: 200, y1: 700 });

    await clickAt(page, 130, 650);
    await expect.poll(async () => (await selectionState(page)).box).toEqual([key(table)]);
    await expect(drawnBoxes(page)).toHaveCount(1);

    await openPanel(page, "media.paged.sheet.panel.workbook");
    const pick = page.locator("[data-sheet-pick]");
    await expect(pick).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await pick.click();
    await (await chooser).setFiles(CHART_FIXTURE);
    await expect(page.locator("[data-sheet-range]")).toBeVisible({ timeout: 30_000 });

    // Lowering ends in host.selection.set([the chart's group]).
    await designer.runCommand("media.paged.sheet.command.lowerChartToFrame");
    await expect
      .poll(async () => (await selectionState(page)).shell, { timeout: 30_000 })
      .toEqual([expect.stringMatching(/^group:/)]);

    const state = await selectionState(page);
    expect(state.engine).toEqual(state.shell);
    // The box reads what a click on the chart reads — and never the table.
    await expect.poll(async () => (await selectionState(page)).box).toEqual(await clickGeometry(page));
    expect((await selectionState(page)).box).not.toContain(key(table));
    await expect(drawnBoxes(page)).toHaveCount(0);
  });

  test("a live script's editor.select selects in the engine and moves the box @feat:editor-tools.overlays @feat:scripting.visible-results @level:happy", async ({
    page,
  }) => {
    await page.route("**/scripts/select-probe.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: `await editor.runCommand("paged.file.new");
const pageId = editor.pageIds()[0];
const a = await editor.mutate({ op: "insertFrame", args: { pageId, bounds: [60, 60, 140, 160] } });
const b = await editor.mutate({ op: "insertFrame", args: { pageId, bounds: [60, 220, 140, 320] } });
await editor.select([a.payload.createdId], "replace");
await editor.select([b.payload.createdId], "replace");
globalThis.__selectProbe = b.payload.createdId;
`,
      }),
    );
    const designer = new Designer(page);
    await designer.open({ search: "?script=select-probe" });
    await expect(page.locator("[data-playground-play]")).toBeVisible({ timeout: 15_000 });
    await page.locator("[data-playground-play]").click();
    await expect
      .poll(() => page.evaluate(() => (globalThis as { __selectProbe?: Ref }).__selectProbe ?? null), {
        timeout: 20_000,
      })
      .not.toBeNull();
    const b = await page.evaluate(() => (globalThis as unknown as { __selectProbe: Ref }).__selectProbe);

    await expect.poll(async () => (await selectionState(page)).box).toEqual([key(b)]);
    const state = await selectionState(page);
    expect(state.shell).toEqual([key(b)]);
    expect(state.engine).toEqual([key(b)]);
    await expect(drawnBoxes(page)).toHaveCount(1);
  });
});
