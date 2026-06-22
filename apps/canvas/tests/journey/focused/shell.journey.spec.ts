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

// Journey: the publishing cockpit's chrome.
//
// Before touching content, a designer meets the shell itself — flips the
// theme, walks the six workflow modes, and relies on the menus / tool-rail /
// panel-rail / keyboard-shortcut / file-intake registries all being wired,
// with the plugin bundles having contributed their commands. This proves the
// cockpit shell aspects the content journeys take for granted.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

// The six cockpit workflow modes (apps/canvas/src/cockpit-modes.ts).
const MODES = ["design", "content", "prepress", "data", "review", "export"];

interface ShellCanvas {
  theme: string;
  setTheme: (t: string) => void;
  mode: string;
  setMode: (m: string) => void;
  registries: {
    commands: { list: () => Array<{ id: string }> };
    menus: { list: () => unknown[] };
    tools: { list: () => unknown[] };
    panels: { list: () => unknown[] };
    keybindings: { list: () => unknown[] };
    importers: { acceptExtensions: () => string[] };
  };
}

test.describe("journey · editor shell", () => {
  test("flip theme, walk the workflow modes, lean on the wired registries @feat:editor-shell.theme @feat:editor-shell.cockpit-modes @feat:editor-shell.menus @feat:editor-shell.tool-rail @feat:editor-shell.panel-rail @feat:editor-shell.keyboard-shortcuts @feat:editor-shell.file-intake @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    // newDocument() already drives the real File ▸ New command — the
    // file-intake "new" path — so the document exists by the time we probe.
    await designer.newDocument();

    // THEME — flip to light, confirm it took, restore the dark default.
    // `__canvas` is republished every render, so re-read it after each
    // setter rather than trusting the captured object's stale field.
    const themeFlip = await page.evaluate(async () => {
      const g = () =>
        (globalThis as unknown as { __canvas: ShellCanvas }).__canvas;
      g().setTheme("light");
      await new Promise((r) => setTimeout(r, 80));
      const light = g().theme;
      g().setTheme("dark");
      await new Promise((r) => setTimeout(r, 80));
      return { light, after: g().theme };
    });
    expect(themeFlip.light, "theme flips to light").toBe("light");
    expect(themeFlip.after, "theme restores to dark").toBe("dark");

    // COCKPIT MODES — visit each of the six, assert it became active,
    // then return to design.
    const seen = await page.evaluate(async (modes) => {
      const g = () =>
        (globalThis as unknown as { __canvas: ShellCanvas }).__canvas;
      const out: Record<string, string> = {};
      for (const m of modes) {
        g().setMode(m);
        await new Promise((r) => setTimeout(r, 60));
        out[m] = g().mode;
      }
      g().setMode("design");
      return out;
    }, MODES);
    for (const m of MODES) expect(seen[m], `mode ${m} activates`).toBe(m);

    // REGISTRIES — the cockpit rails + shortcut + intake systems are wired,
    // and a plugin bundle contributed its command (proves bundles loaded).
    const reg = await page.evaluate(() => {
      const r = (globalThis as unknown as { __canvas: ShellCanvas }).__canvas
        .registries;
      return {
        menus: r.menus.list().length,
        tools: r.tools.list().length,
        panels: r.panels.list().length,
        keybindings: r.keybindings.list().length,
        importers: r.importers.acceptExtensions().length,
        hasPluginCmd: r.commands
          .list()
          .some((c) => c.id === "media.paged.web.command.insertWebFrame"),
      };
    });
    expect(reg.menus, "menus registered").toBeGreaterThan(0);
    expect(reg.tools, "tool rail registered").toBeGreaterThan(0);
    expect(reg.panels, "panel rail registered").toBeGreaterThan(0);
    expect(reg.keybindings, "keyboard shortcuts registered").toBeGreaterThan(0);
    expect(reg.importers, "file-intake importers registered").toBeGreaterThan(0);
    expect(reg.hasPluginCmd, "plugin bundle contributed a command").toBe(true);
  });
});
