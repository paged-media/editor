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

// The top navigation: the menu bar's information architecture (groups
// that never interleave, real submenus, the Insert menu, context menus
// that follow the selection), the header that fits a 1280 px display,
// and the Design mode's selection-aware control bar.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

async function selectKinds(page: Page, kinds: string[]): Promise<void> {
  await page.evaluate(async (kinds) => {
    type Node = { id: { kind: string } | null; children?: Node[] };
    const c = (globalThis as unknown as {
      __canvas: {
        client: {
          sceneTree(): Promise<Node[]>;
          setElementSelection(ids: unknown[], mode: string): Promise<unknown[]>;
        };
        setElementSelection(ids: unknown[]): void;
      };
    }).__canvas;
    const found: unknown[] = [];
    const walk = (n: Node) => {
      if (n.id && kinds.includes(n.id.kind) && found.length < kinds.length) found.push(n.id);
      (n.children ?? []).forEach(walk);
    };
    (await c.client.sceneTree()).forEach(walk);
    c.setElementSelection(await c.client.setElementSelection(found, "replace"));
  }, kinds);
}

const triggers = (page: Page) =>
  page.$$eval("[data-menu-trigger]", (els) =>
    els.map((e) => e.getAttribute("data-menu-trigger") ?? ""),
  );

test.describe("Top navigation", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    // Through the UI's own file input, not `loadIdml` (which drives the
    // worker directly and leaves the shell believing nothing is open —
    // and the navigation is all about what the shell believes).
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect(page.locator("[data-document-chip]")).toContainText("geometry-groups", {
      timeout: 30_000,
    });
  });

  test("the core menus are fixed; plugin menus follow the selection @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    const core = ["File", "Edit", "Insert", "Object", "Type", "Layout", "View", "Plugins", "Window", "Help"];
    // A document is open and nothing is selected: no plugin menu, although
    // every plugin item reports "applies" whenever a document is open.
    await expect.poll(() => triggers(page)).toEqual(core);
    // A rectangle is something paged.draw's frame claims → Draw appears,
    // marked as a context menu.
    await selectKinds(page, ["rectangle"]);
    await expect.poll(() => triggers(page)).toEqual([...core, "Draw"]);
    await expect(page.locator('[data-menu-trigger="Draw"]')).toHaveAttribute("data-menu-context", "true");
    // A group is not → back to the core set.
    await selectKinds(page, ["group"]);
    await expect.poll(() => triggers(page)).toEqual(core);
  });

  test("every plugin has a home in Plugins: its commands and its panels @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    await page.locator('[data-menu-trigger="Plugins"]').click();
    const menu = page.getByRole("menu").first();
    for (const name of ["Data", "Draw", "Image", "Sheet", "Web"]) {
      await expect(menu.locator(`[data-menu-submenu="${name}"]`)).toBeVisible();
    }
    // Plugins ▸ Draw holds draw's command submenus AND its panels.
    await page.locator('[data-menu-submenu="Draw"]').click();
    await expect(page.locator('[data-menu-submenu="Pathfinder"]')).toBeVisible();
    await expect(page.locator('[data-menu-group-label="Panels"]')).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Symbols", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    // …and plugin panels left Window, which lists the editor's own.
    await page.locator('[data-menu-trigger="Window"]').click();
    await expect(page.locator('[data-menu-submenu="Draw"]')).toHaveCount(0);
  });

  test("groups never interleave, and nested paths are submenus @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    // Edit leads with Undo / Redo even though bundles contribute items
    // at lower orders; separators fall only between groups.
    await page.locator('[data-menu-trigger="Edit"]').click();
    const items = page.getByRole("menu").first().getByRole("menuitem");
    await expect(items.first()).toHaveText(/^Undo/);
    await expect(items.nth(1)).toHaveText(/^Redo/);
    await page.keyboard.press("Escape");

    // Object ▸ Path is a submenu, not "Path: insert point…" rows.
    await page.locator('[data-menu-trigger="Object"]').click();
    await page.locator('[data-menu-submenu="Path"]').click();
    await expect(page.getByRole("menuitem", { name: /^Outline stroke/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // Draw's 73 items collapse into submenus (Draw ▸ Pathfinder ▸ Unite).
    await selectKinds(page, ["rectangle"]);
    await page.locator('[data-menu-trigger="Draw"]').click();
    const draw = page.getByRole("menu").first();
    await expect.poll(() => draw.locator("[data-menu-submenu]").count()).toBeGreaterThan(10);
    await expect.poll(() => draw.getByRole("menuitem").count()).toBeLessThan(40);
  });

  test("Insert gathers every insert verb, the core's and the plugins' @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    await page.locator('[data-menu-trigger="Insert"]').click();
    const menu = page.getByRole("menu").first();
    for (const name of ["Text frame", "Rectangle", "Table", "Spreadsheet…", "Hyperlink…"]) {
      await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible();
    }
    await page.keyboard.press("Escape");
    // …and they left Object.
    await page.locator('[data-menu-trigger="Object"]').click();
    await expect(page.getByRole("menu").first().getByRole("menuitem", { name: /^Insert / })).toHaveCount(0);
  });

  test("accelerators use the platform's modifier; Help carries the version @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    const mac = await page.evaluate(() => /Mac/.test(navigator.platform));
    await page.locator('[data-menu-trigger="File"]').click();
    await expect(page.locator('[data-menu-accelerator="paged.file.savePaged"]')).toHaveText(mac ? "⌘S" : "Ctrl+S");
    await page.keyboard.press("Escape");
    await page.locator('[data-menu-trigger="Help"]').click();
    await expect(page.locator('[data-menu-label="paged.help.version"]')).toContainText(/engine 0\.\d+\.\d+/);
    await expect(page.getByRole("menuitem", { name: "Documentation" })).toBeVisible();
  });

  test("the header fits a 1280 px display and search collapses before anything is cut @feat:editor-shell.cockpit-modes @level:happy", async ({
    page,
  }) => {
    // The dev-only corpus picker is not part of the shipped header.
    await page.addStyleTag({ content: "header select { display: none !important }" });
    for (const width of [1280, 1024, 960]) {
      await page.setViewportSize({ width, height: 800 });
      await expect
        .poll(() => page.$eval("header", (h) => h.scrollWidth - h.clientWidth))
        .toBeLessThanOrEqual(0);
    }
    // At 960 the search field has given up its width to the menus.
    await expect(page.locator("[data-command-trigger]")).toHaveAttribute("data-compact", "true");
    await expect(page.locator("[data-document-chip]")).toContainText("geometry-groups");
  });

  test("the control bar follows the selection and writes through it @feat:editor-shell.context-toolbars @level:gesture", async ({
    page,
  }) => {
    const bar = page.locator("[data-control-bar]");
    await expect(bar).toHaveAttribute("data-control-bar", "document");
    await expect(page.locator("[data-control-page]")).toContainText("/ ");

    await selectKinds(page, ["rectangle"]);
    await expect(bar).toHaveAttribute("data-control-bar", "object");
    const w = page.locator('[data-control-field="w"] input');
    await expect(w).not.toHaveValue("");
    await w.fill("123");
    await w.press("Enter");
    await expect(w).toHaveValue("123");
    // One step on X moves the object by exactly one point.
    const x = page.locator('[data-control-field="x"] input');
    const before = Number(await x.inputValue());
    await x.focus();
    await x.press("ArrowUp");
    await x.press("Tab");
    await expect.poll(async () => Number(await x.inputValue())).toBe(before + 1);

    // Two objects bring the align buttons.
    await selectKinds(page, ["rectangle", "textFrame"]);
    await expect(page.locator('[data-cockpit-action="align-left"]')).toBeVisible();

    // A text range switches the bar to type.
    await page.evaluate(async () => {
      const c = (globalThis as unknown as {
        __canvas: {
          client: { collection(n: string): Promise<{ selfId: string }[]> };
          setContentSelection(s: unknown): void;
        };
      }).__canvas;
      const stories = await c.client.collection("stories");
      c.setContentSelection({ storyId: stories[0].selfId, start: 0, end: 4 });
    });
    await expect(bar).toHaveAttribute("data-control-bar", "text");
    await expect(page.locator('[data-control-field="font-family"]')).not.toHaveValue("__none__");
  });
});
