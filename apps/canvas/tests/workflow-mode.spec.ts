// Cockpit — the workflow-mode chrome (styleguide D1-D2 + C3): the
// six-mode switcher, the mode-aware context toolbar, the panel-rail
// launcher, and persistence of the active mode.

import { test, expect, type Page } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

declare global {
  interface Window {
    __canvas: {
      mode: string;
      setMode: (m: string) => void;
    };
  }
}

const MODES = ["design", "content", "prepress", "data", "review", "export"];

test.describe("Cockpit — workflow modes", () => {
  test("the switcher lists six modes; design is default and active", async ({
    page,
  }) => {
    await openCanvas(page);
    await expect(page.locator("[data-mode-switcher]")).toBeVisible();
    for (const m of MODES) {
      await expect(page.locator(`[data-mode-option="${m}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-mode-option="design"]')).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.locator("[data-context-toolbar]")).toHaveAttribute(
      "data-mode",
      "design",
    );
  });

  test("clicking a mode activates it; __canvas drives it too", async ({
    page,
  }) => {
    await openCanvas(page);
    await page.locator('[data-mode-option="prepress"]').click();
    await expect(page.locator('[data-mode-option="prepress"]')).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.locator("[data-context-toolbar]")).toHaveAttribute(
      "data-mode",
      "prepress",
    );
    expect(await page.evaluate(() => window.__canvas.mode)).toBe("prepress");

    await page.evaluate(() => window.__canvas.setMode("export"));
    await expect(page.locator('[data-mode-option="export"]')).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  test("the active mode persists across reload", async ({ page }) => {
    await openCanvas(page);
    await page.locator('[data-mode-option="review"]').click();
    await page.reload();
    await openCanvas(page);
    await expect(page.locator('[data-mode-option="review"]')).toHaveAttribute(
      "data-active",
      "true",
    );
    // Reset for other tests sharing the storage state.
    await page.evaluate(() => window.__canvas.setMode("design"));
  });

  test("the panel rail toggles a registered panel open and closed", async ({
    page,
  }) => {
    await openCanvas(page);
    const item = page.locator('[data-panel-rail-item="paged.effects"]');
    await expect(item).toBeVisible();

    const wasActive = (await item.getAttribute("data-active")) === "true";
    await item.click();
    await expect(item).toHaveAttribute(
      "data-active",
      wasActive ? "false" : "true",
    );
    await item.click();
    await expect(item).toHaveAttribute(
      "data-active",
      wasActive ? "true" : "false",
    );
  });
});
