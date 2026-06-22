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

// E2E gesture suite — replay determinism, from the gesture test plan
// (thoughts/docs/paged/tests/gestures.md): INV-3 / GSM-11. The same
// input "tape" (a fixed begin→update×N→commit sequence with mixed
// modifiers, snap pass INCLUDED) replayed against a fresh document
// load must produce a byte-identical model dump and a byte-identical
// page raster. This is the e2e face of the engine's determinism
// guarantee (single-threaded CPU renderer, signature-keyed layout
// cache) — any drift here is an engine bug, not flake.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type LoadedFixture,
} from "./harness/fixtures";
import { pagePng, runGesture } from "./harness/gesture";
import { dumpElement } from "./harness/model-dump";

/** One fresh load + the fixed three-gesture tape; returns the final
 *  model dump + raster bytes. */
async function runTape(
  page: Page,
): Promise<{ dump: string; png: Buffer }> {
  await openCanvas(page);
  const fx: LoadedFixture = await loadFixture(page, "geometry");
  const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
  const ref = target.ref;
  const pageInfo = fx.pages[target.pageIndex];
  const rect = (await elementPageRectPt(page, ref))!;
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;

  // Gesture 1 — translate, Shift flapping mid-drag, snap pass live.
  await runGesture(page, [ref], { kind: "translate" }, [
    { delta: [12, 5], mods: { shift: true, alt: false } },
    { delta: [33, 21], mods: { shift: false, alt: false } },
  ]);
  // Gesture 2 — rotate about the centroid with a Shift-snapped angle.
  await runGesture(
    page,
    [ref],
    { kind: "rotate" },
    [{ delta: [-40, 55], mods: { shift: true, alt: false } }],
    { anchor: { pageId: pageInfo.pageId, pointInPage: [cx + 100, cy] } },
  );
  // Gesture 3 — alt resize from centre.
  await runGesture(page, [ref], { kind: "resize", handle: "southEast" }, [
    { delta: [18, 9], mods: { shift: false, alt: true } },
  ]);

  return {
    dump: await dumpElement(page, ref),
    png: await pagePng(page, pageInfo.pageId, pageInfo.widthPt),
  };
}

test.describe("INV-3 — gesture replay determinism", () => {
  test("AC-E2E-GEST-DET-1 — identical tape on a fresh load reproduces dump + raster byte-identically @feat:editor-tools.gesture-lifecycle @level:happy", async ({
    page,
  }) => {
    const first = await runTape(page);
    // Full fresh run: re-navigate (new worker, new wasm instance,
    // fresh document load) and replay the identical tape.
    const second = await runTape(page);

    expect(second.dump, "model dump reproduced byte-for-byte").toBe(first.dump);
    expect(
      second.png.equals(first.png),
      "page raster reproduced byte-for-byte",
    ).toBe(true);
  });
});
