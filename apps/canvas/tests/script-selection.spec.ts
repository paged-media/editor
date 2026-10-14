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

// A selection made inside a script reaches the shell.
//
// `paged.setElementSelection([...])` set the ENGINE's selection, and the
// shell never heard of it: the selection box stayed on whatever was
// selected before, the control bar went on naming it, and every panel
// bound to the selection read the old one. A selection a script makes
// now lands the way a click's does.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "./journey/driver/designer";

type Ref = { kind: string; id: string };

type CanvasGlobal = {
  __canvas: {
    client: {
      mutate(m: unknown): Promise<{ kind: string; payload: { createdId?: Ref | null } }>;
      setElementSelection(ids: Ref[], mode: string): Promise<Ref[]>;
      elementGeometry(ids: Ref[]): Promise<unknown[]>;
      executeScript(source: string): Promise<{ output: string[]; error: string | null }>;
    };
    handle: { pageIds: string[] };
    elementSelection: Ref[];
    elementGeometry: Array<{ id: Ref; bounds: [number, number, number, number] }>;
    setElementSelection(ids: Ref[], mode: string): void;
    setElementGeometry(items: unknown[]): void;
    openPanel?(id: string): void;
  };
};

/** A rectangle, inserted directly (drawing it is not under test). */
async function rectangle(page: Page, bounds: [number, number, number, number]): Promise<Ref> {
  return page.evaluate(async (b) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const r = await c.client.mutate({
      op: "insertFrame",
      args: { pageId: c.handle.pageIds[0], bounds: b },
    });
    return r.payload.createdId!;
  }, bounds);
}

/** Select as a click does: the engine, then the mirror and its geometry. */
async function clickSelect(page: Page, ref: Ref): Promise<void> {
  await page.evaluate(async (r) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const ids = await c.client.setElementSelection([r], "replace");
    c.setElementSelection(ids, "replace");
    c.setElementGeometry(await c.client.elementGeometry(ids));
  }, ref);
}

const mirror = (page: Page) =>
  page.evaluate(() => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    return {
      selection: c.elementSelection.map((r) => `${r.kind}:${r.id}`),
      geometry: c.elementGeometry.map((g) => `${g.id.kind}:${g.id.id}`),
    };
  });

/** Type a script into the Script panel and run it. */
async function runInScriptPanel(page: Page, source: string): Promise<void> {
  const panel = page.locator('[data-script-editor="ready"]');
  await panel.locator("[data-script-source]").fill(source);
  await panel.locator('[data-action="run"]').click();
  await expect(panel.locator('[data-action="run"]')).toHaveText(/Run/);
}

test.describe("A selection made in a script reaches the shell", () => {
  test("AC-SCRIPT-SEL-1 — paged.setElementSelection from the Script panel moves the box and the control bar to the element @feat:scripting.script-editor @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const a = await rectangle(page, [100, 100, 200, 200]);
    const b = await rectangle(page, [300, 300, 420, 460]);
    await clickSelect(page, a);
    await expect.poll(async () => (await mirror(page)).selection).toEqual([`rectangle:${a.id}`]);

    await page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.openPanel?.("paged.script-editor"));
    await runInScriptPanel(page, `paged.setElementSelection(["rectangle:${b.id}"]);`);

    // The selection, the box and the panels follow the script.
    await expect
      .poll(async () => mirror(page))
      .toEqual({ selection: [`rectangle:${b.id}`], geometry: [`rectangle:${b.id}`] });
    const box = await page.evaluate(
      () => (globalThis as unknown as CanvasGlobal).__canvas.elementGeometry[0]?.bounds,
    );
    expect(box).toEqual([300, 300, 420, 460]);
    await expect(page.locator("[data-control-kind]").first()).toHaveText("Rectangle");

    // A script can clear it, too.
    await runInScriptPanel(page, "paged.clearSelection();");
    await expect.poll(async () => mirror(page)).toEqual({ selection: [], geometry: [] });
  });

  test("AC-SCRIPT-SEL-2 — a script that does not touch the selection leaves the shell's alone @feat:scripting.script-editor @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const a = await rectangle(page, [100, 100, 200, 200]);
    await clickSelect(page, a);
    await expect.poll(async () => (await mirror(page)).selection).toEqual([`rectangle:${a.id}`]);

    // A write that is not a selection, and a read.
    await page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.openPanel?.("paged.script-editor"));
    await runInScriptPanel(page, `paged.set("rectangle:${a.id}", "frameOpacity", 50); console.log(paged.pages());`);
    // A selection only the shell holds (a harness, a panel row) is not
    // the engine's to overwrite either.
    const b = await rectangle(page, [300, 300, 420, 460]);
    await page.evaluate(async (r) => {
      const c = (globalThis as unknown as CanvasGlobal).__canvas;
      c.setElementSelection([r], "replace");
      c.setElementGeometry(await c.client.elementGeometry([r]));
    }, b);
    await page.evaluate(() =>
      (globalThis as unknown as CanvasGlobal).__canvas.client.executeScript("paged.stories()"),
    );
    // Give a (wrong) follow-up read every chance to land before checking.
    await page.waitForTimeout(500);
    expect(await mirror(page)).toEqual({
      selection: [`rectangle:${b.id}`],
      geometry: [`rectangle:${b.id}`],
    });
  });
});
