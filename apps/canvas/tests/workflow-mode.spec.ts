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

  test("the panel rail opens a panel as a right-dock tab and closes it", async ({
    page,
  }) => {
    await openCanvas(page);
    const item = page.locator('[data-panel-rail-item="paged.effects"]');
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute("data-active", "false");

    // Click → the panel joins the right dock as the active tab.
    await item.click();
    await expect(item).toHaveAttribute("data-active", "true");
    await expect(page.locator('[data-dock-tab="paged.effects"]')).toBeVisible();

    // Click again → the tab closes and the rail un-highlights.
    await item.click();
    await expect(item).toHaveAttribute("data-active", "false");
    await expect(page.locator('[data-dock-tab="paged.effects"]')).toHaveCount(
      0,
    );
  });
});

test.describe("Cockpit — per-mode panel sets + toolbars (D3-D4)", () => {
  test("switching modes swaps the panel set and a round-trip restores it", async ({
    page,
  }) => {
    await openCanvas(page);
    // Design default: swatches docked, ink manager not.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const c = (
            globalThis as unknown as {
              __canvas: { registries: unknown };
            }
          ).__canvas;
          return Boolean(c);
        }),
      )
      .toBe(true);

    // Cockpit slots: each mode mounts its declared left panel +
    // right dock content directly — assert by the panels' own
    // ready markers and the dock-tab hooks.

    // Switch to prepress: the Output readiness inspector appears.
    await page.evaluate(() => window.__canvas.setMode("prepress"));
    await expect(page.locator("[data-output-readiness-panel]")).toBeVisible();

    // Customise prepress: open the Effects panel via the panel rail —
    // it joins the right dock as an extra tab.
    await page.locator('[data-panel-rail-item="paged.effects"]').click();
    await expect(
      page.locator('[data-panel-rail-item="paged.effects"]'),
    ).toHaveAttribute("data-active", "true");
    await expect(page.locator('[data-dock-tab="paged.effects"]')).toBeVisible();

    // Leave and come back: the customisation survives (per-mode
    // cockpit tab state persists).
    await page.evaluate(() => window.__canvas.setMode("design"));
    await expect(
      page.locator('[data-dock-tab="paged.swatches"]'),
    ).toBeVisible();
    await page.evaluate(() => window.__canvas.setMode("prepress"));
    await expect(
      page.locator('[data-panel-rail-item="paged.effects"]'),
    ).toHaveAttribute("data-active", "true");
    await expect(page.locator('[data-dock-tab="paged.effects"]')).toBeVisible();

    // Reset for other tests.
    await page.evaluate(() => window.__canvas.setMode("design"));
  });

  test("each mode renders its toolbar segment", async ({ page }) => {
    await openCanvas(page);
    // Design: live tool pills — clicking Type activates the tool.
    await expect(
      page.locator('[data-cockpit-action="tool:paged.tool.type"]'),
    ).toBeVisible();
    await page.locator('[data-cockpit-action="tool:paged.tool.type"]').click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (globalThis as unknown as { __canvas: { activeTool: string } })
              .__canvas.activeTool,
        ),
      )
      // __canvas.activeTool surfaces the LEGACY key the canvas spine
      // routes on ("text" for the type tool), not the registry id.
      .toBe("text");

    // Export: the real PDF button.
    await page.evaluate(() => window.__canvas.setMode("export"));
    await expect(
      page.locator('[data-cockpit-action="export-pdf"]'),
    ).toBeVisible();

    // Prepress: the working-profile chip.
    await page.evaluate(() => window.__canvas.setMode("prepress"));
    await expect(
      page.locator('[data-cockpit-action="output-profile"]'),
    ).toBeVisible();

    await page.evaluate(() => window.__canvas.setMode("design"));
  });
});
