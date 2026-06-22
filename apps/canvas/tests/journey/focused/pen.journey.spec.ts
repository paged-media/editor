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

// Journey: draw a path with the Pen tool (real clicks).
//
// The most "real user" creation path — arm the Pen tool and click an
// anchor per corner, commit with Enter — proving the genuine pointer →
// pen-handler → insertPath chain, then stroke the path so it renders.

import { expect, test } from "@playwright/test";

import { FRAME_SELECTED } from "../driver/context-contract";
import { Designer } from "../driver/designer";

test.describe("journey · pen", () => {
  test("clicking the Pen tool draws a path and surfaces the Frame context @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:frames-paths.path.insert @feat:editor-tools.draw.pen @feat:frames-paths.stroke-weight-caps-joins @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Real input: three anchor clicks + Enter → one path.
    const id = await designer.drawPath([
      [120, 160],
      [340, 160],
      [230, 340],
    ]);
    expect(id, "pen should create a path element").toBeTruthy();

    await designer.selectElement("polygon", id);
    await designer.expectContext(FRAME_SELECTED);

    // Stroke it so the open path is visible, then checkpoint.
    await designer.applyStroke("polygon", id, "Color/Black", 4);
    await designer.contentCheckpoint("pen-path");
  });
});
