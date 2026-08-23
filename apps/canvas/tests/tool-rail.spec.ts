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

// Concept 1 — tool rail acceptance (replaces the retired dock
// Tools-panel spec; the rail is the only tool surface, AC-9).
//
// Covers: registry-driven slots (AC-1/2), click + single-key
// activation (AC-3), the contentSelection==null text-suppression
// guard (AC-4), spring-loaded Space → momentary Hand (AC-5), flyout
// reveal + promote (AC-2), Alt+click group cycling, the screen-mode
// selector (AC-8, view state only), the fill/stroke cluster mount
// (AC-7 surface), Tab / Shift+Tab chrome hide, and the honest-stub
// contract for `status: "planned"` tools (AC-RAIL-11).

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

test.describe("Concept 1 — tool rail", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-RAIL-1 — rail mounts with registry-driven slots @feat:editor-shell.tool-rail @level:smoke", async ({
    page,
  }) => {
    await expect(page.locator('[data-tool-rail="ready"]')).toBeVisible();
    // One slot per flyout group; spot-check the four sections.
    for (const group of ["select", "type", "pen", "shape", "transform", "hand"]) {
      await expect(page.locator(`[data-tool-slot="${group}"]`)).toBeVisible();
    }
    // Selection is the default active tool.
    await expect(
      page.locator('[data-tool-slot="select"][data-active="true"]'),
    ).toBeVisible();
  });

  test("AC-RAIL-2 — click and single-key shortcut set the tool @feat:editor-shell.tool-rail @feat:editor-shell.keyboard-shortcuts @level:gesture", async ({
    page,
  }) => {
    // Click the Type slot.
    await page.locator('[data-tool-slot="type"]').click();
    await expect(
      page.locator('[data-tool-slot="type"][data-active="true"]'),
    ).toBeVisible();
    // Press M → Rectangle (the `shape` slot).
    await page.keyboard.press("m");
    await expect(
      page.locator('[data-tool-slot="shape"][data-active="true"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-tool-slot="type"][data-active="false"]'),
    ).toBeVisible();
  });

  test("AC-RAIL-3 — tool shortcuts are inert while a text caret is active @feat:editor-shell.tool-rail @level:gesture", async ({
    page,
  }) => {
    // Seed a (synthetic) content selection — the guard only checks
    // that a caret exists, not that the story resolves.
    await page.evaluate(() => {
      (
        window as unknown as {
          __canvas: {
            setContentSelection: (
              sel: { storyId: string; start: number; end: number } | null,
            ) => void;
          };
        }
      ).__canvas.setContentSelection({ storyId: "story0", start: 0, end: 0 });
    });
    await page.keyboard.press("m");
    // Still Selection — the shortcut was suppressed.
    await expect(
      page.locator('[data-tool-slot="select"][data-active="true"]'),
    ).toBeVisible();
    // Clear the caret → the same key now switches tools.
    await page.evaluate(() => {
      (
        window as unknown as {
          __canvas: { setContentSelection: (sel: null) => void };
        }
      ).__canvas.setContentSelection(null);
    });
    await page.keyboard.press("m");
    await expect(
      page.locator('[data-tool-slot="shape"][data-active="true"]'),
    ).toBeVisible();
  });

  test("AC-RAIL-4 — holding Space spring-loads a momentary Hand @feat:editor-shell.tool-rail @feat:editor-tools.nav.pan @level:happy", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-tool-slot="select"][data-active="true"]'),
    ).toBeVisible();
    await page.keyboard.down(" ");
    await expect(
      page.locator('[data-tool-slot="hand"][data-active="true"]'),
    ).toBeVisible();
    await page.keyboard.up(" ");
    // Reverts to the base tool on release.
    await expect(
      page.locator('[data-tool-slot="select"][data-active="true"]'),
    ).toBeVisible();
  });

  test("AC-RAIL-5 — flyout reveals hidden tools and promotes the pick @feat:editor-shell.tool-rail @level:happy", async ({
    page,
  }) => {
    // Right-click opens the Pen flyout (long-press is the other path).
    await page.locator('[data-tool-slot="pen"]').click({ button: "right" });
    const flyout = page.locator('[data-tool-flyout="pen"]');
    await expect(flyout).toBeVisible();
    // The "pen" slot's members: the built-in Pen (group default) plus
    // the three anchor-editing tools the paged.draw BUNDLE contributes
    // into the same slot (namespaced `media.paged.draw.tool.*` since the
    // D-series refactor moved them out of the inline catalog).
    const addAnchor = "media.paged.draw.tool.addAnchor";
    for (const id of [
      "paged.tool.pen",
      addAnchor,
      "media.paged.draw.tool.deleteAnchor",
      "media.paged.draw.tool.convertAnchor",
    ]) {
      await expect(flyout.locator(`[data-tool="${id}"]`)).toBeVisible();
    }
    // Pick Add Anchor → it becomes the slot face and the active tool.
    await flyout.locator(`[data-tool="${addAnchor}"]`).click();
    await expect(
      page.locator(
        `[data-tool-slot="pen"][data-tool="${addAnchor}"][data-active="true"]`,
      ),
    ).toBeVisible();
  });

  test("AC-RAIL-6 — Alt+click cycles the slot through its group @feat:editor-shell.tool-rail @level:gesture", async ({
    page,
  }) => {
    const shape = page.locator('[data-tool-slot="shape"]');
    await shape.click(); // Rectangle (group default)
    await expect(
      page.locator('[data-tool-slot="shape"][data-tool="paged.tool.rectangle"]'),
    ).toBeVisible();
    await shape.click({ modifiers: ["Alt"] }); // → Ellipse
    await expect(
      page.locator('[data-tool-slot="shape"][data-tool="paged.tool.ellipse"]'),
    ).toBeVisible();
    await shape.click({ modifiers: ["Alt"] }); // → Polygon
    await expect(
      page.locator('[data-tool-slot="shape"][data-tool="paged.tool.polygon"]'),
    ).toBeVisible();
  });

  test("AC-RAIL-7 — screen-mode selector is view state only @feat:editor-shell.tool-rail @level:happy", async ({
    page,
  }) => {
    await expect(page.locator('[data-screen-mode="normal"]')).toBeVisible();
    await page.locator('[data-screen-mode="normal"]').click();
    await page.locator('[data-screen-mode-option="preview"]').click();
    await expect(page.locator('[data-screen-mode="preview"]')).toBeVisible();
    // W toggles back to Normal (text-suppressed like tool shortcuts).
    await page.keyboard.press("w");
    await expect(page.locator('[data-screen-mode="normal"]')).toBeVisible();
  });

  test("AC-RAIL-8 — fill/stroke cluster mounts at the rail foot @feat:editor-shell.tool-rail @level:smoke", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-fill-stroke-cluster="ready"]'),
    ).toBeVisible();
    await expect(page.locator('[data-well="fill"]')).toBeVisible();
    await expect(page.locator('[data-well="stroke"]')).toBeVisible();
  });

  test("AC-RAIL-9 — Tab hides the chrome and Tab restores it @feat:editor-shell.tool-rail @level:happy", async ({
    page,
  }) => {
    await expect(page.locator('[data-tool-rail="ready"]')).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.locator('[data-tool-rail="ready"]')).toBeHidden();
    await page.keyboard.press("Tab");
    await expect(page.locator('[data-tool-rail="ready"]')).toBeVisible();
  });

  test("AC-RAIL-10 — tear-off opens a floating palette for the group @feat:editor-shell.tool-rail @level:happy", async ({
    page,
  }) => {
    await page.locator('[data-tool-slot="shape"]').click({ button: "right" });
    await page.locator('[data-tool-tearoff="shape"]').click();
    const palette = page.locator('[data-tool-palette="shape"]');
    await expect(palette).toBeVisible();
    // Picking from the palette activates the tool.
    await palette.locator('[data-tool="paged.tool.ellipse"]').click();
    await expect(
      page.locator('[data-tool-slot="shape"][data-tool="paged.tool.ellipse"]'),
    ).toBeVisible();
    await palette.locator("[data-tool-palette-close]").click();
    await expect(palette).toBeHidden();
  });

  test("AC-RAIL-11 — planned tools are visible stubs, never silent no-ops @feat:editor-shell.tool-rail @level:happy", async ({
    page,
  }) => {
    // The rail still SHOWS the not-yet-built tools (the toolbox reads
    // complete and the eventual home of each is visible) …
    const gap = page.locator('[data-tool-slot="gap"]');
    await expect(gap).toBeVisible();
    // … but marks them as stubs rather than accepting a click and then
    // doing nothing, which reads to the user as a bug in their input.
    await expect(gap).toHaveAttribute("data-tool-status", "planned");
    await expect(gap).toHaveAttribute("aria-disabled", "true");
    await expect(gap).toHaveAttribute("title", /coming soon/i);

    // Clicking one does NOT become the active tool. `force` because
    // `aria-disabled` already makes Playwright's actionability check
    // refuse the click — which is itself the point: the affordance
    // reads as disabled to automation and assistive tech. A real
    // pointer still reaches the React handler, so force the click and
    // assert the handler declines it.
    await gap.click({ force: true });
    await expect(gap).toHaveAttribute("data-active", "false");
    await expect(
      page.locator('[data-tool-slot="select"][data-active="true"]'),
    ).toBeVisible();

    // A planned tool contributes no activation command either — a
    // command-palette entry that does nothing is the same lie.
    const hasCommand = await page.evaluate(() =>
      Boolean(
        (
          globalThis as unknown as {
            __canvas: {
              registries: { commands: { get: (id: string) => unknown } };
            };
          }
        ).__canvas.registries.commands.get(
          "paged.tool.activate.paged.tool.gap",
        ),
      ),
    );
    expect(hasCommand).toBe(false);

    // A planned member never takes the slot FACE from a working
    // sibling: Free Transform is planned, so the transform slot faces
    // Rotate (which drives the engine's rotate gesture arm).
    await expect(
      page.locator('[data-tool-slot="transform"]'),
    ).toHaveAttribute("data-tool", "paged.tool.rotate");
  });

  test("AC-RAIL-12 — the frame slot draws (its three tools are wired) @feat:editor-shell.tool-rail @feat:editor-tools.draw.rectangle @level:happy", async ({
    page,
  }) => {
    // Rectangle Frame is the slot's group default and carries a real
    // gesture — the rail's `f` promise. Alt+click cycles to the other
    // two, which are wired to the Ellipse / Polygon handlers.
    const frame = page.locator('[data-tool-slot="frame"]');
    await frame.click();
    await expect(
      page.locator(
        '[data-tool-slot="frame"][data-tool="paged.tool.rectangleFrame"][data-active="true"]',
      ),
    ).toBeVisible();
    const hasGesture = (id: string) =>
      page.evaluate(
        (toolId) =>
          Boolean(
            (
              globalThis as unknown as {
                __canvas: {
                  registries: {
                    tools: { get: (id: string) => { gesture?: unknown } | undefined };
                  };
                };
              }
            ).__canvas.registries.tools.get(toolId)?.gesture,
          ),
        id,
      );
    expect(await hasGesture("paged.tool.rectangleFrame")).toBe(true);
    expect(await hasGesture("paged.tool.ellipseFrame")).toBe(true);
    expect(await hasGesture("paged.tool.polygonFrame")).toBe(true);
    await frame.click({ modifiers: ["Alt"] });
    await expect(
      page.locator(
        '[data-tool-slot="frame"][data-tool="paged.tool.ellipseFrame"]',
      ),
    ).toBeVisible();
  });
});
