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

// C1 — plugin content types have a front door.
//
// `Object > Insert` listed five host built-ins. Spreadsheets, web
// frames, Word documents and data bindings were reachable ONLY through
// Cmd+K, where the palette renders the raw command id where a shortcut
// belongs and nobody ever sees two creation verbs side by side. That is
// how six content types came to teach six different idioms.
//
// The plugin contract has twelve contribution types and `menu` is not
// among them, so the host curates until it does. The precedent already
// exists: `File > Open PDF…` is a host menu item written for
// media.paged.pdf, which never asked for it.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

async function menuItems(page: Page): Promise<{ path: string; command: string }[]> {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __canvas: {
            registries: { menus: { list: () => { path: string; command: string }[] } };
          };
        }
      ).__canvas.registries.menus.list(),
  );
}

async function commandIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as { __canvas: { debugContext: () => { commands: string[] } } }
      ).__canvas.debugContext().commands,
  );
}

test.describe("C1 — the Insert menu reaches plugin content", () => {
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

  test("AC-INSERT-1 — every plugin content type has an Object ▸ Insert entry @feat:editor-shell.menus @feat:plugin-platform.bundle-lifecycle @level:happy", async ({
    page,
  }) => {
    const items = await menuItems(page);
    const paths = items.map((i) => i.path);

    // The five host verbs stay exactly where they were.
    for (const p of [
      "Object/Insert text frame",
      "Object/Insert rectangle",
      "Object/Insert ellipse",
      "Object/Insert line",
      "Object/Insert table",
    ]) {
      expect(paths, `${p} disappeared`).toContain(p);
    }

    for (const p of [
      "Object/Insert web frame…",
      "Object/Insert spreadsheet…",
      "Object/Insert Word document…",
      "Object/Insert data binding…",
    ]) {
      expect(paths, `${p} missing`).toContain(p);
    }
  });

  test("AC-SEAM-1 — the Data menu opens the panels its labels promise @feat:editor-shell.menus @feat:plugin-data.bindings @level:happy", async ({
    page,
  }) => {
    // D1 — these three were `soon(…)` seams whose labels duplicated three
    // LIVE pills in the Data-layout toolbar. The verbs existed and the
    // menu said they did not, so a designer reaching for the menu
    // concluded the feature was unbuilt. The seam pointed the wrong way.
    const items = await menuItems(page);
    const registered = new Set(await commandIds(page));

    // Named by id, not only by path, so the surface-coverage gate counts
    // them: it asks whether any spec mentions each registered id, and a
    // path is not an id. These are the registry-DERIVED panel-show
    // commands the shell mints for every registered panel.
    const expected = new Map([
      ["Data/Connect source…", "paged.panel.show.media.paged.data.panel.sources"],
      ["Data/Field mapping…", "paged.panel.show.media.paged.data.panel.bindings"],
      ["Data/Generate pages…", "paged.panel.show.media.paged.data.panel.dataset"],
    ]);
    for (const [path, command] of expected) {
      const entry = items.find((i) => i.path === path);
      expect(entry?.command, `${path} points somewhere unexpected`).toBe(command);
    }

    for (const path of expected.keys()) {
      const hit = items.find((i) => i.path === path);
      expect(hit, `${path} missing`).toBeTruthy();
      expect(hit!.command, `${path} is still a soon() seam`).not.toMatch(
        /^paged\.soon\./,
      );
      expect(registered.has(hit!.command), `${path} -> unregistered command`).toBe(
        true,
      );
    }
  });

  test("AC-INSERT-2 — each entry points at a command that is actually registered @feat:editor-shell.menus @level:edge", async ({
    page,
  }) => {
    // The gate is on the command EXISTING, not on a hardcoded bundle
    // list: a build without paged.sheet must show no Spreadsheet entry
    // rather than a dead one. That is the tool rail's rule — an entry
    // that accepts a click and silently does nothing is worse than an
    // empty slot, because the user reads it as a fault in their own
    // input — applied to the menu.
    const items = await menuItems(page);
    const registered = new Set(await commandIds(page));
    const pluginEntries = items.filter((i) => i.command.startsWith("media.paged."));
    expect(pluginEntries.length).toBeGreaterThanOrEqual(4);

    const dangling = pluginEntries.filter((i) => !registered.has(i.command));
    expect(
      dangling,
      `Insert entries whose command is not registered: ${JSON.stringify(dangling)}`,
    ).toEqual([]);
  });
});
