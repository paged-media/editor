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

// Journey: layer management.
//
// Exercises the Layers panel domain — add a layer, then toggle its
// visibility — the way a designer organises artwork. Asserts the layer
// model reflects each operation.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · layers", () => {
  test("add a layer and toggle its visibility @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:layers.ops @feat:layers.model @feat:editor-shell.panels.layers @level:happy", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const before = (await designer.layers()).length;
    const layerId = await designer.addLayer("Artwork");
    expect(layerId, "new layer should have an id").toBeTruthy();
    expect((await designer.layers()).length).toBe(before + 1);

    // Hide it…
    await designer.setLayerVisible(layerId, false);
    await expect
      .poll(async () =>
        (await designer.layers()).find((l) => l.selfId === layerId)?.visible,
      )
      .toBe(false);

    // …and show it again.
    await designer.setLayerVisible(layerId, true);
    await expect
      .poll(async () =>
        (await designer.layers()).find((l) => l.selfId === layerId)?.visible,
      )
      .toBe(true);
  });
});
