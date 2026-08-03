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

// K-7 / S-13 — the editor metrics RPC, end-to-end through the REAL
// worker shaper: `client.measureText` → `requestMeasureText` →
// `CanvasWorker.measureText` → `measureTextResult`. This is the lane
// `PagedEditor.text.measure` rides and the plugin-sdk host answers
// `host.text.measureString` from — `supports("text.measure@1")` flips
// true exactly when `PagedEditor.text` is present, which this spec
// also pins.

import { test, expect } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

type CanvasHandle = {
  __paged?: { text?: unknown };
  __canvas: {
    ready: boolean;
    client: {
      measureText(
        family: string,
        style: string | null,
        text: string,
        sizePt: number,
      ): Promise<{ advance: number; ascender: number; descender: number }>;
    };
  };
};

const SAMPLE = "Hamburgefonstiv";
const SIZE_PT = 12;

test.describe("K-7 — text metrics RPC", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    // The text fixture embeds Open Sans — a family the document's font
    // registry actually resolves, so the shaper path is exercised for
    // real (an unresolved family normalises to zeroed metrics).
    await page.setInputFiles('input[type="file"]', fixturePath("text"));
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (globalThis as unknown as CanvasHandle).__canvas.ready,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
  });

  test("the worker shaper returns real metrics, not the estimate; unresolved families fall back to a real face", async ({
    page,
  }) => {
    // The capability condition: the plugin-sdk host adds
    // `text.measure@1` iff `PagedEditor.text` exists on the handle.
    expect(
      await page.evaluate(
        () => (globalThis as unknown as CanvasHandle).__paged?.text != null,
      ),
      "PagedEditor.text is wired (the supports('text.measure@1') condition)",
    ).toBe(true);

    const metrics = await page.evaluate(
      ([family, sample, size]) =>
        (globalThis as unknown as CanvasHandle).__canvas.client.measureText(
          family as string,
          null,
          sample as string,
          size as number,
        ),
      ["Open Sans", SAMPLE, SIZE_PT] as const,
    );

    // Real OpenType metrics in points: positive advance/ascender,
    // NEGATIVE descender (the convention the door documents).
    expect(metrics.advance).toBeGreaterThan(0);
    expect(metrics.ascender).toBeGreaterThan(0);
    expect(metrics.descender).toBeLessThan(0);
    // Sanity band: the sample at 12pt sits between 0.25em and 1em
    // average per character for any real text face.
    expect(metrics.advance).toBeGreaterThan(SAMPLE.length * SIZE_PT * 0.25);
    expect(metrics.advance).toBeLessThan(SAMPLE.length * SIZE_PT * 1.0);

    // NOT the estimate fallback the SDK uses when no shaper is wired
    // (advance = len × size × 0.5, ascender = 0.8em, descender =
    // −0.2em). Matching all three exactly would mean the estimate
    // leaked through the "real" lane.
    const estimate = {
      advance: SAMPLE.length * SIZE_PT * 0.5,
      ascender: SIZE_PT * 0.8,
      descender: -SIZE_PT * 0.2,
    };
    expect(
      metrics.advance === estimate.advance &&
        metrics.ascender === estimate.ascender &&
        metrics.descender === estimate.descender,
      "metrics came from the shaper, not the 0.5em estimate",
    ).toBe(false);

    // An UNRESOLVED family with a document loaded rides the engine's
    // font-fallback (a fidelity feature — text never vanishes): the
    // shaper substitutes a real face and returns real metrics, not
    // zeros and not the estimate.
    const missing = await page.evaluate(
      ([sample, size]) =>
        (globalThis as unknown as CanvasHandle).__canvas.client.measureText(
          "No Such Family 9x9",
          null,
          sample as string,
          size as number,
        ),
      [SAMPLE, SIZE_PT] as const,
    );
    expect(missing.advance).toBeGreaterThan(0);
    expect(missing.descender).toBeLessThan(0);
  });
});

test.describe("K-7 — text metrics RPC, no document", () => {
  test("measuring before any document loads normalises to honest zeros", async ({
    page,
  }) => {
    await openCanvas(page);
    // No document → no font registry → the wasm shaper returns null;
    // the worker normalises that to zeroed metrics (a total payload,
    // never a fake measurement).
    const metrics = await page.evaluate(
      ([sample, size]) =>
        (globalThis as unknown as CanvasHandle).__canvas.client.measureText(
          "Open Sans",
          null,
          sample as string,
          size as number,
        ),
      [SAMPLE, SIZE_PT] as const,
    );
    expect(metrics).toEqual({ advance: 0, ascender: 0, descender: 0 });
  });
});
