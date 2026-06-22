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

// Journey: paged.draw SELECT-SAME — select every element sharing the
// reference's fill / stroke / stroke-weight (Tier A, pure selection — no
// mutation).
//
// The command reads the FIRST-selected element's property
// (host.document.elementProperties), flattens the scene tree to its leaf
// elements, reads each candidate's same property, and selects the
// matches (the reference included). This journey authors three rectangles
// — two black-filled + one red-filled — selects ONE black rect, then runs
// Select-same-Fill and asserts the selection GREW to include the second
// black rect but NOT the red one. Then Select-same-Stroke-weight over a
// shared weight. Pure selection: the assertion is on the post-command
// selection set, read back through paged.selection().

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

async function invokeCommand(
  page: import("@playwright/test").Page,
  id: string,
): Promise<void> {
  await page.evaluate((cmdId) => {
    const cmd = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: {
              invoke?: (id: string) => Promise<void>;
              execute?: (id: string) => Promise<void>;
              run?: (id: string) => Promise<void>;
            };
          };
        };
      }
    ).__canvas.registries.commands;
    const fn = cmd.invoke ?? cmd.execute ?? cmd.run;
    return fn?.call(cmd, cmdId);
  }, id);
}

/** The current element selection (worker truth), as {kind,id} refs. */
async function selectionIds(
  page: import("@playwright/test").Page,
): Promise<Array<{ kind: string; id: string }>> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (
              s: string,
            ) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.selection()");
    return JSON.parse(r.output[0] ?? "[]") as Array<{ kind: string; id: string }>;
  });
}

/** Drive the WORKER selection (the source host.selection.get() reads) and
 *  mirror it to the React context, awaiting the worker reply so
 *  paged.selection() reads the settled set (the draw-schema-panel idiom).
 *  Returns the applied set. */
async function setSelection(
  page: import("@playwright/test").Page,
  ref: { kind: string; id: string },
): Promise<Array<{ kind: string; id: string }>> {
  return page.evaluate(async (target) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            setElementSelection: (
              ids: Array<{ kind: string; id: string }>,
              mode: string,
            ) => Promise<Array<{ kind: string; id: string }>>;
          };
          setContentSelection?: (sel: unknown | null) => void;
          setElementSelection?: (ids: Array<{ kind: string; id: string }>) => void;
        };
      }
    ).__canvas;
    c.setContentSelection?.(null);
    const ids = await c.client.setElementSelection([target], "replace");
    c.setElementSelection?.(ids);
    return ids;
  }, ref);
}

test.describe("journey · paged.draw select-same", () => {
  test("a designer selects all same-fill / same-stroke-weight elements through the select-same commands @feat:plugin-draw.select-same @feat:plugin-platform.bundle-lifecycle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. AUTHOR — three rectangles: two black-filled, one red-filled,
    //    plus a shared stroke weight across two of them. ──
    const black1 = await designer.drawRectangle({ x0: 80, y0: 90, x1: 200, y1: 200 });
    const black2 = await designer.drawRectangle({ x0: 260, y0: 90, x1: 380, y1: 200 });
    const red = await designer.drawRectangle({ x0: 440, y0: 90, x1: 560, y1: 200 });
    for (const id of [black1, black2, red]) {
      expect(id, "drew a rectangle").not.toBe("");
    }

    await designer.applyFill("rectangle", black1, "Color/Black");
    await designer.applyFill("rectangle", black2, "Color/Black");
    const redSwatch = await designer.createSwatch("select-same-red", [220, 20, 20]);
    await designer.applyFill("rectangle", red, redSwatch);

    // ── 2. SELECT-SAME-FILL — select ONE black rect, run the command,
    //    assert the selection grew to the TWO black rects (the red is
    //    excluded — different fill colorRef). ──
    expect((await setSelection(page, { kind: "rectangle", id: black1 })).length).toBe(1);

    await invokeCommand(page, "media.paged.draw.command.selectSameFill");
    await expect
      .poll(async () => (await selectionIds(page)).length, { timeout: 6_000 })
      .toBe(2);
    const fillMatched = (await selectionIds(page)).map((r) => r.id).sort();
    expect(fillMatched, "select-same-fill matched both black rects").toEqual(
      [black1, black2].sort(),
    );
    expect(fillMatched, "the red rect was NOT matched").not.toContain(red);

    // ── 3. SELECT-SAME-STROKE-WEIGHT — give two rects the same 4pt
    //    stroke; select one, run the command, assert the selection is the
    //    two same-weight rects. (The third rect carries no stroke, so it
    //    reads a null stroke weight and is excluded.) ──
    await designer.applyStroke("rectangle", black1, "Color/Black", 4);
    await designer.applyStroke("rectangle", red, "Color/Black", 4);
    // black2 keeps no stroke.

    expect((await setSelection(page, { kind: "rectangle", id: black1 })).length).toBe(1);
    await invokeCommand(page, "media.paged.draw.command.selectSameStrokeWeight");
    await expect
      .poll(async () => (await selectionIds(page)).length, { timeout: 6_000 })
      .toBe(2);
    const weightMatched = (await selectionIds(page)).map((r) => r.id).sort();
    expect(weightMatched, "select-same-stroke-weight matched the two 4pt rects").toEqual(
      [black1, red].sort(),
    );

    // ── 4. SELECT-SAME-STROKE (colour) — both stroked rects are black
    //    strokes, so the command resolves the same pair (the criterion
    //    drives, no throw). ──
    await setSelection(page, { kind: "rectangle", id: black1 });
    await invokeCommand(page, "media.paged.draw.command.selectSameStroke");
    await expect
      .poll(async () => (await selectionIds(page)).length, { timeout: 6_000 })
      .toBeGreaterThanOrEqual(2);
  });
});
