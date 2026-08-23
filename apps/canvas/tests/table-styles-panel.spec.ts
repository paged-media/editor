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

// Table Styles panel behaviour (audit 17082026 B8/B9 — this panel was
// green via the panel-sweep mount smoke only). The panel lists the
// REAL table styles off the document's `tableStyles` collection
// inside the striped preview card. The apply select is deliberately
// disabled (wire-shape only until the Table NodeId surface lands —
// engine gap 8), so the honest behaviour to pin is the real-content
// list from a document that actually uses table styles.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
// tables.idml — the table fixture — ships AltRows + AltCols table
// styles (applied to real tables) alongside [No table style].
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/tables.idml`;

type StyleRow = { selfId: string; name: string; basedOn: string | null };

/** Read the live `tableStyles` collection straight off the wire. */
async function wireTableStyles(page: Page): Promise<StyleRow[]> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (
              n: string,
            ) => Promise<
              { selfId: string; name: string; basedOn: string | null }[]
            >;
          };
        };
      }
    ).__canvas;
    return c.client.collection("tableStyles");
  });
}

test.describe("Table Styles panel", () => {
  test("AC-TABLESTYLES-1 — the table document's table styles list in the preview card @feat:editor-shell.panels.table-styles @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.table-styles");
    await expect(
      page.locator('[data-table-styles-panel="ready"]'),
    ).toBeVisible();

    // Real content: one row per wire TableStyleSummary, keyed by
    // selfId, name rendered with the $ID/ prefix stripped.
    const styles = await wireTableStyles(page);
    expect(styles.map((s) => s.name)).toEqual(
      expect.arrayContaining(["AltRows", "AltCols"]),
    );
    const rows = page.locator("[data-table-style-list] [data-style-id]");
    await expect(rows).toHaveCount(styles.length);
    for (const s of styles) {
      await expect(page.locator(`[data-style-id="${s.selfId}"]`)).toContainText(
        s.name.replace(/^\$ID\//, ""),
      );
    }

    // With rows present, the empty placeholder must NOT render — and
    // the apply select stays an HONEST disabled seam (gap 8), never
    // fake-interactive.
    await expect(page.locator("[data-empty-table-styles]")).toHaveCount(0);
    await expect(
      page.locator('[data-apply-select][data-collection="tableStyles"]'),
    ).toBeDisabled();
  });
});
