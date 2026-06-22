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

// Journey: build and apply a gradient.
//
// Two brand swatches → a linear gradient between them → applied as a
// frame fill, with a visual checkpoint proving the gradient rendered.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · gradient", () => {
  test("create a linear gradient and fill a shape with it @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:color-swatches.swatch.crud @feat:color-swatches.gradients @feat:color-swatches.fill-stroke-apply @feat:frames-paths.frame.insert @feat:editor-tools.draw.rectangle @level:happy", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const red = await designer.createSwatch("Red", [220, 30, 30]);
    const blue = await designer.createSwatch("Blue", [30, 60, 220]);
    const grad = await designer.createGradient("Sunset", [red, blue]);
    expect(grad, "gradient should have an id").toBeTruthy();

    const id = await designer.drawRectangle({ x0: 90, y0: 120, x1: 460, y1: 320 });
    await designer.selectElement("rectangle", id);
    await designer.applyFill("rectangle", id, grad);

    await designer.contentCheckpoint("gradient-fill");
  });
});
