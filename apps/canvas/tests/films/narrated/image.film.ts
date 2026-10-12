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

// paged.image, the plugin film (ADR 224): the website's `films/image.yaml`.
// A photograph placed on the page, opened for editing where it sits,
// auto-enhanced, healed, adjusted through a luminosity selection and
// committed; then a layered PSD whose layer edit saves back as a PSD. Every
// step goes through the editor's own controls and is asserted against the
// plugin's status line, the engine or the exported bytes.
//
// What is NOT filmed, and why: curves, dodge/burn and spot heal are not
// stable in the capability record; layer hide/reorder is a record edit the
// canvas does not re-flatten. The PSD is opened after a Reset because the
// previous image's adjustment values carry over to the next image, and with
// them the PSD export flattens to one layer (reported as a product bug).

import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { film, type Kit } from "../kit/film";
import { hover, press, screenPoint } from "../kit/ui";

const ASSETS = join(process.env.PAGED_MEDIA_ROOT ?? "", "assets");
const PHOTO = "pexels-618833-dolomites.jpg";
const PSD = "annual-layers.psd";

/** Where the work happens, in page points. The photo lands with its top-left
 *  at (60, 60) and spans 490 × 327 pt. */
const PHOTO_AREA: [number, number, number, number] = [30, 40, 580, 410];
const SKY: [number, number, number, number] = [360, 52, 560, 150];
const PSD_FRAME = { x0: 106, y0: 430, x1: 506, y1: 730 };

const pt = (k: Kit, x: number, y: number) => screenPoint(k.page, x, y);

/** The photo's own pixels, on screen: it is placed at (60, 60) pt and
 *  2200 px span 489.6 pt. */
const PX = 489.6 / 2200;
const img = (k: Kit, x: number, y: number) => pt(k, 60 + x * PX, 60 + y * PX);

/** The two contrails, traced in the photo's pixels (a brightness ridge
 *  followed column by column), and where clean sky lies beside each. */
const TRAILS = [
  { from: [1505, 119], to: [2115, 1], source: [1505, 159] },
  { from: [1665, 170], to: [2055, 104], source: [1665, 205] },
] as const;

/** A stroke along a trail, zig-zagging two pixels either side so the small
 *  healing dab covers the whole width of the line. */
async function trailPath(k: Kit, t: (typeof TRAILS)[number]): Promise<Array<{ x: number; y: number }>> {
  const [x0, y0] = t.from;
  const [x1, y1] = t.to;
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= n; i++) {
    const side = i % 2 === 0 ? -2 : 2;
    out.push(await img(k, x0 + ((x1 - x0) * i) / n + nx * side, y0 + ((y1 - y0) * i) / n + ny * side));
  }
  return out;
}

/** Alt-click: the healing brush's source. */
async function sample(k: Kit, x: number, y: number, chip: boolean): Promise<void> {
  await k.pointer.moveTo(await img(k, x, y), { targetWidth: 10 });
  await k.hold(350);
  if (chip) k.chip("click to sample", "key", "Alt");
  await k.page.keyboard.down("Alt");
  await k.pointer.click();
  await k.page.keyboard.up("Alt");
}

/** A menu path, opened the way a hand does it. The submenu library keeps the
 *  previous submenu open while the pointer could be heading for it, and it
 *  opens a submenu on pointer MOVEMENT: a pointer that comes to rest on
 *  "Image" after crossing "Draw" opens nothing. So each submenu parent is
 *  rested on and then nudged. Items are matched by their label's start,
 *  because an item's accessible name includes its shortcut ("Place… ⌘D"). */
async function menuWalk(k: Kit, path: string[]): Promise<void> {
  const item = (label: string) =>
    k.page.getByRole("menuitem", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).first();
  const [top, ...rest] = path;
  await press(k, k.page.locator("header").getByText(top, { exact: true }).first());
  await k.hold(250);
  for (const [i, label] of rest.entries()) {
    if (i === rest.length - 1) {
      await press(k, item(label));
      break;
    }
    await hover(k, item(label));
    await k.hold(400);
    const at = k.pointer.position;
    await k.pointer.moveTo({ x: at.x + 10, y: at.y }, { targetWidth: 60 });
    await expect(item(rest[i + 1])).toBeVisible();
  }
}

async function status(page: Page): Promise<string> {
  return ((await page.locator("[data-image-status]").allTextContents().catch(() => [])) as string[]).join(" | ");
}

async function editContext(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const c = (globalThis as unknown as { __canvas: { debugContext(): { editContext: { type: string } | null } } }).__canvas;
    return c.debugContext().editContext?.type ?? null;
  });
}

async function rectangles(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as { __canvas: { client: { executeScript(s: string): Promise<{ output: string[] }> } } }).__canvas;
    const r = await c.client.executeScript("JSON.stringify(paged.tree())");
    return (JSON.parse(r.output[0]).match(/"kind":"rectangle"/g) ?? []).length;
  });
}

/** Layer name, blend key and opacity (0–255) of each layer record in a PSD. */
function psdLayers(b: Buffer): Array<{ name: string; blend: string; opacity: number }> {
  let p = 26;
  p += 4 + b.readUInt32BE(p); // colour mode data
  p += 4 + b.readUInt32BE(p); // image resources
  p += 8; // layer and mask section, layer info lengths
  const count = Math.abs(b.readInt16BE(p));
  p += 2;
  const out: Array<{ name: string; blend: string; opacity: number }> = [];
  for (let i = 0; i < count; i++) {
    p += 16;
    const channels = b.readUInt16BE(p);
    p += 2 + 6 * channels;
    const blend = b.toString("latin1", p + 4, p + 8);
    const opacity = b[p + 8];
    p += 12;
    const extra = b.readUInt32BE(p);
    let q = p + 4;
    q += 4 + b.readUInt32BE(q); // mask data
    q += 4 + b.readUInt32BE(q); // blending ranges
    const name = b.toString("latin1", q + 1, q + 1 + b[q]);
    p += 4 + extra;
    out.push({ name, blend, opacity });
  }
  return out;
}

film("image", async (k) => {
  const { page, designer, pointer } = k;
  const apply = page.getByRole("button", { name: "Apply", exact: true }).first();

  await k.setup(async () => {
    await designer.open();
    await designer.newDocument();
    await k.key("v");
    await k.hold(800);
  });
  await k.roll();
  // Zooms are aimed in page points through the camera the kit logs at the
  // roll. Entering the raster context adds two bars above the canvas and
  // moves the page down, so each zoom is aimed through the LIVE camera and
  // handed to the kit in roll-time points.
  const o = await screenPoint(page, 0, 0);
  const s100 = ((await screenPoint(page, 100, 0)).x - o.x) / 100;
  const aim = async (r: [number, number, number, number]): Promise<[number, number, number, number]> => {
    const a = await pt(k, r[0], r[1]);
    const b = await pt(k, r[2], r[3]);
    return [(a.x - o.x) / s100, (a.y - o.y) / s100, (b.x - o.x) / s100, (b.y - o.y) / s100];
  };

  // ── Place a photograph, like any picture. ──
  await k.scene("place", async () => {
    const before = await rectangles(page);
    const chooser = page.waitForEvent("filechooser");
    await menuWalk(k, ["File", "Place…"]);
    k.chip(PHOTO, "file");
    await (await chooser).setFiles(join(ASSETS, PHOTO));
    await k.hold(600);
    await pointer.click(await pt(k, 60, 60), { targetWidth: 40 });
    await expect.poll(() => rectangles(page), { timeout: 10_000 }).toBe(before + 1);
    await k.hold(1200);
  });

  // ── Open it for editing where it sits: the raster context. ──
  await k.scene("open", async () => {
    await menuWalk(k, ["Plugins", "Image", "Adjust…"]);
    await expect.poll(() => status(page), { timeout: 20_000 }).toContain("2200×1469 decoded");
    await expect.poll(() => editContext(page)).toBe("rasterImage");
    await k.hold(800);
  });

  // ── Auto-enhance, then Apply. ──
  await k.scene("enhance", async () => {
    await press(k, page.locator("[data-image-auto-enhance]"));
    await k.hold(2500);
    await press(k, apply);
    await expect.poll(() => status(page), { timeout: 20_000 }).toContain("Composited 2200×1469");
    k.focus(await aim(PHOTO_AREA));
    await k.hold(2200);
  });

  // ── The healing brush, a clean source. ──
  await k.scene("heal", async () => {
    k.focus(await aim(SKY));
    await k.hold(2300);
    k.unfocus();
    // The healing brush shares a rail slot with spot heal, red eye and
    // patch: a long press on the slot opens its flyout.
    const slot = page.locator('[data-tool-slot="media.paged.image.tool.heal"]');
    await hover(k, slot);
    await page.mouse.down();
    await k.hold(450);
    await page.mouse.up();
    await press(k, page.locator('[data-tool-flyout] [data-tool="media.paged.image.tool.heal"]'));
    await expect(page.locator('[data-tool-slot="media.paged.image.tool.heal"][data-active="true"]')).toHaveCount(1);
    k.focus(await aim(SKY));
    await k.hold(900);
    await sample(k, TRAILS[0].source[0], TRAILS[0].source[1], true);
    await expect.poll(() => status(page), { timeout: 10_000 }).toContain("source set");
  });

  // ── Paint the trails away. ──
  await k.scene("heal-paint", async () => {
    for (const [i, trail] of TRAILS.entries()) {
      if (i > 0) await sample(k, trail.source[0], trail.source[1], false);
      const path = await trailPath(k, trail);
      const before = await status(page);
      await pointer.moveTo(path[0], { targetWidth: 8 });
      await pointer.paint(path, 70);
      // A new status line: this stroke's dabs, not the previous one's.
      await expect
        .poll(async () => { const now = await status(page); return now !== before && /Painted \d+ dabs/.test(now); }, { timeout: 20_000 })
        .toBe(true);
    }
    await k.hold(1800);
  });

  // ── A luminosity selection, the exposure lowered inside it. ──
  await k.scene("luma", async () => {
    k.unfocus();
    await menuWalk(k, ["Image", "Selection", "From luminosity channel"]);
    await expect.poll(() => status(page), { timeout: 10_000 }).toContain("luma channel");
    const exposure = page.locator("input[type=range]").first();
    await hover(k, exposure);
    const box = (await exposure.boundingBox())!;
    await pointer.click({ x: box.x + box.width * 0.43, y: box.y + box.height / 2 }, { targetWidth: 8 });
    await k.hold(1200);
    await press(k, apply);
    await expect.poll(() => status(page), { timeout: 20_000 }).toContain("masked to the selection");
    k.focus(await aim(PHOTO_AREA));
    await k.hold(2600);
  });

  // ── Commit into the document. ──
  await k.scene("commit", async () => {
    k.unfocus();
    await menuWalk(k, ["Image", "Commit edits to the document"]);
    await expect.poll(() => status(page), { timeout: 20_000 }).toContain("Committed revision");
    await k.hold(600);
  });

  // ── A layered PSD, opened into a frame of its own. ──
  await k.scene("psd", async () => {
    await k.key("Escape");
    await expect.poll(() => editContext(page)).toBe(null);
    await k.key("f", "Rectangle frame tool");
    await pointer.drag(await pt(k, PSD_FRAME.x0, PSD_FRAME.y0), await pt(k, PSD_FRAME.x1, PSD_FRAME.y1), { speed: 1.3 });
    const chooser = page.waitForEvent("filechooser");
    await menuWalk(k, ["File", "Open…"]);
    k.chip(PSD, "file");
    await (await chooser).setFiles(join(ASSETS, PSD));
    await expect.poll(() => status(page), { timeout: 20_000 }).toContain("400×300 decoded");
    // Clear the photo's adjustment values, which the new image inherits.
    await press(k, page.getByRole("button", { name: "Reset", exact: true }).first());
    await press(k, apply);
    await expect.poll(() => status(page), { timeout: 20_000 }).toContain("Composited 400×300");
  });

  // ── Change one, save it back as a PSD. ──
  await k.scene("psd-save", async () => {
    const rows = page.locator("[data-image-psd-layer]");
    await expect(rows).toHaveCount(3);
    await rows.first().scrollIntoViewIfNeeded();
    await hover(k, rows.nth(1));
    await k.hold(700);
    const signal = page.locator('[data-image-psd-layer="2"] [data-image-psd-opacity]');
    await press(k, signal);
    await page.keyboard.press("Meta+a");
    await page.keyboard.type("25", { delay: 90 });
    await page.keyboard.press("Enter");
    await expect(signal).toHaveValue("25");
    await k.hold(500);
    await press(k, page.getByRole("button", { name: "Export", exact: true }).last());
    await k.hold(700);
    const download = page.waitForEvent("download");
    await press(k, page.locator('[data-plugin-export="media.paged.image.exporter.psd"]'));
    const file = await download;
    k.chip(`${file.suggestedFilename()} saved`, "save");
    const saved = join(k.dir, "exported.psd");
    await file.saveAs(saved);
    const layers = psdLayers(readFileSync(saved));
    expect(layers.map((l) => `${l.name}:${l.blend}:${l.opacity}`)).toEqual([
      "Backdrop:norm:255",
      "Plate:mul :200",
      "Signal:scrn:64",
    ]);
    await k.hold(1000);
  });
});
