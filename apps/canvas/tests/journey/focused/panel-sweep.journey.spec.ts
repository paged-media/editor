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

// Journey: every panel opens and mounts.
//
// A designer reaches for each panel in the workspace. This sweep opens all
// the panels the workflow journeys don't already drive and proves each
// registers + mounts (becomes the active right-dock tab) without crashing —
// the presence baseline for "every panel is exercised". Deeper per-control
// driving lives in the workflow journeys.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

// [cockpit panel id, registry feature it proves]
const PANELS: Array<[string, string]> = [
  ["paged.object-transform", "editor-shell.panels.object-transform"],
  ["paged.stroke", "editor-shell.panels.stroke"],
  ["paged.attributes", "editor-shell.panels.attributes"],
  ["paged.align", "editor-shell.panels.align"],
  ["paged.pathfinder", "editor-shell.panels.pathfinder"],
  ["paged.inspector", "editor-shell.panels.inspector"],
  ["paged.control", "editor-shell.panels.control"],
  ["paged.character-styles", "editor-shell.panels.character-styles"],
  ["paged.paragraph-styles", "editor-shell.panels.paragraph-styles"],
  ["paged.object-styles", "editor-shell.panels.object-styles"],
  ["paged.text-frame-options", "editor-shell.panels.text-frame-options"],
  ["paged.text-wrap", "editor-shell.panels.text-wrap"],
  ["paged.fonts", "editor-shell.panels.fonts"],
  ["paged.tabs", "editor-shell.panels.tabs"],
  ["paged.glyphs", "editor-shell.panels.glyphs"],
  ["paged.bullets-numbering", "editor-shell.panels.bullets-numbering"],
  ["paged.table", "editor-shell.panels.table"],
  ["paged.cell-styles", "editor-shell.panels.cell-styles"],
  ["paged.table-styles", "editor-shell.panels.table-styles"],
  ["paged.swatches", "editor-shell.panels.swatches"],
  ["paged.color", "editor-shell.panels.color"],
  ["paged.gradients", "editor-shell.panels.gradients"],
  ["paged.color-wheel", "editor-shell.panels.color-wheel"],
  ["paged.color-groups", "editor-shell.panels.color-groups"],
  ["paged.ink-manager", "editor-shell.panels.ink-manager"],
  ["paged.color-settings", "editor-shell.panels.color-settings"],
  ["paged.document-map", "editor-shell.panels.document-map"],
  ["paged.pages", "editor-shell.panels.pages-navigator"],
  ["paged.pages-list", "editor-shell.panels.pages-list"],
  ["paged.spreads", "editor-shell.panels.spreads"],
  ["paged.master-pages", "editor-shell.panels.master-pages"],
  ["paged.links", "editor-shell.panels.links"],
  ["paged.conditions", "editor-shell.panels.conditions"],
  ["paged.articles", "editor-shell.panels.list-collections"],
  ["paged.outline", "editor-shell.panels.outline"],
  ["paged.tree", "editor-shell.panels.tree"],
  ["paged.info", "editor-shell.panels.info"],
  ["paged.publication-health", "editor-shell.panels.publication-health"],
  ["paged.preflight", "editor-shell.panels.preflight"],
  ["paged.output-readiness", "editor-shell.panels.output-readiness"],
  ["paged.export-center", "editor-shell.panels.export-center"],
  ["paged.outputs", "editor-shell.panels.outputs"],
  ["paged.stories", "editor-shell.panels.stories"],
  ["paged.comments", "editor-shell.panels.comments"],
  ["paged.data-source", "editor-shell.panels.data-suite"],
  ["paged.component-library", "editor-shell.panels.component-library"],
  ["paged.object-export", "editor-shell.panels.object-export"],
  ["paged.export-tagging", "editor-shell.panels.export-tagging"],
  ["paged.anchored", "editor-shell.panels.anchored"],
  ["paged.problems", "editor-shell.panels.problems"],
];

test.describe("journey · panel sweep", () => {
  test(
    "every workspace panel opens and mounts",
    { tag: [...PANELS.map(([, f]) => `@feat:${f}`), "@level:smoke"] },
    async ({ page }) => {
      const designer = new Designer(page);
      await designer.open();
      await designer.newDocument();

      const failed: string[] = [];
      for (const [pid] of PANELS) {
        await designer.openPanel(pid);
        const open = await page.evaluate(() => {
          const c = (
            globalThis as unknown as {
              __canvas: {
                debugContext: () => {
                  panels: { open: string[]; active: string | null };
                };
              };
            }
          ).__canvas;
          const p = c.debugContext().panels;
          return [p.active, ...p.open].filter(Boolean) as string[];
        });
        if (!open.includes(pid)) failed.push(pid);
      }

      expect(failed, `panels that failed to open: ${failed.join(", ")}`).toEqual(
        [],
      );
    },
  );
});
