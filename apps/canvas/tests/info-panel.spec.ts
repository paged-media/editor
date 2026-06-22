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

// SDK Phase 5 (v1 sweep) — Info panel acceptance.
//
// Validates the `useDocumentMeta()` hook + DocumentMetaReply wire
// end-to-end. The panel renders six rows (Pages / Active page /
// Units / Color mode / Document / Dirty) backed by the singleton
// `CanvasModel::document_meta()` reply.

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/geometry-groups.idml`;

test.describe("Phase 5 — Info panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.info");
  });

  test("AC-INFO-1 — panel mounts and surfaces the six DocumentMeta fields @feat:editor-shell.panels.info @level:smoke", async ({
    page,
  }) => {
    await expect(page.locator('[data-info-panel="ready"]')).toBeVisible();
    for (const label of [
      "Pages",
      "Active page",
      "Units",
      "Color mode",
      "Document",
      "Dirty",
    ]) {
      await expect(page.locator(`[data-info-row="${label}"]`)).toBeVisible();
    }
  });

  test("AC-INFO-2 — Pages row reflects the loaded document's page count", async ({
    page,
  }) => {
    const value = await page
      .locator('[data-info-row="Pages"] [data-info-value]')
      .textContent();
    // Fixture has ≥1 page; assert numeric non-zero.
    expect(value && /^[0-9]+$/.test(value)).toBe(true);
    expect(Number(value)).toBeGreaterThan(0);
  });
});
