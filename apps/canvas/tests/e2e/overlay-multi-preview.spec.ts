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

// E2E — K-9, the MULTI-shape tool preview (the plugin RFI gap
// "setToolPreview is single-slot: one shape per tool, last write wins,
// and the editor renders one node"). Consumers: paged.draw's Measure —
// which traded the measured LINE for the frozen READOUT at pointer-up
// because the slot held one node — and its region Shape Builder, which
// could highlight the hovered face but not shade the collected set.
//
// This proves the SHELL renderer end in a real browser (the
// overlay-text-preview pattern): push a LIST through the overlay-signals
// writer (`__overlaySignals.setToolPreviews` — the same writer
// `host.overlay.setToolPreviews` reaches) and assert BOTH shapes render
// at once, that the list clears, and that the single-slot writer still
// behaves exactly as before. The plugin-sdk side (pass-through, the
// first-shape degradation on a host with no sink, the dynamic
// `overlay.multiPreview@1` flag, the capability gate) is unit-proven in
// plugin-sdk overlay-multi-preview.spec.ts.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { loadViaReactPath } from "./harness/viewport";

/** The first loaded page id — the `pageId` a preview is keyed to (the
 *  overlay only renders for a page present in its `pageRects` map). */
async function firstPageId(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (globalThis as unknown as { __canvas: { handle: { pageIds: string[] } } })
        .__canvas.handle.pageIds[0],
  );
}

/** Drive a LIST of tool previews into the overlay-signals writer. */
async function setToolPreviews(page: Page, value: unknown): Promise<void> {
  await page.evaluate((v) => {
    (
      globalThis as unknown as {
        __overlaySignals: { setToolPreviews: (s: unknown) => void };
      }
    ).__overlaySignals.setToolPreviews(v);
  }, value);
}

/** The single-slot writer, unchanged — asserted to still work. */
async function setToolPreview(page: Page, value: unknown): Promise<void> {
  await page.evaluate((v) => {
    (
      globalThis as unknown as {
        __overlaySignals: { setToolPreview: (s: unknown) => void };
      }
    ).__overlaySignals.setToolPreview(v);
  }, value);
}

/** Counts of the preview family's nodes: polylines, cubic paths and
 *  labels, all scoped to the snap-teal stroke/fill the tool-preview
 *  overlay owns (page chrome and selection handles use other tokens). */
async function previewCounts(
  page: Page,
): Promise<{ polylines: number; paths: number; labels: number }> {
  return page.evaluate(() => ({
    polylines: document.querySelectorAll(
      'svg polyline[stroke="var(--overlay-snap)"]',
    ).length,
    paths: document.querySelectorAll('svg path[stroke="var(--overlay-snap)"]')
      .length,
    labels: document.querySelectorAll('svg text[fill="var(--overlay-snap)"]')
      .length,
  }));
}

test.describe("overlay MULTI preview — geometry and a label at once (K-9)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadViaReactPath(page, "geometry");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            typeof (
              globalThis as unknown as {
                __overlaySignals?: { setToolPreviews?: unknown };
              }
            ).__overlaySignals?.setToolPreviews === "function",
        ),
      )
      .toBe(true);
  });

  test("renders a line AND its readout together, then clears @feat:plugin-platform.overlay-channel @level:happy", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    // Measure's exact pair: the measured segment plus the readout it
    // used to be swapped for at pointer-up.
    await setToolPreviews(page, [
      {
        pageId,
        points: [
          [60, 60],
          [220, 140],
        ],
      },
      {
        kind: "text",
        pageId,
        x: 140,
        y: 100,
        text: "178.89 pt · 26.6°",
        size: 12,
      },
    ]);

    await expect
      .poll(() => previewCounts(page), { timeout: 5_000 })
      .toMatchObject({ polylines: 1, labels: 1 });
    // The label is the real readout, not a truncation of it.
    expect(
      await page.evaluate(
        () =>
          document.querySelector('svg text[fill="var(--overlay-snap)"]')
            ?.textContent ?? "",
      ),
    ).toBe("178.89 pt · 26.6°");

    // Clearing removes BOTH — the list is one slot, not two layers.
    await setToolPreviews(page, null);
    await expect
      .poll(() => previewCounts(page))
      .toMatchObject({ polylines: 0, labels: 0 });
  });

  test("shades many region outlines at once (the Shape Builder case) @feat:plugin-platform.overlay-channel @level:happy", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    // Three collected faces as cubic anchor runs — the highlight the
    // single slot could only ever give to ONE of them.
    const face = (dx: number) => ({
      pageId,
      anchors: [
        { anchor: [dx, 40], left: [dx, 40], right: [dx, 40] },
        { anchor: [dx + 30, 40], left: [dx + 30, 40], right: [dx + 30, 40] },
        { anchor: [dx + 30, 70], left: [dx + 30, 70], right: [dx + 30, 70] },
      ],
      close: true,
    });
    await setToolPreviews(page, [face(40), face(90), face(140)]);
    await expect.poll(() => previewCounts(page), { timeout: 5_000 })
      .toMatchObject({ paths: 3 });

    // An EMPTY list clears, exactly like null (the contract's two
    // spellings of "nothing to show").
    await setToolPreviews(page, []);
    await expect.poll(() => previewCounts(page)).toMatchObject({ paths: 0 });
  });

  test("the single-slot writer is untouched and replaces a list @feat:plugin-platform.overlay-channel @level:edge", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    await setToolPreviews(page, [
      {
        pageId,
        points: [
          [60, 60],
          [220, 140],
        ],
      },
      { kind: "text", pageId, x: 140, y: 100, text: "two shapes" },
    ]);
    await expect
      .poll(() => previewCounts(page), { timeout: 5_000 })
      .toMatchObject({ polylines: 1, labels: 1 });

    // ONE slot: a single-shape write replaces the whole list rather than
    // layering under/over it — the additivity promise for every
    // built-in tool handler that still calls setToolPreview.
    await setToolPreview(page, {
      pageId,
      rect: [40, 40, 120, 200],
    });
    await expect
      .poll(() => previewCounts(page))
      .toMatchObject({ polylines: 0, labels: 0 });
    expect(
      await page.evaluate(
        () =>
          document.querySelectorAll('svg rect[stroke="var(--overlay-snap)"]')
            .length,
      ),
    ).toBe(1);

    await setToolPreview(page, null);
  });
});
