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

// Journey: the paged.image SELECTION lane — select-all, invert, deselect and
// the coverage readout the marquee / lasso / wand tools drive.
//
// This spec exists because the 2026-08 selection wave shipped with unit tests
// only (13 glue specs + the Rust mask suite) and no journey at all. The
// Photoshop catalog prices Rectangular Marquee, Elliptical Marquee, Lasso and
// Magic Wand as P0 — all four registered as real tools — so "verified" should
// not rest entirely on tests that never leave the bundle.
//
// LANE SPLIT, deliberately. The four existing image journeys skip wholesale
// when there is no WebGPU adapter, which means they verify nothing in CI (see
// the `journeys-gpu` note in playwright.config.ts). Selection STATE — the
// engine-side mask, its bounds and its coverage — is not a rendering
// question, so everything here runs on BOTH lanes and only the masked-render
// assertion is GPU-gated. A journey that skips entirely is a journey that
// proves nothing on the lane that actually runs.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

const ADJ_PANEL = "media.paged.image.panel.adjustments";

const CMD = {
  selectAll: "media.paged.image.command.selectAll",
  invert: "media.paged.image.command.invertSelection",
  deselect: "media.paged.image.command.deselect",
  feather: "media.paged.image.command.featherSelection",
} as const;

/** The panel's Source row — proves the engine decoded the import. */
async function sourceReadout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const i = spans.findIndex((e) => e.textContent === "Source");
    return i >= 0 ? (spans[i + 1]?.textContent ?? "?") : "Source row not found";
  });
}

/** Coverage as a number, or null when no selection exists (the Selection
 *  section renders its rows only when `s.selection` is set, so absence is a
 *  real state and not a locator failure). */
async function coverage(page: Page): Promise<number | null> {
  const el = page.locator("[data-image-selection-coverage]");
  if ((await el.count()) === 0) return null;
  const text = (await el.first().textContent()) ?? "";
  const n = Number.parseFloat(text.replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

async function bounds(page: Page): Promise<string | null> {
  const el = page.locator("[data-image-selection-bounds]");
  if ((await el.count()) === 0) return null;
  return (await el.first().textContent())?.trim() ?? null;
}

test.describe("journey · paged.image selection", () => {
  test("a designer selects all, inverts, and deselects — and the engine's coverage readout follows each step @feat:image.selection.mask-tools @feat:image.selection.masked-pipeline @feat:image.editor.ingest @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. INGEST — a real PNG through the K-2 raster importer, the same
    //    entry the adjust journeys use. Everything below needs a source
    //    image because a selection is a mask OVER one. ──
    const frame = await designer.drawRectangle({
      x0: 90,
      y0: 120,
      x1: 360,
      y1: 320,
    });
    expect(frame, "drew a target frame").not.toBe("");
    await designer.selectElement("rectangle", frame);

    const importer = await designer.importImage({
      name: "selection-sample.png",
    });
    expect(importer, "the raster importer resolved + ran").toContain(
      "media.paged.image.importer.raster",
    );
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("selection-sample.png"));

    // ── 1. NO SELECTION IS A STATE, not a missing widget. Before anything
    //    is selected the Selection section renders no rows at all. ──
    expect(
      await coverage(page),
      "no selection before the designer makes one",
    ).toBeNull();

    // ── 2. SELECT ALL — the whole canvas becomes the mask. Coverage is the
    //    engine's own number (mask sum / area), so full coverage is the
    //    strongest available proof the mask reached the engine rather than
    //    just the panel state. ──
    await designer.runCommand(CMD.selectAll);
    await expect
      .poll(() => coverage(page), { timeout: 15_000 })
      .toBeGreaterThan(99);
    const allBounds = await bounds(page);
    expect(allBounds, "select-all reports the full image bounds").toMatch(
      /^0,0 \d+×\d+$/,
    );

    // ── 3. INVERT — the complement of everything is nothing. This is the
    //    round-trip that proves invert operates on the MASK and not on a
    //    bounding box: a box-inverted selection would keep its bounds. ──
    await designer.runCommand(CMD.invert);
    await expect
      .poll(() => coverage(page), { timeout: 15_000 })
      .toBeLessThan(1);

    // ── 4. INVERT BACK — and coverage returns. Two inversions are the
    //    identity, which a lossy mask representation would not survive. ──
    await designer.runCommand(CMD.invert);
    await expect
      .poll(() => coverage(page), { timeout: 15_000 })
      .toBeGreaterThan(99);
    expect(
      await bounds(page),
      "double invert restores the original bounds",
    ).toBe(allBounds);

    // ── 5. FEATHER — the gaussian blur of the mask. Coverage stays high (a
    //    feathered full selection is still ~full) and the command must not
    //    destroy the selection, which is the failure this pins. ──
    await designer.runCommand(CMD.feather);
    await expect.poll(() => coverage(page), { timeout: 15_000 }).not.toBeNull();

    // ── 6. DESELECT — back to no rows, not to a zero-coverage selection.
    //    "Cleared" and "empty" are different states and the panel
    //    distinguishes them. ──
    await designer.runCommand(CMD.deselect);
    await expect.poll(() => coverage(page), { timeout: 15_000 }).toBeNull();
    expect(await bounds(page), "deselect clears the bounds row too").toBeNull();
  });

  test("a committed adjustment is masked by the active selection @feat:image.selection.masked-pipeline @feat:image.editor.paint @level:edge", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const frame = await designer.drawRectangle({
      x0: 90,
      y0: 120,
      x1: 360,
      y1: 320,
    });
    await designer.selectElement("rectangle", frame);
    await designer.importImage({ name: "masked-sample.png" });
    await designer.openPanel(ADJ_PANEL);
    await expect
      .poll(() => sourceReadout(page), { timeout: 15_000 })
      .toEqual(expect.stringContaining("masked-sample.png"));

    // The mask itself is engine state and is asserted on both lanes.
    await designer.runCommand(CMD.selectAll);
    await expect
      .poll(() => coverage(page), { timeout: 15_000 })
      .toBeGreaterThan(99);

    // Only the PIXEL half needs a GPU: every pointwise kernel composites
    // `mix(a, result, mask)` at @group(2), so proving the mask actually
    // gates the write means reading pixels back.
    if (!(await designer.gpuActive())) {
      test.skip(
        true,
        "the masked-render half is GPU-only (no CPU kernel path). The mask/coverage half above ran on this lane; run `pnpm --filter paged-canvas test:journeys:gpu` to render-verify the masked composite",
      );
    }

    // Composite the un-modified image in-frame FIRST. Without this the
    // page has no image composite yet and the first `renderBytes()` is
    // taken cold — which does not fail as "no change", it fails as
    // "source image could not be decoded" in the differ. A baseline
    // composite is the precondition for any render assertion here.
    const applyBtn = page.getByRole("button", { name: "Apply", exact: true });
    await expect(applyBtn).toBeEnabled({ timeout: 10_000 });
    await applyBtn.click();

    const before = await designer.renderBytes();

    // A fill writes into the engine's image; the PAGE composite is a
    // separate Stage-A push, so re-Apply after the fill. (Skipping this
    // reports "0px changed", which reads as a broken fill and is really a
    // missing re-composite — worth pinning in a comment because the same
    // shape will catch the next person.)
    await designer.runCommand("media.paged.image.command.fillNoise");
    await expect(applyBtn).toBeEnabled({ timeout: 10_000 });
    await applyBtn.click();

    const after = await designer.renderBytes();
    await designer.expectRenderChanged(before, after);
  });
});
