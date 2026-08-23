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

// Output readiness panel behaviour (audit 17082026 B8/B9 — this panel
// was green via the panel-sweep mount smoke only). Every row is
// honest-or-live: the LIVE checks read the real W0.6 wire summaries
// (missing links off `LinkSummary.status`, fonts, CMYK working
// space), the bleed row is a declared seam. A document with broken
// links must FAIL the links check with the exact wire count, and the
// header X-4 verdict must be the AND of the live checks.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
// links-broken.idml ships placements whose link targets are missing —
// the real not-ready document.
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/links-broken.idml`;

/** Count missing links straight off the wire (the panel's own read). */
async function wireMissingLinks(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<{ status: string }[]>;
          };
        };
      }
    ).__canvas;
    const links = await c.client.collection("links");
    return links.filter((l) => l.status === "missing").length;
  });
}

test.describe("Output readiness panel", () => {
  test("AC-READY-1 — broken links fail the live links check with the wire's count; the X-4 verdict reads Not ready @feat:editor-shell.panels.output-readiness @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.output-readiness");
    await expect(
      page.locator("[data-output-readiness-panel]"),
    ).toBeVisible();

    // The fixture really is broken on the wire.
    const missing = await wireMissingLinks(page);
    expect(missing).toBeGreaterThan(0);

    // LIVE row: the links check runs and FAILS, detail = the exact
    // wire count.
    const linksRow = page.locator('[data-readiness-row="links"]');
    await expect(linksRow).toHaveAttribute("data-readiness-pass", "false");
    await expect(linksRow).toContainText(`${missing} missing`);

    // HONEST row: bleed has no wire accessor yet — a visible seam,
    // never a fabricated verdict.
    const bleedRow = page.locator('[data-readiness-row="bleed"]');
    await expect(bleedRow).toHaveAttribute("data-seam", "");
    await expect(bleedRow).toContainText("soon");

    // The X-4 verdict is the AND of the live checks — a failing links
    // check makes the document Not ready.
    await expect(
      page.locator('[data-status-pill="readiness-x4"]'),
    ).toHaveText("Not ready");
  });
});
