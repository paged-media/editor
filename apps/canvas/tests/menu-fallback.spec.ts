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

// F1 — the host's courtesy menu entries stand down for a plugin's own.
//
// C1 gave four plugin commands a front door in `Object ▸ Insert` because
// the contract had no menu door at all. `contribute.menu()` ended that
// necessity, and a courtesy entry that OUTLIVED it would be a second
// route to the same command, in a place the plugin did not choose and
// cannot remove.
//
// Three behaviours matter and each has a way of going wrong:
//
//   · a real entry at the SAME path must REPLACE the courtesy one, not
//     throw — the thrower is a bundle's `activate`, and taking a plugin
//     down because the host was already being helpful there is the worst
//     available outcome;
//   · a real entry at a DIFFERENT path must still hide it, because the
//     plugin will usually file its verb somewhere the host did not
//     guess, and the user would otherwise see the same command twice;
//   · with NO plugin entry the courtesy must SURVIVE, or a bundle that
//     declares no menu silently loses its front door — which is the
//     regression this whole mechanism could most easily cause.

import { test, expect } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";

interface MenuLite {
  path: string;
  command: string;
  fallbackFor?: string;
}

interface Reg {
  register(c: MenuLite): { dispose(): void };
  list(): MenuLite[];
}

/** Drive the live registry in the page — the same object the menu bar
 *  renders from, rather than a re-implementation of it here. */
async function withRegistry<T>(
  page: import("@playwright/test").Page,
  fn: (reg: Reg) => T,
): Promise<T> {
  return page.evaluate(`(${fn.toString()})(
    globalThis.__canvas.registries.menus
  )`) as Promise<T>;
}

test.describe("F1 — courtesy menu entries", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
  });

  test("a plugin entry at the SAME path replaces the courtesy one without throwing @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const out = await withRegistry(page, (reg) => {
      const PATH = "Object/Insert probe…";
      const CMD = "probe.command.insert";
      const courtesy = reg.register({
        path: PATH,
        command: CMD,
        fallbackFor: CMD,
      });
      let threw = false;
      let real: { dispose(): void } | null = null;
      try {
        real = reg.register({ path: PATH, command: CMD });
      } catch {
        threw = true;
      }
      const rows = reg.list().filter((m) => m.command === CMD);
      const result = {
        threw,
        count: rows.length,
        isFallback: rows[0]?.fallbackFor != null,
      };
      real?.dispose();
      courtesy.dispose();
      return result;
    });

    expect(out.threw, "registering over a courtesy entry must not throw").toBe(
      false,
    );
    expect(out.count, "exactly one entry survives").toBe(1);
    expect(out.isFallback, "and it is the plugin's, not the courtesy").toBe(
      false,
    );
  });

  test("a plugin entry at a DIFFERENT path hides the courtesy one @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const out = await withRegistry(page, (reg) => {
      const CMD = "probe.command.elsewhere";
      const courtesy = reg.register({
        path: "Object/Insert probe elsewhere…",
        command: CMD,
        fallbackFor: CMD,
      });
      const real = reg.register({ path: "Probe/Insert…", command: CMD });
      const rows = reg.list().filter((m) => m.command === CMD);
      const result = { paths: rows.map((r) => r.path) };
      real.dispose();
      courtesy.dispose();
      return result;
    });

    expect(out.paths).toEqual(["Probe/Insert…"]);
  });

  test("with NO plugin entry the courtesy SURVIVES @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    // The regression this mechanism could most easily cause: a bundle
    // that declares no menu must keep its host-curated front door.
    const out = await withRegistry(page, (reg) => {
      const CMD = "probe.command.lonely";
      const courtesy = reg.register({
        path: "Object/Insert lonely probe…",
        command: CMD,
        fallbackFor: CMD,
      });
      const rows = reg.list().filter((m) => m.command === CMD);
      const result = { paths: rows.map((r) => r.path) };
      courtesy.dispose();
      return result;
    });

    expect(out.paths).toEqual(["Object/Insert lonely probe…"]);
  });

  test("the four real courtesy entries are marked, and unmarked ones are untouched @feat:editor-shell.plugin-bundles", async ({
    page,
  }) => {
    const rows = await withRegistry(page, (reg) =>
      reg
        .list()
        .map((m) => ({ path: m.path, fb: m.fallbackFor ?? null }))
        .filter((m) => m.path.startsWith("Object/Insert") || m.path.startsWith("Data/")),
    );

    // EVERY courtesy is superseded now, so none of them appear at all.
    //
    // This assertion used to read `> 0` and it was right when written:
    // the host's four courtesy rows were live because no bundle had a
    // menu. Within the hour all six bundles shipped one, every courtesy
    // stood down, and `list()` stopped returning them — which is the
    // mechanism doing exactly its job, observed from the outside.
    //
    // So the fact worth pinning here is the ABSENCE, and that the four
    // paths still exist (contributed now by the plugins themselves,
    // superseding in place). The mechanism itself is covered by the
    // three synthetic tests above, which do not depend on which bundles
    // happen to ship a menu.
    const stillCourtesy = rows.filter((r) => r.fb !== null);
    expect(
      stillCourtesy,
      "every courtesy has been superseded by a real plugin entry",
    ).toEqual([]);
    for (const p of [
      "Object/Insert web frame…",
      "Object/Insert spreadsheet…",
      "Object/Insert data binding…",
    ]) {
      expect(
        rows.map((r) => r.path),
        `${p} survives, now owned by its plugin`,
      ).toContain(p);
    }

    // …while the Data rows do NOT: they raise PANELS through the
    // registry-derived panel-show commands, which no plugin command
    // supersedes, so marking them would hide them for nothing.
    const dataRows = rows.filter((r) => r.path.startsWith("Data/"));
    expect(dataRows.length).toBeGreaterThan(0);
    for (const r of dataRows) {
      expect(r.fb, `${r.path} must not be a fallback`).toBeNull();
    }
  });
});
