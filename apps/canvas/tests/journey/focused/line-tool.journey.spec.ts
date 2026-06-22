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

// Journey: the Line tool.
//
// A designer arms the Line tool (\) and drags a stroked line onto the
// page — a real pointer gesture creating a graphic line, distinct from the
// insertLine op. Proves the editor-tools.draw.line gesture end to end.

import { expect, test } from "@playwright/test";

import { dragMouse, screenPoint, treeCount } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

test.describe("journey · line tool", () => {
  test("the Line tool drags a graphic line onto the page @feat:editor-tools.draw.line @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const before = await treeCount(page, "graphicLine");

    // Arm the Line tool via its activation command (the rail pill is a
    // flyout sub-tool; the command is the stable surface), then drag.
    await page.evaluate(() =>
      (
        globalThis as unknown as {
          __canvas: { registries: { commands: { invoke: (id: string) => Promise<void> } } };
        }
      ).__canvas.registries.commands.invoke("paged.tool.activate.paged.tool.line"),
    );
    const a = await screenPoint(page, 120, 200);
    const b = await screenPoint(page, 360, 200);
    await dragMouse(page, a, b);

    // The Line tool drags out a graphicLine page item.
    await expect
      .poll(() => treeCount(page, "graphicLine"), { timeout: 5_000 })
      .toBeGreaterThan(before);
  });
});
