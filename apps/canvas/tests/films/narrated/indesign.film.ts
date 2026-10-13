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

// InDesign users, the audience film (ADR 224): the website's
// `films/indesign.yaml`. A page InDesign wrote is opened through File ▸ Open…,
// its headline is edited in place, it is saved as .paged, and its page image
// is exported; the film's terminal and comparison scenes are composed from
// the file and the image this take writes into its own directory.

import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { film, type Kit } from "../kit/film";
import { typeHuman } from "../kit/pointer";
import { hover, menu, press, screenPoint } from "../kit/ui";

const ASSETS = join(process.env.PAGED_MEDIA_ROOT ?? "", "assets");

/** Where the work happens on the 540 × 720 pt page, in page points. */
const TOP = [10, 40, 530, 420] as [number, number, number, number];
const HEADLINE = [30, 150, 330, 250] as [number, number, number, number];
/** The middle of the headline's second word, "Picture". */
const PICTURE: [number, number] = [160, 207];

const pt = (k: Kit, x: number, y: number) => screenPoint(k.page, x, y);

async function storyLengths(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as { __canvas: { client: { collection(n: string): Promise<Array<{ characterCount: number }>> } } }).__canvas;
    return (await c.client.collection("stories")).map((s) => s.characterCount);
  });
}

/** Every story XML in a saved package, as text. */
function storiesOf(file: string): string {
  const names = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).split("\n").filter((n) => /^Stories\/.*\.xml$/.test(n));
  return names.map((n) => execFileSync("unzip", ["-p", file, n], { encoding: "utf8" })).join("\n");
}

film("indesign", async (k) => {
  const { page, designer, pointer } = k;

  await k.setup(async () => {
    await designer.open();
    await designer.newDocument();
    // The page is set in Inter, the face the editor ships as its default.
    // The engine resolves InDesign's "Inter / Regular" to it but still marks
    // the text as a substituted font (a reported defect), so the editor's own
    // Inter bytes are registered once under that name: no pixel changes,
    // only the false marker goes.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: { client: { registerFont(f: string, b: Uint8Array, s: string | null): Promise<void> } } }).__canvas;
      const bytes = new Uint8Array(await (await fetch("/fonts/Inter.ttf")).arrayBuffer());
      await c.client.registerFont("Inter", bytes, "Regular");
    });
    await k.key("v");
    await k.hold(800);
  });
  await k.roll();

  // ── A page InDesign wrote, opened. ──
  await k.scene("open", async () => {
    await k.hold(300);
    const chooser = page.waitForEvent("filechooser");
    await menu(k, ["File", "Open…"]);
    k.chip("the-picture.idml", "file");
    await (await chooser).setFiles(join(ASSETS, "the-picture.idml"));
    await expect.poll(async () => (await storyLengths(page)).length, { timeout: 15_000 }).toBe(24);
    await expect(page.getByText("the-picture", { exact: true }).first()).toBeVisible();
    await k.hold(900);
    // The new document is a different page size: the camera moved.
    await k.recamera();
    k.focus(TOP);
    await k.hold(2600);
  });

  // ── The headline, edited in place; it keeps its paragraph style. ──
  await k.scene("edit", async () => {
    const before = await storyLengths(page);
    k.unfocus();
    await k.key("t", "Type tool");
    k.focus(HEADLINE);
    await k.hold(700);
    await pointer.dblclick(await pt(k, ...PICTURE), { targetWidth: 40 });
    await k.hold(400);
    await typeHuman(page, "Photograph");
    await expect
      .poll(async () => (await storyLengths(page)).map((n, i) => n - (before[i] ?? 0)).filter((d) => d !== 0))
      .toEqual([3]);
    // The control bar names the paragraph's style, as InDesign's does.
    await expect(page.locator("select").filter({ has: page.locator("option:checked", { hasText: "Chapter Title" }) }).first()).toBeVisible();
    await k.hold(1200);
    k.unfocus();
    // Out of the text by the tool rail: a key would land in the headline.
    await press(k, page.locator('[data-tool-slot="select"]'));
    await k.hold(400);
  });

  // ── Saved as .paged. ──
  const saved = join(k.dir, "the-picture.paged");
  await k.scene("save", async () => {
    const download = page.waitForEvent("download");
    await k.key("Meta+s", "Save", "⌘S");
    const file = await download;
    await file.saveAs(saved);
    k.chip(`${file.suggestedFilename()} saved`, "save");
    const text = storiesOf(saved);
    expect(text).toContain("The Photograph");
    expect(text).not.toContain("The Picture<");
    expect(text).not.toMatch(/Photograph[a-z]/);
    expect(execFileSync("unzip", ["-p", saved, "mimetype"], { encoding: "utf8" })).toBe("application/vnd.adobe.indesign-idml-package");
    await k.hold(800);
  });

  // ── Inside: the film plays the terminal session recorded on this file. ──
  await k.scene("inside", async () => {
    await k.hold(400);
  });

  // ── The page image, from the export centre. ──
  await k.scene("export", async () => {
    await press(k, page.getByRole("button", { name: "Export", exact: true }).last());
    await k.hold(700);
    await press(k, page.getByText("Page images (PNG)", { exact: true }).first());
    await k.hold(500);
    const dpi = page.locator("[data-export-image-dpi]");
    await hover(k, dpi);
    await dpi.selectOption("150");
    await k.hold(300);
    const download = page.waitForEvent("download");
    await press(k, page.getByRole("button", { name: /Export page images/ }));
    const file = await download;
    const png = join(k.dir, "paged-render.png");
    await file.saveAs(png);
    k.chip(`${file.suggestedFilename()} saved`, "save");
    const head = readFileSync(png).subarray(0, 8).toString("hex");
    expect(head, "the export is a PNG").toBe("89504e470d0a1a0a");
    await k.hold(900);
  });

  // ── InDesign's own render beside it: the film composes the comparison
  //    from this take's files; the editor holds while it shows. ──
  await k.scene("compare", async () => {
    await k.hold(400);
  });
});
