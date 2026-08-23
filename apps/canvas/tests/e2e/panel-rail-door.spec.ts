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

// K-8 — the panel-rail + icon contribution door. A registered panel that
// opts in (`rail: true`) appears as a LIVE rail launcher after the app's
// built-ins, renders its plugin-supplied SANITIZED SVG glyph (the icon
// registry stays closed — this is the door), toggles its dock tab, and
// drops off the rail when disposed. Registered at runtime through the
// real registry — exactly what a bundle's contribute.panel does.

import { test, expect } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";

declare global {
  interface Window {
    __canvas: {
      registries: {
        panels: {
          register(c: unknown): { dispose(): void };
        };
      };
    };
    __railDoorDispose?: () => void;
  }
}

const PANEL_ID = "test.railDoor.panel";

test.describe("K-8 — panel rail + icon door", () => {
  test("a rail-opted panel appears with its sanitized glyph, toggles its tab, and unregisters cleanly @feat:plugin-platform.panel-rail-door @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);

    await page.evaluate((id) => {
      const handle = window.__canvas.registries.panels.register({
        id,
        title: "Door",
        component: () => null,
        rail: true,
        // A benign circle PLUS the attack surface the sanitizer must
        // strip: a script block (with markup inside), a foreignObject
        // subtree, a case-variant event handler, and a data: URL href.
        iconSvg:
          '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/>' +
          '<script>window.__railDoorPwned = true; var x = "<b>markup</b>"</script>' +
          '<foreignObject x="0" y="0" width="24" height="24">' +
          '<img src="x" onerror="window.__railDoorPwned = true"/></foreignObject>' +
          '<rect x="1" y="1" width="4" height="4" ONClick="window.__railDoorPwned = true"/>' +
          "<use href=\"data:image/svg+xml,<svg onload='window.__railDoorPwned = true'/>\"/>",
      });
      window.__railDoorDispose = () => handle.dispose();
    }, PANEL_ID);

    // The rail item appears (registry-derived, live — no reload).
    const item = page.locator(`[data-panel-rail-item="${PANEL_ID}"]`);
    await expect(item).toBeVisible();

    // The glyph rendered SANITIZED: the circle survives; script and
    // foreignObject subtrees are gone, the case-variant handler and the
    // data: href are dropped, and the payload never executed.
    await expect(item.locator("svg circle")).toHaveCount(1);
    await expect(item.locator("svg script")).toHaveCount(0);
    await expect(item.locator("svg foreignObject, svg img")).toHaveCount(0);
    await expect(item.locator("svg rect[onclick]")).toHaveCount(0);
    await expect(item.locator("svg use[href]")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as { __railDoorPwned?: boolean }).__railDoorPwned,
      ),
    ).toBeUndefined();

    // Click → the panel opens as the active dock tab; click again → closes.
    await item.click();
    await expect(page.locator(`[data-dock-tab="${PANEL_ID}"]`)).toBeVisible();
    await expect(item).toHaveAttribute("data-active", "true");
    await item.click();
    await expect(page.locator(`[data-dock-tab="${PANEL_ID}"]`)).toHaveCount(0);

    // Dispose → the rail item drops (the platform-honesty rule).
    await page.evaluate(() => window.__railDoorDispose?.());
    await expect(item).toHaveCount(0);
  });
});
