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

// Journey: add pages.
//
// A document grows — the designer inserts a second page. Asserts the
// page structure changed and the document now carries two pages.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · pages", () => {
  test("inserting a page grows the document to two pages @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:layout-model.spreads-pages @level:happy", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    expect((await designer.handle()).pageCount).toBe(1);

    const pageCount = await designer.addPage();
    expect(pageCount, "document should now have two pages").toBe(2);
  });
});
