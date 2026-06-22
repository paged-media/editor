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

// Journey: type a heading and style it.
//
// The everyday DTP styling loop — set a caret, type, then change the
// font size of the text — with the oracle confirming the Text editing
// context throughout, and a visual checkpoint proving the larger
// heading actually rendered.

import { expect, test } from "@playwright/test";

import { TEXT_CARET_EDITING } from "../driver/context-contract";
import { Designer } from "../driver/designer";

test.describe("journey · styles", () => {
  test("type a heading and apply a 36pt font size @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:stories-text.text.insert @feat:stories-text.caret-selection @feat:stories-text.style-apply-range @feat:editor-shell.panels.character @level:gesture", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const { storyId } = await designer.addTextFrame({
      x0: 70,
      y0: 90,
      x1: 480,
      y1: 200,
    });
    expect(storyId, "text frame should have a parent story").toBeTruthy();

    await designer.placeCaret(storyId!, 0);
    await designer.expectContext(TEXT_CARET_EDITING);

    const heading = "Spring Collection";
    await designer.typeText(heading);
    await expect
      .poll(() => designer.storyChars(storyId!), { timeout: 6000 })
      .toBeGreaterThanOrEqual(heading.length);

    // GUI-deepened: select the heading and set 36pt by typing into the
    // REAL Character-panel size field (the user's exact "edit the font
    // size" gesture) — not a channel mutation.
    await designer.selectText(storyId!, 0, heading.length);
    await designer.fillPanelControl("characterFontSize", 36);

    // The larger heading rendered on the page.
    await designer.contentCheckpoint("heading-36pt");
  });
});
