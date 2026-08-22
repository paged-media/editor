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

// Phase A — not losing work.
//
// The editor showed its dirty state honestly in two places (the mode
// bar's "Edited — not saved" and the doc title bar's "Edited") and then
// never acted on it: no beforeunload handler anywhere, no autosave, no
// recent files, and — the one that catches people first — NO Cmd+S. The
// single most reflexive gesture in any editor did nothing at all.
//
// WHAT THESE TESTS CAN AND CANNOT ASSERT. Playwright cannot observe the
// browser's own leave-site dialog, and dismissing it is not scriptable.
// So the guard is asserted at the seam we own: that a `beforeunload`
// listener is REGISTERED while dirty and absent while clean. That is the
// whole contract on our side — the browser supplies the wording and
// ignores anything we pass — and asserting registration catches the two
// ways this breaks: never installed, or installed permanently, which
// prompts on every clean navigation and trains people to click through
// the dialog that is meant to stop them.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

/** Count `beforeunload` listeners by wrapping addEventListener before the
 *  app mounts. `getEventListeners` is a devtools-only API, so counting
 *  has to be installed rather than queried. */
async function instrumentBeforeUnload(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = globalThis as unknown as {
      __beforeUnloadCount: number;
      addEventListener: typeof addEventListener;
      removeEventListener: typeof removeEventListener;
    };
    w.__beforeUnloadCount = 0;
    const add = w.addEventListener.bind(w);
    const remove = w.removeEventListener.bind(w);
    w.addEventListener = ((type: string, ...rest: unknown[]) => {
      if (type === "beforeunload") w.__beforeUnloadCount += 1;
      return (add as (...a: unknown[]) => unknown)(type, ...rest);
    }) as typeof addEventListener;
    w.removeEventListener = ((type: string, ...rest: unknown[]) => {
      if (type === "beforeunload") w.__beforeUnloadCount -= 1;
      return (remove as (...a: unknown[]) => unknown)(type, ...rest);
    }) as typeof removeEventListener;
  });
}

const guardCount = (page: Page) =>
  page.evaluate(
    () => (globalThis as unknown as { __beforeUnloadCount: number }).__beforeUnloadCount,
  );

async function keybindings(page: Page): Promise<{ key: string; command: string }[]> {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __canvas: { debugContext: () => { keybindings: { key: string; command: string }[] } };
        }
      ).__canvas.debugContext().keybindings,
  );
}

test.describe("Phase A — unsaved work", () => {
  test("AC-SAFE-1 — the unload guard follows the dirty flag @feat:editor-shell.file-intake @level:happy", async ({
    page,
  }) => {
    await instrumentBeforeUnload(page);
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

    // Measure the DELTA, not the absolute count. The dev server's own
    // client registers a `beforeunload` of its own, so "is there one" is
    // not a question about our guard — asserting zero here failed on a
    // document whose `dirty` was verifiably false.
    const clean = await guardCount(page);

    // Any mutation makes it dirty…
    await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { mutate: (m: unknown) => Promise<unknown> } };
        }
      ).__canvas;
      await c.client.mutate({ op: "insertPage", args: {} });
    });
    await expect
      .poll(() => guardCount(page), { timeout: 8_000 })
      .toBe(clean + 1);

    // …and undoing back to the loaded state disarms it again. This half
    // is the one that matters: a guard that installs and never leaves
    // prompts on every clean navigation, which teaches people to click
    // through the dialog that is supposed to stop them.
    await page.evaluate(async () => {
      await (
        globalThis as unknown as { __canvas: { client: { undo: () => Promise<unknown> } } }
      ).__canvas.client.undo();
    });
    await expect.poll(() => guardCount(page), { timeout: 8_000 }).toBe(clean);
  });

  test("AC-SAFE-2 — Cmd+S and Cmd+Shift+S are bound to the two save commands @feat:editor-shell.keyboard-shortcuts @feat:editor-shell.menus @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const binds = await keybindings(page);
    const forCommand = (command: string) =>
      binds.filter((b) => b.command === command).map((b) => b.key);

    // Both platforms' modifiers, because the registry treats cmd+ and
    // ctrl+ as distinct contributions rather than normalising them.
    expect(forCommand("paged.file.savePaged")).toEqual(
      expect.arrayContaining(["cmd+s", "ctrl+s"]),
    );
    expect(forCommand("paged.file.saveAsIdml")).toEqual(
      expect.arrayContaining(["cmd+shift+s", "ctrl+shift+s"]),
    );
  });

  test("AC-SAFE-3 — Problems is reachable from the panel rail @feat:editor-shell.panels.problems @feat:editor-shell.panel-rail @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    // The panel carries the app's refusal sentences and now its save and
    // export failures. It was in no mode's slots and on no rail, so the
    // explanation for a greyed command was published where nobody could
    // read it.
    const item = page.locator('[data-panel-rail-item="paged.problems"]');
    await expect(item).toBeVisible();
    await item.click();
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
          ).includes("paged.problems"),
        { timeout: 5_000 },
      )
      .toBe(true);
  });
});

test.describe("B3 — the Pages panels stop being two halves", () => {
  test("AC-PAGES-1 — Layout ▸ Delete page exists and removes the page in view @feat:layout-model.spreads-pages @feat:editor-shell.menus @level:happy", async ({
    page,
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

    const pageCount = () =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { handle: { pageCount: number } } })
            .__canvas.handle.pageCount,
      );
    const before = await pageCount();
    expect(before).toBeGreaterThan(1);

    // Deleting a page had NO menu route at all before B3: `deletePage`
    // was reachable only from `paged.pages-list`, which is in no mode's
    // slots. A designer on the default layout could add pages forever
    // and never remove one.
    const menuCommands = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas: { registries: { menus: { list: () => { path: string; command: string }[] } } };
          }
        ).__canvas.registries.menus.list(),
    );
    expect(menuCommands.map((m) => m.path)).toContain("Layout/Delete page");

    await page.evaluate(async () => {
      const cmd = (
        globalThis as unknown as {
          __canvas: { registries: { commands: { invoke: (id: string) => Promise<unknown> } } };
        }
      ).__canvas.registries.commands;
      await cmd.invoke("paged.insert.deletePage");
    });

    await expect.poll(pageCount, { timeout: 8_000 }).toBe(before - 1);
  });
});
