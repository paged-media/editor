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

// paged.draw, the plugin film (ADR 224): the website's `films/draw.yaml`.
// Everything the voice describes happens through the editor's own controls:
// the tool rail, shortcuts (shown as keycaps), the Draw menu, the Swatches
// panel, File ▸ Open… and the export centre. Each step is asserted, so a
// take that looks right but did nothing fails.

import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { film, type Kit } from "../kit/film";
import { hover, menu, press, screenPoint } from "../kit/ui";

const ASSETS = join(process.env.PAGED_MEDIA_ROOT ?? "", "assets");

/** Where the work happens, in page points. */
const DOME: [number, number, number, number] = [60, 50, 350, 290];
const CARD: [number, number, number, number] = [330, 60, 570, 280];
const PAIR: [number, number, number, number] = [60, 290, 390, 490];
const MARK: [number, number, number, number] = [370, 300, 550, 480];

const pt = (k: Kit, x: number, y: number) => screenPoint(k.page, x, y);

async function ids(page: Page, kind: string): Promise<string[]> {
  return page.evaluate(async (want) => {
    type Node = { id?: { kind: string; id: string } | null; children?: Node[] };
    const c = (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<{ output: string[] }> } } }).__canvas;
    const r = await c.client.executeScript("JSON.stringify(paged.tree())");
    const out: string[] = [];
    const visit = (n: Node) => {
      if (n.id?.kind === want) out.push(n.id.id);
      for (const ch of n.children ?? []) visit(ch);
    };
    for (const root of JSON.parse(JSON.parse(r.output[0])) as Node[]) visit(root);
    return out;
  }, kind);
}

async function subpathOpen(page: Page, id: string): Promise<boolean | undefined> {
  return page.evaluate(async (pid) => {
    const c = (globalThis as unknown as { __canvas: { client: { pathAnchors(r: unknown): Promise<{ subpathOpen?: boolean[] } | null> } } }).__canvas;
    return (await c.client.pathAnchors({ kind: "polygon", id: pid }))?.subpathOpen?.[0];
  }, id);
}

/** Fill the selection from the Swatches panel's Fill field. The field is a
 *  native select, whose popup headless Chrome does not paint: the pointer
 *  goes to the field and the value changes in it, as it does for a person
 *  choosing from the list. */
async function fillWith(k: Kit, swatch: string): Promise<void> {
  const field = k.page.locator('[data-property-field="frameFillColor"] select').first();
  await hover(k, field);
  await k.hold(250);
  await field.selectOption({ label: swatch });
  await expect(field.locator("option:checked")).toHaveText(swatch);
  await k.hold(300);
}

/** Every page item, by kind. */
async function census(page: Page): Promise<string> {
  const kinds = ["rectangle", "polygon", "oval", "textFrame", "graphicLine"];
  const counts = await Promise.all(kinds.map(async (kind) => `${kind}:${(await ids(page, kind)).length}`));
  return counts.join(" ");
}

/** Click an empty part of the page with the selection tool, so handles do
 *  not hide the shape; asserts the click made nothing. */
async function deselect(k: Kit): Promise<void> {
  const before = await census(k.page);
  await k.key("v");
  await k.pointer.click(await pt(k, 300, 700), { targetWidth: 200 });
  await k.hold(200);
  expect(await census(k.page), "the deselect click created nothing").toBe(before);
}

film("draw", async (k) => {
  const { page, designer, pointer } = k;

  await k.setup(async () => {
    await designer.open();
    await designer.newDocument();
    await designer.createSwatch("Rose", [244, 127, 192]);
    await designer.createSwatch("Violet", [169, 139, 245]);
    await k.key("v");
    await k.hold(800);
  });
  await k.roll();

  // ── The pen: two clicks, a straight base. ──
  let dome = "";
  await k.scene("pen", async () => {
    await k.hold(400);
    await press(k, page.locator('[data-tool-slot="pen"]'));
    k.focus(DOME);
    await k.hold(700);
    await pointer.click(await pt(k, 100, 250), { targetWidth: 10 });
    await k.hold(350);
    await pointer.click(await pt(k, 310, 250), { targetWidth: 10 });
  });

  // ── A handle drag bends it; the first anchor closes it. ──
  await k.scene("curve", async () => {
    const before = await ids(page, "polygon");
    await pointer.drag(await pt(k, 205, 90), await pt(k, 120, 90));
    await k.hold(400);
    await pointer.click(await pt(k, 100, 250), { targetWidth: 8 });
    await expect.poll(async () => (await ids(page, "polygon")).length, { timeout: 6000 }).toBe(before.length + 1);
    dome = (await ids(page, "polygon")).find((id) => !before.includes(id)) ?? "";
    expect(await subpathOpen(page, dome), "the click on the first anchor closed the path").toBe(false);
  });

  // ── Fill from the swatches. ──
  await k.scene("fill", async () => {
    k.unfocus();
    await press(k, page.getByText("Swatches", { exact: true }).first());
    await k.hold(300);
    await fillWith(k, "Rose");
    k.focus(DOME);
  });

  // ── A rectangle, rounded live from the Draw menu. ──
  await k.scene("corners", async () => {
    k.unfocus();
    await k.key("m", "Rectangle tool");
    const rects = (await ids(page, "rectangle")).length;
    await pointer.drag(await pt(k, 360, 90), await pt(k, 540, 250), { speed: 1.2 });
    await expect.poll(async () => (await ids(page, "rectangle")).length).toBe(rects + 1);
    const card = (await ids(page, "rectangle")).at(-1)!;
    await menu(k, ["Draw", "Corners", "Rounded"]);
    await expect
      .poll(() =>
        page.evaluate(async (rid) => {
          const c = (globalThis as unknown as { __canvas: { client: { elementProperties(r: unknown): Promise<{ entries: Array<{ path: string; value?: { value?: unknown } }> } | null> } } }).__canvas;
          const p = await c.client.elementProperties({ kind: "rectangle", id: rid });
          return p?.entries.find((e) => e.path === "frameCornerOptionTopLeft")?.value?.value;
        }, card),
      )
      .toBe("RoundedCorner");
    await fillWith(k, "Violet");
    await deselect(k);
    k.focus(CARD);
    await k.hold(2200);
  });

  // ── Two overlapping shapes merged by the shape builder. (Side by side,
  //    the case the builder gets right: it reads an oval's bounding box
  //    rather than its curve, and a cross-shaped overlap loses regions.) ──
  await k.scene("builder", async () => {
    k.unfocus();
    await k.key("m", "Rectangle tool");
    await pointer.drag(await pt(k, 90, 320), await pt(k, 250, 440), { speed: 1.6 });
    await fillWith(k, "Rose");
    await pointer.drag(await pt(k, 190, 340), await pt(k, 350, 460), { speed: 1.6 });
    await fillWith(k, "Violet");
  });

  await k.scene("merge", async () => {
    const shapes = async () => (await ids(page, "rectangle")).length + (await ids(page, "polygon")).length;
    const before = await shapes();
    await press(k, page.locator('[data-tool-slot="shapeBuilder"]'));
    k.focus(PAIR);
    await k.hold(700);
    await pointer.drag(await pt(k, 120, 380), await pt(k, 330, 400), { speed: 0.8 });
    await expect.poll(shapes, { timeout: 6000 }).toBe(before - 1);
    await deselect(k);
    await k.hold(1500);
  });

  // ── SVG in: File ▸ Open… adds the file's shapes as paths. ──
  await k.scene("svg-in", async () => {
    k.unfocus();
    const polys = (await ids(page, "polygon")).length;
    const chooser = page.waitForEvent("filechooser");
    await menu(k, ["File", "Open…"]);
    k.chip("brand-kit.svg", "file");
    await (await chooser).setFiles(join(ASSETS, "brand-kit.svg"));
    await expect.poll(async () => (await ids(page, "polygon")).length, { timeout: 8000 }).toBe(polys + 3);
    k.focus(MARK);
    await k.hold(600);
    await k.key("v");
    await pointer.click(await pt(k, 500, 390), { targetWidth: 20 });
    await k.hold(500);
  });

  // ── SVG out, from the export centre. ──
  await k.scene("svg-out", async () => {
    k.unfocus();
    await press(k, page.getByRole("button", { name: "Export", exact: true }).last());
    await k.hold(600);
    const download = page.waitForEvent("download");
    await press(k, page.locator('[data-plugin-export="media.paged.draw.exporter.svg"]'));
    const file = await download;
    k.chip(`${file.suggestedFilename()} saved`, "save");
    const saved = join(k.dir, "exported.svg");
    await file.saveAs(saved);
    const svg = readFileSync(saved, "utf8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
    await k.hold(800);
  });
});
