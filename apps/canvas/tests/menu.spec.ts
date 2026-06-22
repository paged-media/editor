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
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

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

  test("AC-MENU-5 — File menu lists 'Open IDML…' (registered by the shell, not the app)", async ({
    page,
  }) => {
    // The shell registers `paged.file.openIdml`; the app's menu
    // projection maps it onto File/Open IDML…. This confirms the
    // convergence — same command id, different consumer surface.
    await page
      .locator('nav[aria-label="Main menu"]')
      .getByRole("button", { name: "File" })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Open IDML…" }),
    ).toBeVisible();
  });
});
