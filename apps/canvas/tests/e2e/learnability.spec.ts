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

// Phase E — the app can be learned from inside the app.
//
// Nothing listed a shortcut anywhere: the menus rendered a label and, for
// seams, a `soon` pill; the palette showed raw command ids where every
// other application puts the key; and `Help` — the app's one offer to
// explain itself — had two items, both disabled seams.
// `KeybindingRegistry.list()`, documented as existing "for diagnostics +
// the future 'Show keybindings' panel", had zero call sites.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

const openPanel = (page: Page, id: string) =>
  page.evaluate(
    (panelId) =>
      (
        globalThis as unknown as { __canvas: { openPanel: (i: string) => void } }
      ).__canvas.openPanel(panelId),
    id,
  );

test.describe("Phase E — learnability", () => {
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

  test("AC-LEARN-1 — Help ▸ Keyboard shortcuts opens a panel built from the live registry @feat:editor-shell.keyboard-shortcuts @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    const items = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas: {
              registries: { menus: { list: () => { path: string; command: string }[] } };
            };
          }
        ).__canvas.registries.menus.list(),
    );
    const help = items.find((i) => i.path === "Help/Keyboard shortcuts");
    expect(help, "Help ▸ Keyboard shortcuts is missing").toBeTruthy();
    // Named by id so the surface-coverage gate counts it: the gate asks
    // whether any spec mentions each registered id, and a path is not an
    // id. This is the registry-derived panel-show command.
    expect(help!.command).toBe("paged.panel.show.paged.keyboard-shortcuts");

    await openPanel(page, "paged.keyboard-shortcuts");
    await expect(page.locator("[data-keyboard-shortcuts-panel]")).toBeVisible();

    // Rendered from `KeybindingRegistry.list()`, so what it shows is what
    // the app will actually do — not a hand-kept table that can drift.
    const rows = page.locator("[data-shortcut-row]");
    await expect
      .poll(() => rows.count(), { timeout: 5_000 })
      .toBeGreaterThan(10);

    // And it admits what it cannot see. ~2 dozen bindings never reach the
    // registry (undo/redo, zoom, page nav, spring-loaded holds); a panel
    // that silently omitted them would look complete and be wrong, which
    // is a worse lie than the seam it replaces.
    await expect(page.locator("[data-shortcut-adhoc-note]")).toBeVisible();
    await expect(page.locator('[data-shortcut-adhoc="Undo"]')).toBeVisible();
  });

  test("AC-LEARN-3 — the Window menu is grouped by heading and free of developer panels @feat:editor-shell.menus @feat:editor-shell.panel-rail @level:happy", async ({
    page,
  }) => {
    const items = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas: {
              registries: { menus: { list: () => { path: string; command: string }[] } };
            };
          }
        ).__canvas.registries.menus.list(),
    );
    const windowItems = items.filter((i) => i.path.startsWith("Window/"));
    expect(windowItems.length).toBeGreaterThan(20);

    // E6 — these are developer surfaces. They stay REGISTERED and
    // openable (openPanel, the palette, any spec); they are simply not
    // offered to a designer browsing for a workspace, where they sat
    // indistinguishable from ninety real panels.
    for (const dev of [
      "paged.panel.show.paged.repl",
      "paged.panel.show.paged.script-editor",
      "paged.panel.show.paged.schema-list-demo",
      "paged.panel.show.paged.schema-tree-demo",
    ]) {
      expect(
        windowItems.map((i) => i.command),
        `${dev} is a developer surface and must not be in the Window menu`,
      ).not.toContain(dev);
    }

    // …and they are still reachable, which is the half that makes the
    // above safe rather than a removal.
    await openPanel(page, "paged.repl");
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(
              () =>
                (
                  globalThis as unknown as {
                    __canvas: { debugContext: () => { panels: { open: string[] } } };
                  }
                ).__canvas.debugContext().panels.open,
            )
          ).includes("paged.repl"),
        { timeout: 5_000 },
      )
      .toBe(true);

    // E4 — the Window menu computed its group headings all along and
    // MenuBar dropped them, so ~90 entries read as one flat list divided
    // by unlabelled hairlines. A separator says "these differ"; a
    // heading says how.
    await page.locator('[data-menu-trigger="Window"]').click();
    await expect(
      page.locator("[data-menu-group-label]").first(),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("AC-LEARN-2 — the menus carry an accelerator column @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    // Cmd+D for Place is bound and was undiscoverable from the one
    // surface that exists to list what the app can do. Tools advertised
    // their keys in rail tooltips all along; commands never did.
    await page.locator('[data-menu-trigger="Object"]').click();
    const accel = page.locator(
      '[data-menu-accelerator="paged.object.group"]',
    );
    await expect(accel).toBeVisible();
    await expect(accel).toHaveText("⌘G");
    await page.keyboard.press("Escape");
  });
});
