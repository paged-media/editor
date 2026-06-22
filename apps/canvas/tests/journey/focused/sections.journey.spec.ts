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

// Journey: page numbering sections.
//
// A multi-page document gets a numbering section — the way a designer
// starts "Part 1" numbering partway through a publication. Exercises the
// sections subsystem (insertSection at a page) and the page collection.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · sections", () => {
  test("start a numbering section on the second page @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:layout-model.spreads-pages @feat:sections-numbering-variables.section-ops @level:happy", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Grow to two pages, then read the page list fresh from the engine.
    await designer.addPage();
    const pages = await designer.collection("pages");
    expect(pages.length).toBe(2);

    const sectionsBefore = (await designer.collection("sections")).length;
    const applied = await designer.insertSection(pages[1].selfId, {
      prefix: "Part-",
      startAt: 1,
    });
    expect(applied, "insertSection should apply").toBe(true);

    await expect
      .poll(async () => (await designer.collection("sections")).length, {
        timeout: 6000,
      })
      .toBeGreaterThan(sectionsBefore);
  });
});
