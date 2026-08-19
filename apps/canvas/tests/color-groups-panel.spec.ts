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

// SDK Phase 5 (v1 sweep) — ColorGroups panel acceptance.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

test.describe("Phase 5 — Color Groups panel", () => {
  test("AC-CGROUPS-1 — panel mounts; lists groups or shows empty placeholder @feat:color-swatches.color-groups @feat:editor-shell.panels.color-groups @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.color-groups");
    await expect(
      page.locator('[data-color-groups-panel="ready"]'),
    ).toBeVisible();
    const list = page.locator(
      '[data-color-groups-panel="ready"] [data-color-group-list]',
    );
    const empty = page.locator(
      '[data-color-groups-panel="ready"] [data-empty-color-groups]',
    );
    const listVisible = await list.isVisible();
    const emptyVisible = await empty.isVisible();
    expect(listVisible || emptyVisible).toBe(true);
  });

  test("AC-CGROUPS-2 — New group creates; delete removes (live ops) @feat:color-swatches.color-groups @feat:editor-shell.panels.color-groups @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.color-groups");
    const rows = page.locator(
      '[data-color-groups-panel="ready"] [data-group-id]',
    );
    const before = await rows.count();
    // "+ New group" rides createColorGroup.
    await page.locator('[data-toolbar-btn="new-color-group"]').click();
    await expect.poll(() => rows.count()).toBe(before + 1);
    // Groups render open by default (deep1: chips inline) — the
    // empty group shows the honest empty note immediately.
    const newRow = rows.last();
    await expect(newRow.locator("[data-group-members]")).toBeVisible();
    // Delete rides deleteColorGroup (swatches stay).
    await newRow.locator("[data-group-delete]").click();
    await expect.poll(() => rows.count()).toBe(before);
  });
});
