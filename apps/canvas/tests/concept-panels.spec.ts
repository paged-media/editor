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

// Panel-gallery pass — the CONCEPT / PARTIAL panels (INDESIGN_PARITY.md:
// Table / Glyphs / Bullets & Numbering + Object Export Options /
// Export Tagging). Each opens from the registry, renders its
// kit-shaped seam structure with the Concept (or Partial) badge + the
// Target footnote, and keeps every unbacked control disabled. Glyphs'
// live insertion is covered separately (glyphs-panel.spec.ts).
//
// W2.4 (2026-06-06): Tabs flipped fully LIVE — its whole-list
// `paragraphTabStops` editor has no remaining seams, so it left this
// list and gained its own acceptance + op-sandwich coverage
// (tabs-panel.spec.ts / e2e/tabs-ops.spec.ts). Bullets & Numbering
// went PARTIAL — list type + bullet glyph + numbering format are live
// over the v28 text paths, with the list-definition rows still seamed
// (badge flips concept→partial, the Glyphs precedent).
//
// W3.A2 (2026-06-06): the Table panel flipped fully LIVE against the
// v30 table surface (cell fill/insets/vert-justify/applied styles +
// table style + row-height/col-width + insert/delete row/column,
// driven by the table cell selection). It left this list and gained
// its own op-sandwich coverage (e2e/table-ops.spec.ts).

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry-groups.idml`;

const CONCEPTS = [
  { id: "paged.glyphs", ready: "glyphs-panel", badge: "partial" },
  {
    id: "paged.bullets-numbering",
    ready: "bullets-panel",
    badge: "partial",
  },
  {
    id: "paged.object-export",
    ready: "object-export-panel",
    badge: "concept",
  },
  {
    id: "paged.export-tagging",
    ready: "export-tagging-panel",
    badge: "concept",
  },
];

test.describe("Panel gallery — concept panels", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
  });

  for (const c of CONCEPTS) {
    test(`AC-CONCEPT — ${c.id} opens with badge, target footnote and inert seams`, async ({
      page,
    }) => {
      await openPanel(page, c.id);
      const root = page.locator(`[data-${c.ready}="ready"]`);
      await expect(root).toBeVisible();
      // The honest badge + the Target footnote.
      await expect(
        root.locator(`[data-panel-status="${c.badge}"]`),
      ).toBeVisible();
      await expect(root.locator("[data-panel-target]")).toBeVisible();
      // Every seam control is present and DISABLED.
      const seams = root.locator("[data-seam]");
      await expect.poll(() => seams.count()).toBeGreaterThanOrEqual(2);
      const seamButtons = root.locator(
        "[data-seam] button, button[data-seam], [data-seam] input, [data-seam] select, select[data-seam], textarea[data-seam]",
      );
      const n = await seamButtons.count();
      for (let i = 0; i < n; i++) {
        await expect(seamButtons.nth(i)).toBeDisabled();
      }
    });
  }

  test("AC-CONCEPT-TABS — Object Export tab switcher is live local state @feat:editor-shell.panels.bullets-numbering @feat:editor-shell.panels.export-tagging @feat:editor-shell.panels.object-export @feat:editor-shell.panels.table @feat:editor-shell.panels.tabs @level:happy", async ({
    page,
  }) => {
    await openPanel(page, "paged.object-export");
    const root = page.locator('[data-object-export-panel="ready"]');
    await expect(
      root.locator('[data-export-tab="Alt Text"][data-active="true"]'),
    ).toBeVisible();
    await root.locator('[data-export-tab="Tagged PDF"]').click();
    await expect(
      root.locator('[data-export-tab="Tagged PDF"][data-active="true"]'),
    ).toBeVisible();
    // The Tagged PDF fields render (Role select seam).
    await expect(root.locator("[data-seam]").first()).toBeVisible();
  });

  test("AC-CONCEPT-SCOPE — Export Tagging scope toggle swaps the mapping @feat:editor-shell.panels.bullets-numbering @feat:editor-shell.panels.export-tagging @feat:editor-shell.panels.object-export @feat:editor-shell.panels.table @feat:editor-shell.panels.tabs @level:happy", async ({
    page,
  }) => {
    await openPanel(page, "paged.export-tagging");
    const root = page.locator('[data-export-tagging-panel="ready"]');
    await expect(root.locator("[data-tagging-preview]")).toContainText("<p");
    await root.locator('[data-scope="Character"]').click();
    await expect(root.locator("[data-tagging-preview]")).toContainText("<span");
  });
});
