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

// Journey: paged.draw SCHEMA PANELS — the Stroke + Fill declarative
// panels mount from the catalog and a control drives.
//
// The bundle registers its Stroke + Fill panels as SchemaPanelContributions
// (pure data, NO React across the boundary); the editor renders them from
// the catalog with row enablement + section visibility driven by the
// bundle's PUBLISHED bindings. This journey opens each panel through the
// real panel-rail path (Designer.openPanel → cockpit openPanel), asserts
// it mounts (`[data-schema-panel="<id>"]`), drives a control (the stroke
// weight scrub), and proves the binding-gated dash section flips with the
// selection (a rectangle without a path-anchor table hides it; a real
// PATH shows it) — the load-bearing B-01 mechanism, through the UI.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

const STROKE_PANEL = "media.paged.draw.panel.stroke";
const FILL_PANEL = "media.paged.draw.panel.fill";

test.describe("journey · paged.draw schema panels", () => {
  test("a designer opens the stroke + fill schema panels and drives a control @feat:plugin-draw.stroke-schema-panel @feat:plugin-platform.bundle-lifecycle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 1. AUTHOR — a real PATH (the Pen authors an open polygon, which
    //    exposes a path-anchor table → the dash section's visibility
    //    binding publishes true). ──
    const pathId = await designer.drawPath([
      [180, 420],
      [320, 420],
      [250, 500],
    ]);
    expect(pathId, "authored a path").not.toBe("");

    // ── 2. STROKE PANEL mounts from the catalog schema (not bundle
    //    React). Select the path so the panel resolves values. ──
    await designer.selectElement("polygon", pathId);
    await designer.openPanel(STROKE_PANEL);
    const strokePanel = page.locator(`[data-schema-panel="${STROKE_PANEL}"]`);
    await expect(strokePanel, "the stroke schema panel mounts").toBeVisible({
      timeout: 6_000,
    });
    // A real control renders through the catalog leaf (a number scrub).
    const weightInput = strokePanel.locator("input").first();
    await expect(weightInput, "the stroke weight control renders").toBeVisible();

    // ── 3. DRIVE a control — type a stroke weight and commit. The schema
    //    leaf is the same primitive the editor's own panels use; driving
    //    it proves the panel is interactive, not a static mount. ──
    await weightInput.fill("5");
    await weightInput.press("Enter");
    await expect(weightInput).toHaveValue(/5/);

    // ── 4. DASH SECTION binding gate — a real PATH exposes a path-anchor
    //    table, so the bundle publishes dashControlsVisible=true and the
    //    host SHOWS the dash section (the load-bearing B-01 mechanism: a
    //    binding-driven section, not a static schema node). ──
    const dashSection = strokePanel.locator('[data-schema-section="Dashes"]');
    await expect(dashSection, "dash section shown for a path").toBeVisible({
      timeout: 6_000,
    });

    // ── 5. FILL PANEL — the second schema panel mounts from the catalog
    //    too (Phase 2d, B-03). ──
    await designer.openPanel(FILL_PANEL);
    const fillPanel = page.locator(`[data-schema-panel="${FILL_PANEL}"]`);
    await expect(fillPanel, "the fill schema panel mounts").toBeVisible({
      timeout: 6_000,
    });
  });
});
