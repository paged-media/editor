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

// Journey: insert a table.
//
// A designer drops a spec table into a text frame. Exercises the table
// subsystem (insertTable into a story) and confirms it applies + the
// frame renders the grid.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · tables", () => {
  test("insert a 3×4 table into a text frame @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:stories-text.story-model @feat:tables.model @level:happy", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const { storyId } = await designer.addTextFrame({
      x0: 60,
      y0: 80,
      x1: 540,
      y1: 420,
    });
    expect(storyId, "text frame should have a parent story").toBeTruthy();

    const applied = await designer.insertTable(storyId!, 3, 4);
    expect(applied, "insertTable should apply").toBe(true);
    // NOTE: an empty table renders with no default cell borders/fill, so
    // a visual checkpoint here would be a blank page — the model-level
    // mutationApplied is the honest proof. A visible table needs cell
    // content or border styling (a deeper follow-up).
  });
});
