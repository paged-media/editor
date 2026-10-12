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

// ED-17 — two rough edges on the canvas chrome the films caught.
//
//   · The hit marker (page outline + frame outline + a red crosshair at
//     the last click) is a diagnostic of the hit-test pipeline. It was
//     a built-in overlay, so every click left a crosshair on the work.
//     It now mounts only behind `?debug=hits`.
//   · The right rail's Image button steers the Properties inspector,
//     but a live selection always won: a frame that had just received
//     a photo still read "Frame" (the selection's geometry mirror was
//     stale — it said no image), and the click changed nothing.

import { expect, test } from "@playwright/test";

import { Designer } from "./journey/driver/designer";
import { screenPoint } from "./e2e/harness/viewport";

test.describe("ED-17 — canvas chrome", () => {
  // The crosshair is the marker's red dot: the only overlay-target
  // circle the canvas draws (thread lines use the token for lines only).
  const CROSSHAIR = 'circle[fill="var(--overlay-target)"]';

  async function clickARectangle(page: import("@playwright/test").Page, search?: string) {
    const designer = new Designer(page);
    await designer.open(search ? { search } : {});
    await designer.newDocument();
    await designer.drawRectangle({ x0: 100, y0: 100, x1: 300, y1: 260 });
    await designer.activate("select");
    const at = await screenPoint(page, 200, 180);
    await page.mouse.click(at.x, at.y);
    await expect
      .poll(() => designer.elementSelection().then((s) => s.length))
      .toBe(1);
  }

  test("AC-HITMARK-1 — a click leaves no diagnostic crosshair on the canvas @feat:editor-shell.panels.properties @level:edge", async ({
    page,
  }) => {
    await clickARectangle(page);
    // The selection chrome is there; the hit diagnostic is not.
    await expect(
      page.locator('polygon[stroke="var(--overlay-selection)"]').first(),
    ).toBeAttached();
    await expect(page.locator(CROSSHAIR)).toHaveCount(0);
  });

  test("AC-HITMARK-2 — ?debug=hits keeps the diagnostic for whoever debugs the hit path @feat:editor-shell.panels.properties @level:edge", async ({
    page,
  }) => {
    await clickARectangle(page, "?debug=hits");
    await expect(page.locator(CROSSHAIR)).toHaveCount(1);
    await expect(page.locator("[data-hit-marker]")).toHaveCount(1);
  });

  test("AC-RAIL-IMAGE-1 — the rail's Image button shows the Image inspector for a frame that just received a photo @feat:editor-shell.panels.properties @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const frame = await designer.drawRectangle({ x0: 100, y0: 100, x1: 400, y1: 300 });
    await designer.selectElement("rectangle", frame);
    const props = page.locator("[data-properties-panel]");
    await expect(props).toHaveAttribute("data-inspector-kind", "frame");

    // A photo arrives in the selected frame.
    expect(await designer.placeImageLink(frame)).toBe(true);

    await page.locator('[data-panel-rail-item="paged.properties:image"]').click();
    await expect(props).toHaveAttribute("data-inspector-kind", "image");
    await expect(
      page.locator('[data-properties-section="fitting"]'),
    ).toBeVisible();
  });

  test("AC-RAIL-IMAGE-2 — Image on a frame with no photo says so instead of doing nothing @feat:editor-shell.panels.properties @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const frame = await designer.drawRectangle({ x0: 100, y0: 100, x1: 400, y1: 300 });
    await designer.selectElement("rectangle", frame);
    const props = page.locator("[data-properties-panel]");
    await expect(props).toHaveAttribute("data-inspector-kind", "frame");

    await page.locator('[data-panel-rail-item="paged.properties:image"]').click();
    await expect(props).toHaveAttribute("data-inspector-kind", "image");
    await expect(page.locator("[data-properties-no-image]")).toBeVisible();
  });
});
