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
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// F1 — a plugin's menu entries reach the host's menu bar.
//
// THE ROUND TRIP THIS PINS. `contribute.menu()` shipped in plugin-api
// 0.2.33 and the host wired `ShellRegistries.menus` through to bundles,
// but for a while nothing walked through the door: the contract existed,
// the host end was proven in isolation, and no loaded bundle called it.
// A door with a proof on one side only is indistinguishable from a door
// that does not open.
//
// paged.draw is the consumer. It registers 92 commands and, before this,
// not one of them could reach a menu — every verb was Cmd+K only, shown
// as a raw command id.
//
// WHY THIS IS NOT A UNIT TEST. Every interesting way this breaks is a
// SEAM: the bundle's peer range excluding the host's contract version,
// the host handing bundles a registries object without `menus`, the SDK
// refusing an entry whose command is not declared, two copies of a
// type-only contract resolving to different types. None of those are
// visible from either side alone — only from a real bundle activating
// against a real host, which is exactly what a journey is.

import { test, expect } from "@playwright/test";

import { Designer } from "../driver/designer";

interface MenuItemLite {
  path: string;
  command: string;
}

test.describe("journey · plugin menu contributions", () => {
  test("paged.draw's verbs reach the menu bar @feat:plugin-platform.bundle-lifecycle @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const menus = async (): Promise<MenuItemLite[]> =>
      page.evaluate(() => {
        const reg = (
          globalThis as unknown as {
            __canvas: {
              registries: { menus: { list: () => MenuItemLite[] } };
            };
          }
        ).__canvas.registries.menus;
        return reg.list().map((m) => ({ path: m.path, command: m.command }));
      });

    // The bundle loads asynchronously, so poll rather than sample once.
    await expect
      .poll(
        async () =>
          (await menus()).filter((m) =>
            m.command.startsWith("media.paged.draw."),
          ).length,
        { timeout: 20_000 },
      )
      .toBeGreaterThan(50);

    const all = await menus();
    const draw = all.filter((m) => m.command.startsWith("media.paged.draw."));

    // A NEW top-level menu, beside the host's own — not instead of them.
    const tops = new Set(all.map((m) => m.path.split("/")[0]));
    expect(tops).toContain("Draw");
    for (const hostMenu of ["File", "Edit", "View", "Object", "Window"]) {
      expect(tops, `the host's ${hostMenu} menu survives`).toContain(hostMenu);
    }

    // MERGING works: draw's insert verbs join the host's Object menu and
    // its select verbs join Edit, rather than minting more top levels.
    // This is the half that a "does a Draw menu exist" check would miss.
    const merged = draw.filter(
      (m) => m.path.startsWith("Object/") || m.path.startsWith("Edit/"),
    );
    expect(merged.length, "draw merges into host menus too").toBeGreaterThan(4);

    // Every contributed entry names a command the registry can actually
    // invoke. The SDK refuses an entry pointing at nothing, so this
    // catches the failure that refusal is protecting against — an item
    // that renders and then does nothing when clicked.
    const dead = await page.evaluate((ids: string[]) => {
      const reg = (
        globalThis as unknown as {
          __canvas: {
            registries: { commands: { get: (id: string) => unknown } };
          };
        }
      ).__canvas.registries.commands;
      return ids.filter((id) => !reg.get(id));
    }, draw.map((m) => m.command));
    expect(dead, `menu entries with no command: ${dead.join(", ")}`).toEqual([]);

    // No two entries claim the same slot in the bar.
    const paths = draw.map((m) => m.path);
    expect(paths.length).toBe(new Set(paths).size);
  });
});
