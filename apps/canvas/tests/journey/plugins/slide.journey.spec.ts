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

import { expect, test } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Designer } from "../driver/designer";

const PPTX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/slide-deck.pptx",
);
const PPTX_IMPORTER = "media.paged.slide.importer.pptx";

test.describe("journey · paged.slide plugin", () => {
  test("a designer opens a PowerPoint deck and gets a page per slide @feat:plugin-slide.import-native @feat:editor-shell.plugin-bundles @level:smoke", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const bytes = [...readFileSync(PPTX_FIXTURE)];
    const imported = await page.evaluate(
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
});
