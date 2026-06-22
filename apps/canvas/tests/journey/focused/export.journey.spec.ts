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

// Journey: export a from-scratch document.
//
// Closes the production loop — a document built from nothing must be
// saveable. Export to IDML and re-parse it through the engine, proving
// the blank-document path carries a valid `source_idml` for save-back.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · export", () => {
  test("a from-scratch document round-trips through IDML export @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:frames-paths.frame.insert @feat:color-swatches.fill-stroke-apply @feat:round-tripping.idml-reserialization @feat:foundations.container.open @feat:package-anatomy.core-import @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Put real content on the page so the export carries page items.
    const id = await designer.drawRectangle({ x0: 90, y0: 120, x1: 300, y1: 280 });
    expect(id).toBeTruthy();
    await designer.applyFill("rectangle", id, "Color/Black");

    const { byteLength, pageCount } = await designer.exportAndReload();
    expect(byteLength, "exported IDML should be non-trivial").toBeGreaterThan(500);
    expect(pageCount, "re-parsed document keeps its single page").toBe(1);
  });
});
