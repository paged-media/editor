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

// Cell Styles panel behaviour (audit 17082026 B8/B9 — this panel was
// green via the panel-sweep mount smoke only). The panel lists the
// REAL cell styles off the document's `cellStyles` collection, with
// the based-on lineage chip per derived style. The apply select is
// deliberately disabled (wire-shape only until the Table NodeId
// surface lands — engine gap 8), so the honest behaviour to pin is
// the real-content list, not a fake apply.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
// styles-cascade.idml ships CellBase + CellDerived (BasedOn=CellBase)
// — a real two-row cell-style collection with lineage.
const FIXTURE = `${REPO_ROOT}/corpus/generated/styles-cascade.idml`;

type StyleRow = { selfId: string; name: string; basedOn: string | null };

/** Read the live `cellStyles` collection straight off the wire. */
async function wireCellStyles(page: Page): Promise<StyleRow[]> {
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
    return c.client.collection("cellStyles");
  });
}

test.describe("Cell Styles panel", () => {
  test("AC-CELLSTYLES-1 — the document's cell styles list with their based-on lineage @feat:editor-shell.panels.cell-styles @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.cell-styles");
    await expect(
      page.locator('[data-cell-styles-panel="ready"]'),
    ).toBeVisible();

    // Real content: one row per wire CellStyleSummary, keyed by selfId.
    const styles = await wireCellStyles(page);
    expect(styles.length).toBeGreaterThanOrEqual(2);
    expect(styles.map((s) => s.name)).toEqual(
      expect.arrayContaining(["CellBase", "CellDerived"]),
    );
    const rows = page.locator("[data-cell-style-list] [data-style-id]");
    await expect(rows).toHaveCount(styles.length);
    for (const s of styles) {
      await expect(page.locator(`[data-style-id="${s.selfId}"]`)).toContainText(
        s.name.replace(/^\$ID\//, ""),
      );
    }

    // The derived style carries its lineage chip (← base).
    const derived = styles.find((s) => s.name === "CellDerived")!;
    expect(derived.basedOn).not.toBeNull();
    await expect(
      page.locator(`[data-style-id="${derived.selfId}"]`),
    ).toContainText("CellBase");

    // With rows present, the empty placeholder must NOT render — and
    // the apply select stays an HONEST disabled seam (gap 8), never
    // fake-interactive.
    await expect(page.locator("[data-empty-cell-styles]")).toHaveCount(0);
    await expect(
      page.locator('[data-apply-select][data-collection="cellStyles"]'),
    ).toBeDisabled();
  });
});
