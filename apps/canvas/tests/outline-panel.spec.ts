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

// Outline panel behaviour (audit 17082026 B8/B9 — this panel was
// green via the panel-sweep mount smoke only). The panel renders the
// document's STRUCTURE: the Tier-3 resolver's heading anchors (style
// name "Heading N" → level) with their resolved page numbers, in
// reading order. Loaded through the real file-input flow because the
// panel reads `useDocument().handle` + `resolution` — the fidelity
// driver's direct `client.loadDocument` bypasses that React state.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
// navigation.idml carries two "Heading"-styled paragraphs —
// "Getting Started" and "Going Further" — the fixture's real
// document structure.
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/navigation.idml`;

/** Load via the React file-input flow so `useDocument().handle`
 *  populates (same idiom as cockpit-panels.spec). */
async function loadViaInput(page: Page, fixture: string): Promise<void> {
  await page.setInputFiles('input[type="file"]', fixture);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
            .ready,
      ),
    )
    .toBe(true);
}

test.describe("Outline panel", () => {
  test("AC-OUTLINE-1 — the document's heading structure renders with resolved page numbers @feat:editor-shell.panels.outline @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadViaInput(page, FIXTURE);
    await openPanel(page, "paged.outline");

    // The fixture's REAL headings render as outline entries, in
    // reading order, each carrying the resolver's page number in its
    // jump-to title. `.first()`: the cockpit can hold the panel in
    // two dock groups at once (the default structure group + the
    // openPanel tab) — identical content, so one instance is the
    // assertion target.
    const first = page.locator('button[title^="Getting Started"]').first();
    const second = page.locator('button[title^="Going Further"]').first();
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    await expect(first).toHaveAttribute(
      "title",
      /^Getting Started \(page \d+\)$/,
    );
    await expect(second).toHaveAttribute(
      "title",
      /^Going Further \(page \d+\)$/,
    );

    // The declared empty state must NOT be showing — the panel found
    // structure, it didn't fall back.
    await expect(
      page.getByText("No heading anchors or TOC entries detected."),
    ).toHaveCount(0);
  });
});
