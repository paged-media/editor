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

// Data suite (source / mapping / generated pages) — INERT AT HEAD,
// and this spec pins exactly that (audit 17082026 B8/B9: the row was
// green via the panel-sweep mount smoke + styleguide shots of OTHER
// panels). The registry says `planned` ("data-publishing engine");
// the built-in Data Source panel (the surface the sweep proves for
// this row) is an honest seam: a "not connected" source pill + the
// ComingSoon record/field promise. NOTE: the LIVE data-mode surface
// is the paged.data PLUGIN's bindings panel — a different feature
// row; this built-in suite stays a stub until the data-publishing
// engine replaces it, at which point this spec MUST become a real
// source→mapping behaviour test.

import { test, expect } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";

test.describe("Data suite panel (honest stub)", () => {
  test("AC-DATASUITE-1 — the not-connected source seam + declared ComingSoon, with no fake-interactive entry @feat:editor-shell.panels.data-suite @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await openPanel(page, "paged.data-source");

    const panel = page.locator("[data-data-source-panel]");
    await expect(panel).toBeVisible();

    // The source section says plainly it is NOT connected — no fake
    // source rows.
    await expect(panel.getByText("not connected")).toBeVisible();

    // The record/field surface is a declared ComingSoon naming its
    // dependency (the data-publishing engine's records & fields).
    const stub = panel.locator("[data-coming-soon]");
    await expect(stub).toBeVisible();
    await expect(stub).toContainText("Records & fields coming soon");
    await expect(stub).toContainText("data-publishing engine");

    // No dead data-entry chrome: nothing typable/selectable exists
    // while the engine does not (the section header's collapse
    // toggle is the kit's, not a data control).
    await expect(panel.locator("input, select, textarea")).toHaveCount(0);
  });
});
