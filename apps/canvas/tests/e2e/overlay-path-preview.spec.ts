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

// E2E — the B-07 path/cubic tool-preview overlay (W3.3). The
// tool-preview channel (`overlay.setToolPreview`) gained a variant that
// carries the TRUE anchor/handle run of an in-progress pen path, so the
// shell overlay renders ONE real SVG <path> of `C` commands instead of
// a flattened polyline — exact at any zoom, no per-pointermove sampling.
//
// This proves the SHELL renderer end of that contract in a real browser:
// push a `ToolPreviewPath` straight through the overlay-signals writer
// (the same writer a pen handler calls — exposed for tests as
// `__overlaySignals`, since PagedShell builds `__canvas` ABOVE the
// OverlaySignalsProvider) and assert a single <path> appears in the
// overlay SVG with cubic `C` commands. The plugin-draw side (the pen
// machine emitting the cubic preview) is unit-proven in draw-tools
// (penPreview), and the headless host records the variant in plugin-sdk.

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

/** Drive a tool preview straight into the overlay-signals writer (the
 *  B-07 path variant, or `null` to clear). */
async function setToolPreview(page: Page, value: unknown): Promise<void> {
  await page.evaluate((v) => {
    (
      globalThis as unknown as {
        __overlaySignals: { setToolPreview: (s: unknown) => void };
      }
    ).__overlaySignals.setToolPreview(v);
  }, value);
}

/** Read the `d` of every tool-preview <path>. The path-variant preview
 *  is the ONLY <path> the tool-preview overlay emits, and it authors the
 *  snap-teal token attribute — scope to that so icon-glyph / chrome paths
 *  elsewhere in the DOM can't be mistaken for the preview. */
async function previewPathDs(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll('svg path[stroke="var(--overlay-snap)"]'),
    ).map((p) => p.getAttribute("d") ?? ""),
  );
}

test.describe("B-07 — path/cubic tool-preview overlay (W3.3)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadViaReactPath(page, "geometry");
    // Wait for the overlay-signals test bridge to publish.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            typeof (globalThis as unknown as { __overlaySignals?: unknown })
              .__overlaySignals !== "undefined",
        ),
      )
      .toBe(true);
  });

  test("an in-progress cubic pen preview renders ONE <path> of C commands @feat:editor-tools.draw.pen @level:gesture", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    // A two-anchor open run with a CURVED segment: the second anchor's
    // incoming handle is offset from its anchor, so a flattened polyline
    // would have sampled it — a real <path> keeps it as one `C` cubic.
    await setToolPreview(page, {
      pageId,
      anchors: [
        { anchor: [120, 120], left: [120, 120], right: [180, 120] },
        { anchor: [240, 160], left: [200, 220], right: [240, 160] },
      ],
      close: false,
    });

    await expect
      .poll(() => previewPathDs(page), { timeout: 5_000 })
      .toHaveLength(1);
    const cubic = (await previewPathDs(page))[0];
    expect(cubic, "the preview is a real cubic <path>").toBeTruthy();
    // One M (subpath start) + one C (the single curved segment), no
    // intermediate L/sampled vertices — the flatten artefact is gone.
    expect((cubic.match(/C/g) ?? []).length).toBe(1);
    expect(cubic).not.toContain("L");

    // Clearing the preview removes the <path>.
    await setToolPreview(page, null);
    await expect.poll(() => previewPathDs(page).then((d) => d.length)).toBe(0);
  });

  test("a closed cubic preview emits a Z-terminated <path> @feat:editor-tools.draw.pen @level:happy", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    await setToolPreview(page, {
      pageId,
      anchors: [
        { anchor: [120, 120], left: [120, 120], right: [120, 120] },
        { anchor: [220, 120], left: [220, 120], right: [220, 120] },
        { anchor: [170, 200], left: [170, 200], right: [170, 200] },
      ],
      close: true,
    });
    await expect
      .poll(() => previewPathDs(page), { timeout: 5_000 })
      .toHaveLength(1);
    const closed = (await previewPathDs(page))[0];
    expect(closed.endsWith("Z"), "closed contour is Z-terminated").toBe(true);
    // Three placed anchors closed → three cubic segments (the closing
    // edge back to anchor 0 included).
    expect((closed.match(/C/g) ?? []).length).toBe(3);
  });

  test("the path preview strokes the snap-teal token (one preview family) @feat:editor-tools.draw.pen @level:happy", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    await setToolPreview(page, {
      pageId,
      anchors: [
        { anchor: [120, 120], left: [120, 120], right: [180, 120] },
        { anchor: [240, 160], left: [200, 220], right: [240, 160] },
      ],
    });
    await expect
      .poll(() => previewPathDs(page), { timeout: 5_000 })
      .toHaveLength(1);
    // The resolved stroke is the DTP snap teal (dark theme #14b8a6) — the
    // same token the rest of the tool-preview family authors. The
    // attribute-rule hook (globals.css) re-applies the var() a
    // presentation attribute can't resolve.
    const stroke = await page.evaluate(() => {
      const path = document.querySelector(
        'svg path[stroke="var(--overlay-snap)"]',
      );
      return path ? getComputedStyle(path).stroke : null;
    });
    expect(stroke).toBe("rgb(20, 184, 166)");
  });
});
