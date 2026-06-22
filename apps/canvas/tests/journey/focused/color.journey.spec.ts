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

// Journey: build a brand palette and fill with it.
//
// Exercises the colour collections (Swatches + Color groups) the way a
// designer sets up brand colours, then applies a custom swatch as a
// frame fill — with a visual checkpoint proving the colour rendered.

import { expect, test } from "@playwright/test";

import { FRAME_SELECTED } from "../driver/context-contract";
import { Designer } from "../driver/designer";

test.describe("journey · color", () => {
  test("create a swatch + color group and fill a shape with the swatch @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:color-swatches.swatch.crud @feat:color-swatches.color-groups @feat:color-swatches.fill-stroke-apply @feat:frames-paths.frame.insert @feat:editor-tools.draw.rectangle @feat:editor-tools.select.click-marquee @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const swatchesBefore = (await designer.collection("swatches")).length;
    const groupsBefore = (await designer.collection("colorGroups")).length;

    const brandRed = await designer.createSwatch("Brand Red", [200, 40, 40]);
    expect(brandRed, "new swatch should have an id").toBeTruthy();
    await designer.createColorGroup("Brand");

    expect((await designer.collection("swatches")).length).toBeGreaterThan(
      swatchesBefore,
    );
    expect((await designer.collection("colorGroups")).length).toBeGreaterThan(
      groupsBefore,
    );

    // Draw a frame (real drag) and fill it with the brand swatch.
    const id = await designer.drawRectangle({ x0: 90, y0: 120, x1: 320, y1: 300 });
    await designer.selectElement("rectangle", id);
    await designer.expectContext(FRAME_SELECTED);
    await designer.applyFill("rectangle", id, brandRed);

    await designer.contentCheckpoint("brand-red-fill");
  });
});
