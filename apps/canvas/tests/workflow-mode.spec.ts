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
  test("the switcher lists six modes; design is default and active @feat:editor-shell.cockpit-modes @level:happy", async ({
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

  test("clicking a mode activates it; __canvas drives it too @feat:editor-shell.cockpit-modes @level:happy", async ({
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

  test("the active mode persists across reload @feat:editor-shell.cockpit-modes @level:happy", async ({
    page,
  }) => {
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

  test("the panel rail opens a panel as a right-dock tab and closes it @feat:editor-shell.cockpit-modes @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const item = page.locator('[data-panel-rail-item="paged.object-styles"]');
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute("data-active", "false");

    // Click → the panel joins the right dock as the active tab.
    await item.click();
    await expect(item).toHaveAttribute("data-active", "true");
    await expect(
      page.locator('[data-dock-tab="paged.object-styles"]'),
    ).toBeVisible();

    // Click again → the tab closes and the rail un-highlights.
    await item.click();
    await expect(item).toHaveAttribute("data-active", "false");
    await expect(
      page.locator('[data-dock-tab="paged.object-styles"]'),
    ).toHaveCount(0);
  });
});

test.describe("Cockpit — per-mode panel sets + toolbars (D3-D4)", () => {
  test("switching modes swaps the panel set and a round-trip restores it @feat:editor-shell.cockpit-modes @level:happy", async ({
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
    await page.locator('[data-panel-rail-item="paged.object-styles"]').click();
    await expect(
      page.locator('[data-panel-rail-item="paged.object-styles"]'),
    ).toHaveAttribute("data-active", "true");
    await expect(
      page.locator('[data-dock-tab="paged.object-styles"]'),
    ).toBeVisible();

    // Leave and come back: the customisation survives (per-mode
    // cockpit tab state persists).
    await page.evaluate(() => window.__canvas.setMode("design"));
    await expect(
      page.locator('[data-dock-tab="paged.swatches"]'),
    ).toBeVisible();
    await page.evaluate(() => window.__canvas.setMode("prepress"));
    await expect(
      page.locator('[data-panel-rail-item="paged.object-styles"]'),
    ).toHaveAttribute("data-active", "true");
    await expect(
      page.locator('[data-dock-tab="paged.object-styles"]'),
    ).toBeVisible();

    // Reset for other tests.
    await page.evaluate(() => window.__canvas.setMode("design"));
  });

  test("each mode renders its toolbar segment @feat:editor-shell.cockpit-modes @level:happy", async ({
    page,
  }) => {
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

// W2.8 — context toolbars carry REAL pills (selection/context-aware
// quick actions) or HONEST disabled seams, never fake-interactive.
// Each test proves a pill's real effect via observable UI state (a
// dock tab activating, a toggle pill flipping `data-on`, a pill's
// honest-disabled state) — no document load required for the chrome.
test.describe("Cockpit — per-mode REAL context-toolbar pills (W2.8)", () => {
  const setMode = (page: Page, m: string) =>
    page.evaluate((mode) => window.__canvas.setMode(mode), m);

  test("Design — Preview pill reflects the real screen mode @feat:editor-shell.cockpit-modes @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const preview = page.locator('[data-cockpit-action="preview-toggle"]');
    await expect(preview).toBeVisible();
    await expect(preview).not.toHaveAttribute("data-on", "");
    // Click toggles the real screen-mode state — the pill fills.
    await preview.click();
    await expect(preview).toHaveAttribute("data-on", "");
    await preview.click();
    await expect(preview).not.toHaveAttribute("data-on", "");
  });

  test("Content — formatting raises are honest-disabled with no text selection @feat:editor-shell.cockpit-modes @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await setMode(page, "content");
    const character = page.locator('[data-cockpit-action="content-character"]');
    await expect(character).toBeVisible();
    // No caret → honest disabled, with an explanatory tooltip.
    await expect(character).toBeDisabled();
    await expect(character).toHaveAttribute(
      "title",
      /caret in text to format characters/i,
    );
    // The live selection readout reports "No text selection".
    await expect(
      page.locator('[data-cockpit-action="content-selection"]'),
    ).toHaveText(/no text selection/i);
    await setMode(page, "design");
  });

  test("Content — a text selection enables + drives the Character raise @feat:editor-shell.cockpit-modes @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await setMode(page, "content");
    // Drive a content selection through the __canvas debug setter
    // (the same affordance the Character-panel specs use). This flips
    // the toolbar's caret-awareness without a loaded story.
    await page.evaluate(() => {
      const c = globalThis as unknown as {
        __canvas: {
          setContentSelection: (sel: {
            storyId: string;
            start: number;
            end: number;
          }) => void;
        };
      };
      c.__canvas.setContentSelection({ storyId: "story-1", start: 0, end: 4 });
    });
    const character = page.locator('[data-cockpit-action="content-character"]');
    await expect(character).toBeEnabled();
    await expect(
      page.locator('[data-cockpit-action="content-selection"]'),
    ).toHaveText(/text selected/i);
    // Clicking raises the Character formatting dock — a REAL, observable
    // effect (the panel joins the right dock as the active tab).
    await character.click();
    await expect(
      page.locator('[data-dock-tab="paged.character"][data-active]'),
    ).toBeVisible();
    await setMode(page, "design");
  });

  test("Prepress — the Bleed pill drives the real screen mode @feat:editor-shell.cockpit-modes @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await setMode(page, "prepress");
    const bleed = page.locator('[data-cockpit-action="prepress-bleed"]');
    await expect(bleed).toBeVisible();
    await expect(bleed).not.toHaveAttribute("data-on", "");
    await bleed.click();
    await expect(bleed).toHaveAttribute("data-on", "");
    await bleed.click();
    await expect(bleed).not.toHaveAttribute("data-on", "");
    // Validate is honest-disabled until a document is loaded.
    await expect(
      page.locator('[data-cockpit-action="prepress-validate"]'),
    ).toBeDisabled();
    await setMode(page, "design");
  });

  test("Data — the Field-mapping pill raises its dock (real focus) @feat:editor-shell.cockpit-modes @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await setMode(page, "data");
    const mapping = page.locator('[data-cockpit-action="data-mapping"]');
    await expect(mapping).toBeEnabled();
    // The LIVE paged.data bindings panel is Data mode's seeded inspector,
    // so the pill reads as the active panel and its content renders — a
    // REAL, observable focus state (`data-on` + the panel body present).
    await mapping.click();
    await expect(mapping).toHaveAttribute("data-on", "");
    await expect(page.locator('text="Wire demo binding"')).toBeVisible();
    // Connect source / Generate are REAL pills now (they raise the live
    // sources / dataset panels), not ComingSoon seams.
    await expect(
      page.locator('[data-cockpit-action="data-sources"]'),
    ).toBeEnabled();
    await expect(
      page.locator('[data-cockpit-action="data-generate"]'),
    ).toBeEnabled();
    await setMode(page, "design");
  });

  test("Review — the Comments pill raises its dock (real focus) @feat:editor-shell.cockpit-modes @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await setMode(page, "review");
    const comments = page.locator('[data-cockpit-action="review-comments"]');
    await expect(comments).toBeEnabled();
    await comments.click();
    await expect(
      page.locator('[data-dock-tab="paged.comments"][data-active]'),
    ).toBeVisible();
    await expect(comments).toHaveAttribute("data-on", "");
    await setMode(page, "design");
  });

  test("Export — the image pill is honest-disabled with no document @feat:editor-shell.cockpit-modes @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await setMode(page, "export");
    // No document open → the LIVE output honestly disables. (The IDML pill is
    // gone — IDML is the paged.publish plugin exporter now, ADR-022 Phase 5.)
    await expect(
      page.locator('[data-cockpit-action="export-image"]'),
    ).toBeDisabled();
    await setMode(page, "design");
  });
});
