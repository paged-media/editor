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

// paged.slide: File ▸ Open of a PowerPoint deck. The importer (resolved
// through the host importer registry, the path File ▸ Open and drag-and-drop
// take) writes the whole deck as one IDML package and opens it as the
// document: a page per slide at the slide size, with the slides' content
// drawn.

import { expect, test, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Designer } from "../driver/designer";

const PPTX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/slide-deck.pptx",
);
const PPTX_IMPORTER = "media.paged.slide.importer.pptx";


/** Open the fixture deck through the host's importer registry (the path
 *  File ▸ Open takes). Answers the importer id, or why there was none. */
async function importDeck(page: Page): Promise<string> {
    const bytes = [...readFileSync(PPTX_FIXTURE)];
  return page.evaluate(
    async ({ bytes, name }) => {
      const reg = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              importers?: {
                resolve: (
                  fileName: string,
                  mimeType?: string,
                ) => {
                  id?: string;
                  import: (args: { name: string; bytes: Uint8Array; mimeType?: string }) => Promise<void>;
                } | null;
              };
            };
          };
        }
      ).__canvas.registries.importers;
      if (!reg) return "host serves no importer registry";
      const imp = reg.resolve(name);
      if (!imp) return "no importer resolved for .pptx";
      await imp.import({ name, bytes: new Uint8Array(bytes), mimeType: "" });
      return imp.id ?? "imported";
    },
    { bytes, name: "slide-deck.pptx" },
  );
}

test.describe("journey · paged.slide plugin", () => {
  test("a designer opens a PowerPoint deck and gets a page per slide @feat:plugin-slide.import-native @feat:editor-shell.plugin-bundles @level:smoke", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const imported = await importDeck(page);
    expect(imported).toBe(PPTX_IMPORTER);

    // The deck replaced the blank document: ten slides, 16:9 at 960 × 540 pt.
    await expect.poll(async () => (await designer.handle()).pageCount, { timeout: 20_000 }).toBe(10);
    const handle = await designer.handle();
    for (const [w, h] of handle.pageSizesPt) {
      expect(Math.round(w)).toBe(960);
      expect(Math.round(h)).toBe(540);
    }

    // The first slide (title layout) draws its title and subtitle: its
    // snapshot is not a blank page.
    const png = await designer.renderBytes({ widthPx: 960 });
    const inked = await page.evaluate(async (bytes) => {
      const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext("2d")!;
      g.drawImage(bmp, 0, 0);
      const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] < 200 || px[i + 1] < 200 || px[i + 2] < 200) n++;
      return n;
    }, [...png]);
    expect(inked, "the title slide draws its text").toBeGreaterThan(1500);
  });

  test("the Slides panel shows a thumbnail per slide and goes to the one clicked; the Notes panel keeps notes on the slide @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    expect(await importDeck(page)).toBe(PPTX_IMPORTER);
    await expect.poll(async () => (await designer.handle()).pageCount, { timeout: 20_000 }).toBe(10);

    await designer.openPanel("media.paged.slide.panel.slides");
    const panel = page.locator('[data-slides-panel="ready"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator("[data-slide]")).toHaveCount(10);
    // Every slide gets its thumbnail from the engine's renderer.
    await expect(panel.locator("[data-slide] img")).toHaveCount(10, { timeout: 30_000 });

    // Clicking slide 4 brings it into view; the panel marks it.
    const fourth = panel.locator("[data-slide]").nth(3);
    const pageId = await fourth.getAttribute("data-slide");
    await fourth.locator("button").first().click();
    await expect(fourth).toHaveAttribute("data-active", "true", { timeout: 10_000 });

    // Notes typed for the slide land on its page as plugin metadata.
    await designer.openPanel("media.paged.slide.panel.notes");
    const notes = page.locator("[data-notes-text]");
    await expect(page.locator('[data-notes-panel="ready"]')).toContainText("Slide 4");
    await notes.fill("Mention the Q3 numbers\nthen hand over");
    await notes.blur();
    await expect
      .poll(async () => {
        const pages = await designer.collection("pages");
        const p = pages.find((x) => x.selfId === pageId) as
          | { pluginMetadata?: { key: string; value: string }[] }
          | undefined;
        const v = p?.pluginMetadata?.find((m) => m.key === "x-paged:media.paged.slide")?.value;
        return v ? (JSON.parse(v) as { data: { notes?: string } }).data.notes : null;
      })
      .toBe("Mention the Q3 numbers\nthen hand over");
  });
});
