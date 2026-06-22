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

// Journey: the path / threading / guide tools.
//
// Direct-edit a path anchor, confirm a text frame's threading ports render,
// and drag a guide off the ruler. Each is isolated (collect-failures) so the
// suite reports exactly which drove in the journey harness.

import { expect, test } from "@playwright/test";

import { mutate } from "../../e2e/harness/ui";
import { screenPoint } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

test.describe("journey · path/threading/guide tools", () => {
  test("direct-edit a path, threading ports render, drag a ruler guide @feat:editor-tools.path.direct-edit @feat:editor-tools.text.threading-ports @feat:editor-tools.guides.drag @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const fail: string[] = [];
    const activate = (toolId: string) =>
      page.evaluate(
        (id) =>
          (
            globalThis as unknown as {
              __canvas: { registries: { commands: { invoke: (c: string) => Promise<unknown> } } };
            }
          ).__canvas.registries.commands.invoke(`paged.tool.activate.${id}`),
        toolId,
      );
    const engineGuideCount = (page2: Page) =>
      page2.evaluate(async () => {
        const spreads = (await (
          globalThis as unknown as {
            __canvas: { client: { collection: (n: string) => Promise<Array<{ guides?: unknown[] }>> } };
          }
        ).__canvas.client.collection("spreads")) as Array<{ guides?: unknown[] }>;
        return spreads.reduce((n, s) => n + (s.guides?.length ?? 0), 0);
      });

    // PATH DIRECT-EDIT — arm the direct-selection tool and move a path anchor.
    try {
      const pathId = await designer.drawPath([
        [120, 200],
        [200, 250],
        [280, 200],
      ]);
      await activate("paged.tool.directSelect");
      const r = (await mutate(page, {
        op: "pathPointSet",
        args: { elementId: { kind: "polygon", id: pathId }, index: 0, role: "anchor", position: [130, 215] },
      })) as { kind?: string };
      if (r.kind !== "mutationApplied") fail.push("editor-tools.path.direct-edit");
    } catch (e) {
      fail.push(`editor-tools.path.direct-edit (${String(e).slice(0, 50)})`);
    }

    // THREADING PORTS — a selected text frame renders in/out chain ports.
    try {
      const { frameId } = await designer.addTextFrame({ x0: 80, y0: 300, x1: 300, y1: 400 });
      await designer.selectElement("textFrame", frameId);
      await expect
        .poll(() => page.locator('[data-thread-port="out"]').first().getAttribute("data-thread-state"), {
          timeout: 5000,
        })
        .toBe("empty");
    } catch (e) {
      fail.push(`editor-tools.text.threading-ports (${String(e).slice(0, 50)})`);
    }

    // GUIDE DRAG — pull a horizontal guide off the ruler onto the page.
    try {
      const ruler = await page.locator("[data-h-ruler]").boundingBox();
      if (!ruler) throw new Error("no horizontal ruler");
      const before = await engineGuideCount(page);
      const drop = await screenPoint(page, 200, 320);
      const from = { x: drop.x, y: ruler.y + ruler.height / 2 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move((from.x + drop.x) / 2, (from.y + drop.y) / 2, { steps: 4 });
      await page.mouse.move(drop.x, drop.y, { steps: 6 });
      await page.mouse.up();
      await expect.poll(() => engineGuideCount(page), { timeout: 5000 }).toBeGreaterThan(before);
    } catch (e) {
      fail.push(`editor-tools.guides.drag (${String(e).slice(0, 50)})`);
    }

    expect(fail, `edit-tool aspects that did not verify: ${fail.join(" | ")}`).toEqual([]);
  });
});
