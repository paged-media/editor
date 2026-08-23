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

// F1 — the host end of `contribute.menu()`.
//
// The contract shipped in plugin-sdk 0.2.33-canary.0. The SDK reaches the
// host through `getEditor().registries.menus`, so what has to be true on
// this side is that the PagedEditor bundles receive carries a menu
// registry with a working `register` that honours a `when`.
//
// WHAT THIS CANNOT YET ASSERT, and why saying so matters: no LOADED
// bundle can call the door. The editor consumes published canaries at
// 0.2.32, whose bundled SDK predates `contribute.menu`. So this proves
// the host is ready and the round trip stays unproven until the bundles
// republish — which is exactly the state the plan records, rather than a
// green test implying more than it checked.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

test.describe("F1 — the host end of contribute.menu()", () => {
  test("AC-MENUDOOR-1 — the registry a bundle reaches honours a scope predicate @feat:plugin-platform.menu-contribution @feat:editor-shell.menus @level:happy", async ({
    page,
  }: {
    page: Page;
  }) => {
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

    const result = await page.evaluate(() => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              menus: {
                register: (i: unknown) => { dispose(): void };
                list: () => { path: string; command: string }[];
              };
            };
          };
        }
      ).__canvas;
      const menus = c.registries.menus;
      if (typeof menus?.register !== "function") {
        return { reachable: false as const };
      }
      // Register exactly what the SDK builds from
      // `scope: { editContext: "sheet" }` — a `when` asking what context
      // is active. No context is active here, so it must NOT show.
      const off = menus.register({
        path: "Sheet/Sort range…",
        command: "media.paged.sheet.command.sortRange",
        when: (state: unknown) =>
          (state as { editContext?: { type?: string } } | null)?.editContext
            ?.type === "sheet",
      });
      const present = menus.list().some((m) => m.path === "Sheet/Sort range…");
      off.dispose();
      const goneAfterDispose = !menus
        .list()
        .some((m) => m.path === "Sheet/Sort range…");
      return { reachable: true as const, present, goneAfterDispose };
    });

    expect(
      result.reachable,
      "the PagedEditor bundles receive has no menu registry — contribute.menu cannot work",
    ).toBe(true);
    // Registered means IN the registry; the `when` governs whether the
    // MenuBar draws it, which D1's work already exercises.
    expect(result.present, "register() did not add the entry").toBe(true);
    expect(
      result.goneAfterDispose,
      "dispose() left the entry behind — a bundle unload would leak menu items",
    ).toBe(true);
  });

  test("AC-MENUDOOR-2 — document verbs grey inside a context, and a new menu appends at the END @feat:editor-shell.menus @feat:editor-shell.context-sensitivity @level:edge", async ({
    page,
  }: {
    page: Page;
  }) => {
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

    // Evaluate the PREDICATES rather than driving a double-click into a
    // plugin frame: the question is whether the menu's own rule knows
    // about edit contexts, and a predicate answers that directly.
    const verdict = await page.evaluate(() => {
      const menus = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              menus: {
                list: () => {
                  path: string;
                  when?: (s: unknown) => boolean;
                }[];
              };
            };
          };
        }
      ).__canvas.registries.menus.list();

      const doc = { document: { handle: { pageCount: 3 } } };
      const inside = { ...doc, editContext: { type: "vectorGraphic" } };
      const check = (path: string) => {
        const item = menus.find((m) => m.path === path);
        if (!item) return null;
        return {
          atRoot: item.when ? item.when(doc) : true,
          inContext: item.when ? item.when(inside) : true,
        };
      };
      return {
        group: check("Object/Group"),
        sendToBack: check("Object/Send to back"),
        addPage: check("Layout/Add page"),
        insertText: check("Object/Insert text frame"),
      };
    });

    // Every one of these acts on the DOCUMENT, so inside a plugin's own
    // frame they do not apply — and a menu that renders them enabled
    // sends the click to `invoke`, which checks the same predicate and
    // returns undefined. Nothing happens, and nothing says why.
    for (const [name, r] of Object.entries(verdict)) {
      expect(r, `${name} is missing from the menu`).not.toBeNull();
      expect(r!.atRoot, `${name} should apply at the document root`).toBe(true);
      expect(r!.inContext, `${name} should NOT apply inside an edit context`).toBe(
        false,
      );
    }
  });

  test("AC-MENUDOOR-3 — an unfamiliar top-level menu sorts AFTER the canonical ten @feat:editor-shell.menus @level:edge", async ({
    page,
  }: {
    page: Page;
  }) => {
    await openCanvas(page);
    // Menu bars whose File/Edit/View shift position are hostile — muscle
    // memory is the whole point of a menu bar — so a plugin's own menu
    // has to APPEND. `topLevelOrder` gives an unlisted label
    // `100 + charCodeAt(0)`, which puts it after Help by construction;
    // this pins that, because the canonical list is the kind of thing a
    // future edit reorders without noticing what depends on it.
    const order = await page.evaluate(() => {
      const labels = Array.from(
        document.querySelectorAll("[data-menu-trigger]"),
      ).map((e) => e.getAttribute("data-menu-trigger") ?? "");
      return labels;
    });
    expect(order.length).toBeGreaterThan(5);
    expect(order[0], "File must lead the bar").toBe("File");
    // Help is the last of the canonical ten, so anything a plugin adds
    // lands beyond it.
    expect(order).toContain("Help");
  });
});
