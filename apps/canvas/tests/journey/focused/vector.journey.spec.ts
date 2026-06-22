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

// Journey: draw a shape with real pointer input.
//
// Genuine user-simulation — the Rectangle tool is armed and dragged
// across the page exactly as a designer would, then the oracle asserts
// the Frame context (Transform + Stroke) surfaces, the way InDesign
// shows it for a selected graphic frame. A visual checkpoint captures
// the rendered shape.

import { expect, test } from "@playwright/test";

import { FRAME_SELECTED } from "../driver/context-contract";
import { Designer } from "../driver/designer";

test.describe("journey · vector", () => {
  test("dragging the Rectangle tool draws a frame and surfaces the Frame context @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:frames-paths.frame.insert @feat:editor-tools.draw.rectangle @feat:color-swatches.fill-stroke-apply @feat:editor-tools.select.click-marquee @feat:editor-shell.panels.object-transform @feat:editor-shell.panels.stroke @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Real input: arm the Rectangle tool, drag out a frame.
    const id = await designer.drawRectangle({ x0: 90, y0: 120, x1: 320, y1: 300 });
    expect(id, "rectangle should be created by the drag").toBeTruthy();

    // Ensure it's the selection the panels read, then assert the oracle:
    // a selected graphic frame → Frame context (object + stroke), no
    // text/fitting controls.
    await designer.selectElement("rectangle", id);
    await designer.expectContext(FRAME_SELECTED);
    // Chrome visual: the Properties panel in its Frame inspector mode
    // (Transform + Stroke) — a different context, a different panel.
    await designer.chromeCheckpoint("properties-frame");

    // Give it a fill (a real production step) so it's visible, then the
    // visual checkpoint proves the shape actually rendered on the page.
    await designer.applyFill("rectangle", id, "Color/Black");
    await designer.contentCheckpoint("rectangle-filled");
  });
});
