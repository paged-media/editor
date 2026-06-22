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

// SDK Phase 5 — Gradients panel acceptance.
//
// Validates that the collection-select primitive's
// `valueType: "colorRef"` extension generalises to the gradients
// collection. The panel mounts and the bound select carries the
// expected data attributes; gradient apply via FillColor is
// covered by the existing FrameFillColor unit tests + the
// Swatches panel's AC-SWATCH-2 (both flow through the same
// apply arm).

import { test, expect } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, loadIdml, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/gradients.idml`;

test.describe("Phase 5 — Gradients panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadIdml(page, FIXTURE);
    await openPanel(page, "paged.gradients");
  });

  test("AC-GRAD-1 — panel mounts as a composition with a gradients select @feat:color-swatches.gradients @feat:editor-shell.panels.gradients @level:smoke", async ({
    page,
  }) => {
    await expect(page.locator('[data-gradients-panel="ready"]')).toBeVisible();
    await expect(
      page.locator(
        '[data-gradients-panel="ready"] select[data-collection="gradients"][data-value-type="colorRef"]',
      ),
    ).toBeVisible();
  });
});
