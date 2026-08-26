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

// Visual-review lane. The bounds transposition taught the annual that a
// change-only pixel gate cannot judge LAYOUT — a page can be green and
// wrong. This renders pages from any checkpoint so a human (or a
// vision-capable reviewer) can look at them:
//
//   RENDER_PREVIEW=<path-to-.paged-or-.idml> \
//   RENDER_PAGES=1,4,5,28 \            # 1-based physical pages; default: first 10
//   npx playwright test --project=showcase --grep render-preview
//
// PNGs land in showcase/preview/. Skipped entirely when RENDER_PREVIEW
// is unset, so the normal chain never pays for it.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { CORPUS_FONTS, OUT } from "./chapter";
import { ShowcaseDoc } from "./driver";

const TARGET = process.env.RENDER_PREVIEW;

test.describe("render-preview", () => {
  test.skip(!TARGET, "RENDER_PREVIEW not set");
  test.setTimeout(10 * 60 * 1000);

  test("renders the requested pages", async ({ page }) => {
    await openCanvas(page);
    const doc = new ShowcaseDoc(page);
    await doc.registerFonts(CORPUS_FONTS);
    const count = await doc.load(TARGET as string);
    const wanted = (process.env.RENDER_PAGES ?? "")
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= count);
    const pages = wanted.length > 0 ? wanted : [...Array(Math.min(10, count)).keys()].map((i) => i + 1);
    const dir = join(OUT, "preview");
    mkdirSync(dir, { recursive: true });
    for (const physical of pages) {
      const png = await doc.renderPage(physical - 1, 1080);
      expect(png.length).toBeGreaterThan(0);
      writeFileSync(join(dir, `page-${String(physical).padStart(3, "0")}.png`), png);
    }
    // eslint-disable-next-line no-console
    console.log(`[preview] wrote ${pages.length} page(s) to ${dir}`);
  });
});
