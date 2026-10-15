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

// ED-22 — a shape drawn in a new document was invisible.
//
// The engine's document defaults start unset, so every insert minted a
// shape with no fill and no stroke: File ▸ New, draw an ellipse, and the
// page did not change by a single pixel. InDesign draws a tool-made shape
// in its `[Normal Graphics Frame]` object style — no fill, a 1 pt
// `Color/Black` stroke — while a placed image, a frame drawn with a FRAME
// tool and anything a plugin or script inserts get no stroke. So the
// shape tools paint their own shape, in the insert's undo step, and the
// document defaults are left alone.

import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { Designer } from "./journey/driver/designer";
import { dragMouse, screenPoint, treeIds } from "./e2e/harness/viewport";

type Ref = { kind: string; id: string };

interface Paint {
  fill: unknown;
  stroke: unknown;
  weight: unknown;
}

type CanvasGlobal = {
  __canvas: {
    client: {
      elementProperties(id: Ref): Promise<{
        entries: Array<{ path: string; value?: { value?: unknown } | null }>;
      } | null>;
      undo(): Promise<unknown>;
      mutate(m: unknown): Promise<{ kind: string }>;
    };
    registries: { commands: { invoke(id: string): Promise<unknown> } };
  };
};

async function paintOf(page: Page, ref: Ref): Promise<Paint | null> {
  return page.evaluate(async (r) => {
    const props = await (globalThis as unknown as CanvasGlobal).__canvas.client.elementProperties(r);
    if (!props) return null;
    const read = (path: string) => props.entries.find((e) => e.path === path)?.value?.value ?? null;
    return {
      fill: read("frameFillColor"),
      stroke: read("frameStrokeColor"),
      weight: read("frameStrokeWeight"),
    };
  }, ref);
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.client.undo());
}

/** Pick a tool from its rail slot's flyout (a single-tool slot is just
 *  clicked). */
async function pickTool(page: Page, slot: string, toolId: string): Promise<void> {
  const button = page.locator(`[data-tool-slot="${slot}"]`);
  if ((await page.locator(`[data-tool-slot="${slot}"][data-tool="${toolId}"]`).count()) === 0) {
    await button.click({ button: "right" });
    const flyout = page.locator(`[data-tool-flyout="${slot}"]`);
    await expect(flyout).toBeVisible();
    await flyout.locator(`[data-tool="${toolId}"]`).click();
  } else {
    await button.click();
  }
  await expect(
    page.locator(`[data-tool-slot="${slot}"][data-tool="${toolId}"][data-active="true"]`),
  ).toBeVisible();
}

/** A drag from one page point to another. */
async function dragPt(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await dragMouse(page, await screenPoint(page, ...from), await screenPoint(page, ...to));
}

/** A freehand stroke through page points, sampled densely. */
async function scribble(page: Page, points: Array<[number, number]>): Promise<void> {
  const first = await screenPoint(page, ...points[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of points.slice(1)) {
    const s = await screenPoint(page, ...p);
    await page.mouse.move(s.x, s.y, { steps: 6 });
  }
  await page.mouse.up();
}

/** Click a run of page points, then commit the open path with Enter. */
async function penClicks(page: Page, points: Array<[number, number]>): Promise<void> {
  for (const p of points) {
    const s = await screenPoint(page, ...p);
    await page.mouse.click(s.x, s.y);
  }
  await page.keyboard.press("Enter");
}

interface ToolCase {
  name: string;
  feat: string;
  slot: string;
  tool: string;
  kind: string;
  draw: (page: Page) => Promise<void>;
}

const TOOLS: ToolCase[] = [
  {
    name: "Rectangle",
    feat: "editor-tools.draw.rectangle",
    slot: "shape",
    tool: "paged.tool.rectangle",
    kind: "rectangle",
    draw: (page) => dragPt(page, [100, 100], [260, 220]),
  },
  {
    name: "Ellipse",
    feat: "editor-tools.draw.rectangle",
    slot: "shape",
    tool: "paged.tool.ellipse",
    kind: "oval",
    draw: (page) => dragPt(page, [100, 100], [260, 220]),
  },
  {
    name: "Polygon",
    feat: "editor-tools.draw.rectangle",
    slot: "shape",
    tool: "paged.tool.polygon",
    kind: "polygon",
    draw: (page) => dragPt(page, [100, 100], [260, 220]),
  },
  {
    name: "Line",
    feat: "editor-tools.draw.line",
    slot: "line",
    tool: "paged.tool.line",
    kind: "graphicLine",
    draw: (page) => dragPt(page, [100, 120], [300, 200]),
  },
  {
    name: "Pen",
    feat: "editor-tools.draw.pen",
    slot: "pen",
    tool: "paged.tool.pen",
    kind: "polygon",
    draw: (page) =>
      penClicks(page, [
        [100, 120],
        [200, 220],
        [300, 140],
      ]),
  },
  {
    name: "Pencil",
    feat: "editor-tools.draw.pencil",
    slot: "pencil",
    tool: "paged.tool.pencil",
    kind: "polygon",
    draw: (page) =>
      scribble(page, [
        [100, 150],
        [150, 110],
        [200, 180],
        [250, 120],
        [300, 170],
      ]),
  },
];

const GRAPHIC: Paint = { fill: null, stroke: "Color/Black", weight: 1 };

test.describe("ED-22 — a tool-drawn shape wears InDesign's graphic default", () => {
  for (const t of TOOLS) {
    test(`AC-ED22-${t.name.toUpperCase()} — ${t.name} in a new document: no fill, 1 pt black stroke, visible, one undo removes it @feat:${t.feat} @level:happy`, async ({
      page,
    }) => {
      const designer = new Designer(page);
      await designer.open();
      await designer.newDocument();
      await pickTool(page, t.slot, t.tool);
      const before = await treeIds(page, t.kind);
      const blank = await designer.renderBytes();

      await t.draw(page);
      await expect.poll(async () => (await treeIds(page, t.kind)).length).toBe(before.length + 1);
      const created = (await treeIds(page, t.kind)).find((r) => !before.some((b) => b.id === r.id))!;
      const ref = { kind: t.kind, id: created.id };

      expect(await paintOf(page, ref)).toEqual(GRAPHIC);
      // The page shows it: the failure mode was a render that changed by
      // exactly 0 pixels.
      await designer.expectRenderChangesFrom(blank, { minPixels: 64 });

      // The paint is part of the insert's undo step, not a step of its own.
      await undo(page);
      expect(await paintOf(page, ref)).toBeNull();
      expect((await treeIds(page, t.kind)).length).toBe(before.length);
      await designer.expectRenderStable(blank, await designer.renderBytes());
    });
  }

  test("AC-ED22-GRIDIFY — every cell of a gridified rectangle is painted, and one undo removes the grid @feat:editor-tools.draw.gridify @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await pickTool(page, "shape", "paged.tool.rectangle");
    const a = await screenPoint(page, 100, 100);
    const b = await screenPoint(page, 400, 260);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await page.mouse.up();

    await expect.poll(async () => (await treeIds(page, "rectangle")).length).toBe(4);
    for (const r of await treeIds(page, "rectangle")) {
      expect(await paintOf(page, { kind: "rectangle", id: r.id }), `cell ${r.id}`).toEqual(GRAPHIC);
    }
    await undo(page);
    expect(await treeIds(page, "rectangle")).toHaveLength(0);
  });

  test("AC-ED22-FRAME — a FRAME tool's frame is a placeholder and stays unpainted @feat:editor-tools.draw.rectangle @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await pickTool(page, "frame", "paged.tool.rectangleFrame");
    await dragPt(page, [100, 100], [260, 220]);
    await expect.poll(async () => (await treeIds(page, "rectangle")).length).toBe(1);
    const [frame] = await treeIds(page, "rectangle");
    expect(await paintOf(page, { kind: "rectangle", id: frame.id })).toEqual({
      fill: null,
      stroke: null,
      weight: null,
    });
  });

  test("AC-ED22-DEFAULTS — once the document has defaults of its own, the tools draw with those @feat:color-swatches.document-defaults @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const set = await page.evaluate(() =>
      (globalThis as unknown as CanvasGlobal).__canvas.client.mutate({
        op: "setDocumentDefaults",
        args: { fillColor: "Color/Black", strokeColor: null, strokeWeight: null },
      }),
    );
    expect(set.kind).toBe("mutationApplied");
    await pickTool(page, "shape", "paged.tool.ellipse");
    await dragPt(page, [100, 100], [260, 220]);
    await expect.poll(async () => (await treeIds(page, "oval")).length).toBe(1);
    const [oval] = await treeIds(page, "oval");
    // The user's fill, and no stroke: their defaults say none.
    expect(await paintOf(page, { kind: "oval", id: oval.id })).toEqual({
      fill: "Color/Black",
      stroke: null,
      weight: null,
    });
  });

  test("AC-ED22-INSERT — Insert rectangle / ellipse / line from the palette land like drawn ones; Insert text frame stays unpainted @feat:editor-shell.command-authoring @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const insert = (id: string) =>
      page.evaluate(
        (cmd) => (globalThis as unknown as CanvasGlobal).__canvas.registries.commands.invoke(cmd),
        id,
      ) as Promise<{ applied: boolean; createdId: Ref | null }>;
    for (const id of ["paged.insert.rectangle", "paged.insert.ellipse", "paged.insert.line"]) {
      const outcome = await insert(id);
      expect(outcome.applied, id).toBe(true);
      expect(await paintOf(page, outcome.createdId!), id).toEqual(GRAPHIC);
    }
    const text = await insert("paged.insert.textFrame");
    expect(text.applied).toBe(true);
    expect((await paintOf(page, text.createdId!))?.stroke ?? null).toBeNull();
  });

  test("AC-ED22-PLACE — File ▸ Place still makes a frame with no stroke @feat:editor-shell.command-authoring @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const chooser = page.waitForEvent("filechooser");
    const invoked = page.evaluate(() =>
      (globalThis as unknown as CanvasGlobal).__canvas.registries.commands.invoke(
        "paged.insert.placeImage",
      ),
    ) as Promise<{ applied: boolean; createdId: Ref | null }>;
    const png = new PNG({ width: 40, height: 20 });
    png.data.fill(200);
    await (await chooser).setFiles({
      name: "swatch.png",
      mimeType: "image/png",
      buffer: PNG.sync.write(png),
    });
    await expect(page.locator("html[data-paged-placement='armed']")).toHaveCount(1, {
      timeout: 10_000,
    });
    const at = await screenPoint(page, 200, 200);
    await page.mouse.click(at.x, at.y);
    const outcome = await invoked;
    expect(outcome.applied).toBe(true);
    const paint = await paintOf(page, outcome.createdId!);
    expect(paint?.stroke ?? null).toBeNull();
    expect(paint?.fill ?? null).toBeNull();
  });
});
