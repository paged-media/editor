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

// Design system — the editor theme. Dark is the DEFAULT surface;
// light is one toggle away and the choice persists. Both themes are
// one token set (`:root` + `.dark` in shell/styles/theme.css), so
// the assertion surface is the `dark` class on <html> plus a couple
// of resolved token probes (chrome + dockview follow automatically).

import { test, expect, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

async function htmlIsDark(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
}

test.describe("Design system — theme", () => {
  test("dark is the default and tokens resolve @feat:editor-shell.theme @level:happy", async ({ page }) => {
    await openCanvas(page);
    expect(await htmlIsDark(page)).toBe(true);
    const probes = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        railBg: s.getPropertyValue("--chrome-rail-bg").trim(),
        surround: s.getPropertyValue("--canvas-surround").trim(),
        fontSans: s.getPropertyValue("--font-sans").trim(),
        bodyFont: getComputedStyle(document.body).fontFamily,
      };
    });
    expect(probes.railBg).toBe("#1f1f23");
    expect(probes.surround).toBe("#0e0e10");
    expect(probes.fontSans).toContain("IBM Plex Sans");
    expect(probes.bodyFont).toContain("IBM Plex Sans");
  });

  test("toggle flips to light and persists across reload @feat:editor-shell.theme @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await page.evaluate(() => window.__canvas.setTheme("light"));
    await expect.poll(() => htmlIsDark(page)).toBe(false);
    const railBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--chrome-rail-bg")
        .trim(),
    );
    expect(railBg).toBe("#f4f4f5");

    // The choice survives a reload (localStorage).
    await page.reload();
    await openCanvas(page);
    expect(await htmlIsDark(page)).toBe(false);
    // …and back to dark.
    await page.evaluate(() => window.__canvas.setTheme("dark"));
    await expect.poll(() => htmlIsDark(page)).toBe(true);
  });

  test("the IBM Plex faces actually load @feat:editor-shell.theme @level:happy", async ({ page }) => {
    await openCanvas(page);
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        sans: document.fonts.check("13px 'IBM Plex Sans'"),
        mono: document.fonts.check("12px 'IBM Plex Mono'"),
      };
    });
    expect(loaded.sans).toBe(true);
    expect(loaded.mono).toBe(true);
  });
});
