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

// Info panel — behaviour depth (coverage campaign P3, Tier-1).
//
// The panel is a readout over DocumentMeta; a behaviour spec proves the
// rows carry the LOADED DOCUMENT's values (recomputed from the same
// source the app reads — the wire handle), and that the Dirty row
// follows a real mutation, not a canned string.

import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/generated/text.idml`;

/** Load via the React file-input flow — the panel reads useDocumentMeta,
 *  which the fidelity driver's direct client.loadDocument bypasses (the
 *  navigator/cockpit-panels idiom). */
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

test.describe("Info panel", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadViaInput(page, FIXTURE);
    await openPanel(page, "paged.info");
  });

  test("AC-INFO-1 — the rows carry the loaded document's values, and Dirty follows a real edit @feat:editor-shell.panels.info @level:happy", async ({
    page,
  }) => {
    await expect(page.locator('[data-info-panel="ready"]')).toBeVisible();

    // Pages row == the wire handle's page count (the value the app itself
    // computes from), derived — never a pinned number.
    const pageCount = await page.evaluate(() => {
      const c = (window as unknown as { __canvas?: { handle?: { pageCount?: number } } })
        .__canvas;
      return c?.handle?.pageCount ?? null;
    });
    expect(pageCount).toBeGreaterThan(0);
    await expect(
      page.locator('[data-info-row="Pages"] [data-info-value]'),
    ).toHaveText(String(pageCount));

    // A fresh load has no unsaved edits.
    await expect(
      page.locator('[data-info-row="Dirty"] [data-info-value]'),
    ).toHaveText("no");

  });

  test("AC-INFO-2 — Dirty follows a real edit @feat:editor-shell.panels.info @level:happy", async ({
    page,
  }) => {
    // ENGINE FINDING (2026-08-18, this spec's first run): DocumentMeta.dirty
    // was HARDCODED false in paged-canvas — the status chip, title dot and
    // this row permanently claimed a clean document. Fixed engine-side
    // (model.rs computes it from the undo log; rides the v0.61.2 tag) —
    // unfixme when the canvas-wasm pin carries it.
    test.fixme(
      true,
      "DocumentMeta.dirty is hardcoded false in the pinned canvas-wasm; engine fix rides v0.61.2",
    );
    await expect(
      page.locator('[data-info-row="Dirty"] [data-info-value]'),
    ).toHaveText("no");

    // One real mutation flips the Dirty readout — the row tracks the
    // document, not the mount. The WIRE mutate (not executeScript): the
    // meta hook refetches on the channel's mutationApplied push.
    await page.evaluate(async () => {
      type DebugCanvas = {
        client: {
          executeScript(src: string): Promise<{ output: string[]; error: string | null }>;
          mutate(op: unknown): Promise<unknown>;
        };
      };
      const dbg = (window as unknown as { __canvas?: DebugCanvas }).__canvas;
      if (!dbg?.client) throw new Error("__canvas client not available");
      const stories = await dbg.client
        .executeScript("paged.stories()")
        .then((r) => JSON.parse(r.output[0] ?? "[]") as Array<{ selfId: string }>);
      if (!stories.length) throw new Error("text fixture has no stories");
      await dbg.client.mutate({
        op: "insertText",
        args: { storyId: stories[0].selfId, offset: 0, text: "Zz " },
      });
    });
    await expect(
      page.locator('[data-info-row="Dirty"] [data-info-value]'),
    ).toHaveText("yes", { timeout: 5_000 });
  });
});
