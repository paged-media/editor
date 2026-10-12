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

// SDK Phase 4 — menu via commands.
//
// The canvas app registers File / Edit / View commands +
// MenuItemContributions at startup; the shell's MenuBar projects
// them as DropdownMenus. This spec proves the menu items are
// reachable and invoke their commands.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

test.describe("Phase 4 — menu via commands", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  test("AC-MENU-1 — File / Edit / View menu buttons render @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    // The MenuBar renders one top-level button per registered
    // top-level menu path. With File/Open, Edit/Undo+Redo, and
    // View/Zoom* registered, all three menu buttons must appear.
    await expect(
      page
        .locator('nav[aria-label="Main menu"]')
        .getByRole("button", { name: "File" }),
    ).toBeVisible();
    await expect(
      page
        .locator('nav[aria-label="Main menu"]')
        .getByRole("button", { name: "Edit" }),
    ).toBeVisible();
    await expect(
      page
        .locator('nav[aria-label="Main menu"]')
        .getByRole("button", { name: "View" }),
    ).toBeVisible();
  });

  test("AC-MENU-2 — clicking View opens a menu listing the zoom commands @feat:editor-shell.menus @feat:editor-tools.nav.zoom @level:gesture", async ({
    page,
  }) => {
    await page
      .locator('nav[aria-label="Main menu"]')
      .getByRole("button", { name: "View" })
      .click();
    // Radix DropdownMenuContent renders into a portal; the visible
    // items should include the four zoom entries.
    await expect(page.getByRole("menuitem", { name: "Zoom in" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Zoom out" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Zoom to 100%" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Fit document" }),
    ).toBeVisible();
  });

  test("AC-MENU-3 — 'Fit document' menu item is clickable without error", async ({
    page,
  }) => {
    // Open View menu, click Fit document. The handler invokes
    // `commands.invoke("paged.view.zoomFit")` which queues a camera
    // animation; we don't observe the camera state here (it's not
    // exposed through __canvas) — the assertion is just that the
    // click doesn't throw and the menu closes.
    await page
      .locator('nav[aria-label="Main menu"]')
      .getByRole("button", { name: "View" })
      .click();
    await page.getByRole("menuitem", { name: "Fit document" }).click();
    // Menu closes after invocation.
    await expect(
      page.getByRole("menuitem", { name: "Fit document" }),
    ).not.toBeVisible();
  });

  test("AC-MENU-4 — Edit menu lists Undo and Redo as registered commands @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    await page
      .locator('nav[aria-label="Main menu"]')
      .getByRole("button", { name: "Edit" })
      .click();
    await expect(page.getByRole("menuitem", { name: "Undo" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Redo" })).toBeVisible();
  });

  test("AC-MENU-5 — File menu lists 'Open…' (registered by the shell, not the app)", async ({
    page,
  }) => {
    // The shell registers `paged.file.openIdml`; the app's menu
    // projection maps it onto File/Open…. This confirms the
    // convergence — same command id, different consumer surface.
    await page
      .locator('nav[aria-label="Main menu"]')
      .getByRole("button", { name: "File" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Open…" }),
    ).toBeVisible();
  });

  test("AC-MENU-U11 — the Window menu is grouped into category sections @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    // U11, revised: the Workspace panels stay one click deep, and every
    // other category is a SUBMENU (Window ▸ Structure ▸ Links), with the
    // plugins' panels under their names in a Plugins section. A flat menu
    // of ~110 panels was taller than the screen.
    await page
      .locator('nav[aria-label="Main menu"]')
      .getByRole("button", { name: "Window" })
      .click();
    const menu = page.getByRole("menu").first();
    await expect(menu).toBeVisible();
    // Sections are headed, and separated.
    await expect(menu.locator('[data-menu-group-label="Workspace"]')).toBeVisible();
    await expect(menu.locator('[data-menu-group-label="Panels"]')).toBeVisible();
    await expect.poll(() => menu.locator('[role="separator"]').count()).toBeGreaterThanOrEqual(1);
    // Each category is a submenu holding its panels.
    await page.locator('[data-menu-submenu="Structure"]').hover();
    await expect(page.getByRole("menuitem", { name: "Links", exact: true })).toBeVisible();
    // Moving to the next category swaps the open submenu.
    await page.locator('[data-menu-submenu="Styles"]').click();
    await expect(page.getByRole("menuitem", { name: "Swatches", exact: true })).toBeVisible();
  });
});

// ED-13 — a plugin's submenu in Plugins ▸ <name> is assembled from two
// sources: the plugin's own menu (folded in) and the shell's per-panel
// entries. They were CONCATENATED, so a panel the plugin also listed in
// its own menu appeared twice under one key (React warned "two children
// with the same key" on every open of Plugins ▸ Data / Image), and a
// panel named like one of the plugin's command submenus sat beside it
// as a second "Appearance" — two rows, one label, different things.
test.describe("ED-13 — plugin submenus", () => {
  test("AC-MENU-ED13 — every Plugins submenu lists each entry once, with unique keys @feat:editor-shell.menus @level:edge", async ({
    page,
  }) => {
    const keyWarnings: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && m.text().includes("same key")) {
        keyWarnings.push(m.text().slice(0, 300));
      }
    });
    await openCanvas(page);
    await loadIdml(page, FIXTURE);

    // Walk Plugins with the keyboard: hovering down the list crosses the
    // previous row's submenu, which Radix keeps open in its grace area.
    await page.locator('[data-menu-trigger="Plugins"]').click();
    const plugins = await page
      .locator('[role="menu"] [data-menu-submenu]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-menu-submenu")!));
    expect(plugins.length, "plugins have submenus").toBeGreaterThan(2);

    const clashes: string[] = [];
    for (const name of plugins) {
      await page.keyboard.press("ArrowDown");
      const trigger = page.locator(`[role="menu"] [data-menu-submenu="${name}"]`).first();
      await expect(trigger).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(trigger).toHaveAttribute("data-state", "open");
      const contentId = await trigger.getAttribute("aria-controls");
      const sub = page.locator(`[id="${contentId}"]`);
      await expect(sub).toBeVisible();
      const rows = await sub.evaluate((el) =>
        Array.from(el.children)
          .filter((c) => c.getAttribute("role")?.startsWith("menuitem"))
          .map((c) => (c.textContent ?? "").trim()),
      );
      const seen = new Map<string, number>();
      for (const row of rows) {
        // An accelerator rides the label's text; compare the label alone.
        const label = row.replace(/[⌘⇧⌥⌃].*$/, "").trim();
        seen.set(label, (seen.get(label) ?? 0) + 1);
      }
      for (const [label, n] of seen) {
        if (n > 1) clashes.push(`Plugins ▸ ${name}: "${label}" ×${n}`);
      }
      await page.keyboard.press("ArrowLeft");
      await expect(trigger).toHaveAttribute("data-state", "closed");
    }
    expect(clashes, "a label appears twice in one plugin submenu").toEqual([]);
    expect(keyWarnings, "React duplicate-key warnings").toEqual([]);
  });
});
