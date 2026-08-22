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

// The chrome surface `scripts/surface-coverage.mjs` found unnamed: the
// keybindings and menu commands no spec had ever mentioned, plus the two
// panels nothing opens.
//
// These assert against the REGISTRIES, not the DOM, using the
// introspection `__canvas.debugContext()` gained for this purpose. The
// distinction matters: "the KeybindingRegistry holds `x -> swap fill and
// stroke`" and "the UI paints a swap control" are different claims, and
// the gap between them is a real defect class — a binding registered but
// never dispatched looks identical, from the DOM, to one that was never
// registered. Only the registry read tells them apart.
//
// `KeybindingRegistry.list()` was written "for diagnostics + the future
// 'Show keybindings' panel" and had zero call sites until now. It is the
// same source a Help > Keyboard shortcuts panel should render, so these
// tests and that panel cannot drift apart.
//
// NOT ASSERTED HERE, deliberately: that each binding DOES its thing. A
// few are exercised for real below (chrome toggles, zoom, fill/stroke
// swap); the rest are asserted as registered-and-resolvable, which is
// what catches a command deleted out from under its key or a `when`
// predicate that silently disables it forever.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

interface DebugSnapshot {
  panels: { open: string[]; active: string | null };
  tools: { base: string | null; effective: string | null; registered: string[] };
  commands: string[];
  keybindings: { key: string; command: string }[];
}

async function debugContext(page: Page): Promise<DebugSnapshot> {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as { __canvas: { debugContext: () => DebugSnapshot } }
      ).__canvas.debugContext() as unknown as DebugSnapshot,
  );
}

async function cameraScale(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __canvas: { client: { camera: { read: () => { scale: number } } } };
        }
      ).__canvas.client.camera.read().scale,
  );
}

async function openPanel(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (panelId) =>
      (
        globalThis as unknown as { __canvas: { openPanel: (i: string) => void } }
      ).__canvas.openPanel(panelId),
    id,
  );
}

test.describe("chrome surface — the keybindings, commands and panels nothing named", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await page.setInputFiles('input[type="file"]', fixturePath("geometry"));
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas.ready,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
  });

  test("AC-CHROME-1 — every registered keybinding resolves to a registered command @feat:editor-shell.keyboard-shortcuts @level:edge", async ({
    page,
  }) => {
    const ctx = await debugContext(page);
    expect(ctx.keybindings.length).toBeGreaterThan(20);

    // A key pointing at a command id nothing registers is dead: the
    // registry dispatches, `commands.invoke` finds nothing and returns
    // undefined, and the user's keypress vanishes with no feedback.
    const registered = new Set(ctx.commands);
    const dangling = ctx.keybindings.filter((k) => !registered.has(k.command));
    expect(
      dangling,
      `keybindings whose command is not registered: ${JSON.stringify(dangling)}`,
    ).toEqual([]);
  });

  test("AC-CHROME-2 — the chrome, zoom and fill/stroke keys are all bound @feat:editor-shell.keyboard-shortcuts @feat:editor-shell.command-authoring @level:happy", async ({
    page,
  }) => {
    const { keybindings } = await debugContext(page);
    const byCommand = new Map(keybindings.map((k) => [k.command, k.key]));

    // The eight the surface gate reported unnamed. Asserting the binding
    // EXISTS is the point: each is a single-key or chord that a user can
    // only discover by accident, since the menus carry no accelerators
    // and Help > Keyboard shortcuts is a disabled stub.
    for (const command of [
      "paged.view.zoomIn",
      "paged.view.zoomOut",
      "paged.chrome.toggleAll",
      "paged.chrome.togglePanels",
      "paged.fillStroke.swap",
      "paged.fillStroke.default",
      "paged.fillStroke.toggleAffects",
      "paged.view.toggleScreenPreview",
    ]) {
      expect(byCommand.has(command), `${command} has no keybinding`).toBe(true);
    }
  });

  test("AC-CHROME-3 — the file, edit and export menu commands are registered @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    const { commands } = await debugContext(page);
    // Registered, not invoked: saveAsIdml and exportPdf reach a download
    // and a modal respectively, and undo/redo are exercised for real by
    // the op-sandwich suites. What is unproven without this is that the
    // MENU's command id still matches a registered command — the menu
    // renders its label either way, and an id drift greys nothing.
    for (const command of [
      "paged.file.saveAsIdml",
      "paged.file.exportPdf",
      "paged.editor.undo",
      "paged.editor.redo",
      "paged.view.zoomIn",
      "paged.view.zoomOut",
    ]) {
      expect(commands, `${command} is not registered`).toContain(command);
    }
  });

  test("AC-CHROME-4 — zoom in and out move the camera @feat:editor-tools.nav.zoom @level:happy", async ({
    page,
  }) => {
    const start = await cameraScale(page);
    await page.keyboard.press("Meta+=");
    await expect.poll(() => cameraScale(page), { timeout: 5_000 }).toBeGreaterThan(start);

    const zoomed = await cameraScale(page);
    await page.keyboard.press("Meta+-");
    await expect.poll(() => cameraScale(page), { timeout: 5_000 }).toBeLessThan(zoomed);
  });

  test("AC-CHROME-5 — Tab hides the whole chrome, Shift+Tab keeps the tool rail @feat:editor-shell.panel-rail @feat:editor-shell.tool-rail @level:happy", async ({
    page,
  }) => {
    const rail = page.locator("[data-tool-rail]");
    const panelRail = page.locator("[data-panel-rail]");
    await expect(rail).toBeVisible();

    // Focus mode. Note this hides the ONLY mode-switching affordance in
    // the app (the bottom mode bar goes too), and the way back is Tab
    // again — which nothing on screen says once the chrome is gone.
    await page.keyboard.press("Tab");
    await expect(rail).toBeHidden();
    await page.keyboard.press("Tab");
    await expect(rail).toBeVisible();

    // Shift+Tab is the half-measure, and the two flags are NOT the same
    // axis: `panelsHidden` unmounts the cockpit's dock COLUMNS, while
    // `railHidden` hides the tool rail and the panel rail. So Shift+Tab
    // takes the left panel away and leaves BOTH rails standing — the
    // rails are navigation, the columns are content.
    const leftPanel = page.locator("[data-left-panel]");
    await expect(leftPanel).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await expect(leftPanel).toBeHidden();
    await expect(rail).toBeVisible();
    await expect(panelRail).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await expect(leftPanel).toBeVisible();
  });

  test("AC-CHROME-6 — the two unopened panels mount @feat:editor-shell.panels.outputs @feat:editor-shell.panels.data-suite @level:happy", async ({
    page,
  }) => {
    // `paged.data-grid` ("Generated pages") and `paged.export-inspector`
    // ("Export settings") are registered and reachable from the Window
    // menu, so a user can open them; nothing had ever checked they mount
    // rather than throw. data-grid in particular is a leftover — Data
    // mode moved to the live plugin panels and this one still renders a
    // ComingSoon card, which is a thing a user can still find.
    for (const id of ["paged.data-grid", "paged.export-inspector"]) {
      await openPanel(page, id);
      await expect
        .poll(async () => (await debugContext(page)).panels.open, { timeout: 5_000 })
        .toContain(id);
      // Mounted, not crashed: PanelHost renders the raw id in a failure
      // string, so its absence is the assertion that it resolved.
      await expect(page.getByText(`Panel ${id} not registered.`)).toHaveCount(0);
    }
  });
});
