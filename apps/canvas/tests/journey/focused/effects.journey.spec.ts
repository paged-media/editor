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

// Journey: apply an effect.
//
// Exercises the Effects panel domain — draw + fill a shape, then add a
// drop shadow — with a visual checkpoint proving the effect rendered.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · effects", () => {
  test("apply a drop shadow to a filled shape @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:frames-paths.frame.insert @feat:color-swatches.fill-stroke-apply @feat:effects-transparency.drop-shadow @feat:editor-shell.panels.effects @level:happy", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const id = await designer.drawRectangle({ x0: 140, y0: 160, x1: 360, y1: 340 });
    expect(id).toBeTruthy();
    await designer.applyFill("rectangle", id, "Color/Black");
    await designer.applyDropShadow("rectangle", id, 12);

    await designer.contentCheckpoint("drop-shadow");
  });
});
