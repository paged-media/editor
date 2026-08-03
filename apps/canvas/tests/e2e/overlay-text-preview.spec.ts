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

// E2E — the overlay TEXT primitive (the plugin RFI gap "the overlay
// channel carries shapes only, no text primitive"; consumer:
// paged.draw's Measure tool readout). The tool-preview channel gained a
// `{ kind: "text", pageId, x, y, text, size?, anchor?, background? }`
// variant; the shell overlay renders it as an SVG <text> at constant
// SCREEN size (the page-caption idiom), with an optional backing plate.
//
// This proves the SHELL renderer end of the contract in a real browser
// (the B-07 path-preview pattern): push a ToolPreviewText straight
// through the overlay-signals writer (`__overlaySignals` — the same
// writer `host.overlay.setToolPreview` reaches) and assert the label
// renders SANITIZED (plain text only — markup stays inert, control
// chars stripped), tokened (snap-teal — the one preview family), and
// clears. The plugin-sdk side (pass-through + supports flag + the
// capability gate) is unit-proven in plugin-sdk overlay-text.spec.ts.

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

/** Drive a tool preview straight into the overlay-signals writer. */
async function setToolPreview(page: Page, value: unknown): Promise<void> {
  await page.evaluate((v) => {
    (
      globalThis as unknown as {
        __overlaySignals: { setToolPreview: (s: unknown) => void };
      }
    ).__overlaySignals.setToolPreview(v);
  }, value);
}

/** Text content of every snap-teal preview <text> (the bare variant's
 *  fill attribute is the globals.css re-apply hook — scoping to it keeps
 *  page captions / badge labels out of the read). */
async function previewLabels(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll('svg text[fill="var(--overlay-snap)"]'),
    ).map((t) => t.textContent ?? ""),
  );
}

test.describe("overlay TEXT primitive — the tool-preview readout", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadViaReactPath(page, "geometry");
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

  test("a text preview renders a sanitized snap-teal label and clears @feat:plugin-platform.overlay-channel @level:happy", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    // The Measure-readout shape — plus the attack/robustness surface the
    // sanitizer owns: markup must stay INERT TEXT (React escapes; no
    // element may materialize) and control chars (incl. newline — SVG
    // <text> has no line breaking) collapse to spaces.
    await setToolPreview(page, {
      kind: "text",
      pageId,
      x: 140,
      y: 120,
      text: "W 24 pt <b>bold?</b>\nH 13.5 pt",
      size: 12,
    });

    await expect
      .poll(() => previewLabels(page), { timeout: 5_000 })
      .toEqual(["W 24 pt <b>bold?</b>  H 13.5 pt"]);
    // The markup rendered as TEXT, never as an element.
    expect(
      await page.evaluate(() => document.querySelectorAll("svg text b").length),
    ).toBe(0);

    // The resolved fill is the DTP snap teal (dark theme #14b8a6) — the
    // attribute-rule hook (globals.css) re-applies the var() an SVG
    // presentation attribute can't resolve.
    const fill = await page.evaluate(() => {
      const t = document.querySelector('svg text[fill="var(--overlay-snap)"]');
      return t ? getComputedStyle(t).fill : null;
    });
    expect(fill).toBe("rgb(20, 184, 166)");

    // Clearing the preview removes the label (the transient-signal rule).
    await setToolPreview(page, null);
    await expect.poll(() => previewLabels(page)).toEqual([]);
  });

  test("background: true adds the backing plate; anchor maps to text-anchor @feat:plugin-platform.overlay-channel @level:happy", async ({
    page,
  }) => {
    const pageId = await firstPageId(page);
    await setToolPreview(page, {
      kind: "text",
      pageId,
      x: 200,
      y: 150,
      text: "12.70 mm",
      anchor: "middle",
      background: true,
    });

    // The plate: a rounded snap-teal rect behind the label (nothing else
    // in the overlay FILLS with the snap token — snap lines stroke it).
    const plate = page.locator('svg rect[fill="var(--overlay-snap)"]');
    await expect(plate).toHaveCount(1);
    await expect(plate).toHaveAttribute("rx", "3");

    // On the plate the label flips to white (the badge contrast idiom)
    // and honors the anchor.
    const label = page.locator('svg text[fill="white"]', {
      hasText: "12.70 mm",
    });
    await expect(label).toHaveCount(1);
    await expect(label).toHaveAttribute("text-anchor", "middle");

    await setToolPreview(page, null);
    await expect(plate).toHaveCount(0);
  });
});
