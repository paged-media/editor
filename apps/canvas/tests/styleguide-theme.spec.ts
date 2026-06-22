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

// Styleguide — dark default + theme flip re-resolves tokens.
//
// Dark is the DEFAULT editor surface (the `.dark` class is applied at
// boot and the choice persists in `localStorage["paged.theme"]`). Both
// themes are ONE token set (`:root` light + `.dark` overrides in
// shell/styles/theme.css), so the styleguide contract is: flipping the
// theme RE-RESOLVES the design-system tokens to their other-theme value
// — chrome neutrals, the snap overlay cue, and the shadcn channel all
// follow the single `dark` class, nothing is hardcoded per-theme.
//
// This is the theme axis of the styleguide matrix (the brand-kit
// `scripting.script-editor` cell rides the same spec family via the
// test-map; the persisted-default assertion is its evidence too).

import { test, expect, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

declare global {
  interface Window {
    __canvas: {
      theme: "dark" | "light";
      setTheme: (t: "dark" | "light") => void;
    };
  }
}

function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
}

async function readTokens(
  page: Page,
  names: string[],
): Promise<Record<string, string>> {
  return page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const n of names) out[n] = cs.getPropertyValue(n).trim();
    return out;
  }, names);
}

// Tokens that MUST differ between dark and light (they carry distinct
// per-theme values in theme.css). If a flip leaves any of these equal,
// something hardcoded a colour instead of riding the `dark` class.
const THEME_VARYING = [
  "--chrome-rail-bg",
  "--chrome-panel-bg",
  "--canvas-surround",
  "--pg-bg",
  "--pg-fg",
  "--overlay-snap", // nudged for contrast on dark (#14b8a6 vs #0f766e)
];

test.describe("Styleguide — theme", () => {
  test("dark is the persisted default at boot @feat:editor-shell.theme @feat:scripting.script-editor @level:smoke", async ({ page }) => {
    await openCanvas(page);
    expect(await isDark(page)).toBe(true);
    const persisted = await page.evaluate(() =>
      localStorage.getItem("paged.theme"),
    );
    // Either explicitly persisted "dark", or unset (the default resolver
    // returns dark) — never "light" on a fresh boot.
    expect(persisted === null || persisted === "dark").toBe(true);
  });

  test("flipping the theme re-resolves the design-system tokens @feat:editor-shell.theme @feat:scripting.script-editor @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const dark = await readTokens(page, THEME_VARYING);

    await page.evaluate(() => window.__canvas.setTheme("light"));
    await expect.poll(() => isDark(page)).toBe(false);
    const light = await readTokens(page, THEME_VARYING);

    // Every theme-varying token actually changed value across the flip.
    for (const name of THEME_VARYING) {
      expect(dark[name], `${name} should be set on dark`).not.toBe("");
      expect(light[name], `${name} should be set on light`).not.toBe("");
      expect(
        light[name],
        `${name} did not re-resolve on flip (dark=${dark[name]} light=${light[name]})`,
      ).not.toBe(dark[name]);
    }

    // Known design-system anchors (theme.css): the rail neutral flips
    // zinc-900→zinc-100; the snap overlay flips to the lifted teal.
    expect(dark["--chrome-rail-bg"]).toBe("#1f1f23");
    expect(light["--chrome-rail-bg"]).toBe("#f4f4f5");
    expect(dark["--overlay-snap"]).toBe("#14b8a6");
    expect(light["--overlay-snap"]).toBe("#0f766e");

    // Flip back — returns to the dark defaults exactly.
    await page.evaluate(() => window.__canvas.setTheme("dark"));
    await expect.poll(() => isDark(page)).toBe(true);
    const back = await readTokens(page, THEME_VARYING);
    expect(back).toEqual(dark);
  });

  test("the persisted choice survives a reload @feat:editor-shell.theme @feat:scripting.script-editor @level:happy", async ({ page }) => {
    await openCanvas(page);
    await page.evaluate(() => window.__canvas.setTheme("light"));
    await expect.poll(() => isDark(page)).toBe(false);

    await page.reload();
    await openCanvas(page);
    expect(await isDark(page)).toBe(false);

    // Restore the dark default so the persisted state doesn't leak into
    // other specs sharing the browser context.
    await page.evaluate(() => window.__canvas.setTheme("dark"));
    await expect.poll(() => isDark(page)).toBe(true);
  });
});
