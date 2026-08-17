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

// Ink Manager panel behaviour (audit 17082026 B8/B9 — this panel was
// green via the panel-sweep mount smoke only). The panel derives one
// row per SPOT ink from the loaded document's palette (`inks`
// collection) plus the four informational process plates, and its
// primary action — the per-ink convert-to-process toggle — dispatches
// a real `setInkSetting` mutation. The wire half of that op is
// already proven in color-concept2.spec (AC-8); this spec proves the
// PANEL: real document rows render, and the checkbox drives the wire.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
// swatches.idml ships two Spot-model colors ("Brand Ink",
// "Brand Ink 50%") — real spot rows without minting anything.
const FIXTURE = `${REPO_ROOT}/corpus/generated/swatches.idml`;

type InkRow = { spotId: string; name: string; convertToProcess: boolean };

/** Read the live `inks` collection straight off the wire. */
async function wireInks(page: Page): Promise<InkRow[]> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { collection: (n: string) => Promise<InkRow[]> } };
      }
    ).__canvas;
    type InkRow = { spotId: string; name: string; convertToProcess: boolean };
    return c.client.collection("inks") as Promise<InkRow[]>;
  });
}

test.describe("Ink Manager panel", () => {
  test("AC-INKS-1 — the document's spot inks list, and convert-to-process drives the wire @feat:editor-shell.panels.ink-manager @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.ink-manager");
    await expect(page.locator('[data-ink-manager="ready"]')).toBeVisible();

    // The four process plates are always present.
    await expect(page.locator("[data-ink-process]")).toHaveCount(4);

    // The document's REAL spot inks render one row each — names from
    // the palette, count matching the wire collection exactly.
    const inks = await wireInks(page);
    expect(inks.map((i) => i.name)).toContain("Brand Ink");
    await expect(page.locator("[data-ink-spot]")).toHaveCount(inks.length);
    for (const ink of inks) {
      await expect(
        page.locator(`[data-ink-spot="${ink.spotId}"]`),
      ).toContainText(ink.name);
    }
    // With spot inks present the empty placeholder must NOT render.
    await expect(page.locator('[data-inks="empty"]')).toHaveCount(0);

    // Primary action: the row's →CMYK checkbox dispatches
    // `setInkSetting { convertToProcess: true }` for THAT spot id.
    const brand = inks.find((i) => i.name === "Brand Ink")!;
    expect(brand.convertToProcess).toBe(false);
    const checkbox = page.locator(
      `[data-ink-spot="${brand.spotId}"] input[data-action="convert-to-process"]`,
    );
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();

    // The mutation lands in the engine — the wire InkSummary flips.
    await expect
      .poll(async () => {
        const after = await wireInks(page);
        return after.find((i) => i.spotId === brand.spotId)?.convertToProcess;
      })
      .toBe(true);
    // …and the panel re-read (mutationApplied refresh) agrees.
    await expect(checkbox).toBeChecked();
  });
});
