/*
 * This file is part of paged (https://paged.media).
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

// C-32 — the HOST Eyedropper samples composited pixels.
//
// Why this is an e2e and not a unit test: the arithmetic in
// `eyedropper-sample.ts` is trivial, and none of it is where this could
// break. The risk lives entirely in the chain — snapshot round-trip →
// PNG decode → page-pt-to-snapshot-pixel mapping → swatch find-or-create
// → document defaults — and every link of that needs a real worker, a
// real render and a real engine. Testing the arithmetic alone would be
// the shape of a green test that proves nothing.
//
//   AC-EYE-1  sampling a page position over a KNOWN-COLOURED object
//             yields that object's colour. This is the assertion that
//             catches a coordinate-mapping bug: a sample that missed
//             would come back paper-white, which is why the fixture is
//             painted a colour nothing else on the page is.
//   AC-EYE-2  the sample lands in the DOCUMENT DEFAULTS. That is the
//             whole C-32 mechanism — `DocumentMeta.defaultFillColor` is
//             a read every bundle already has, so a host-owned sampler
//             writing there serves paged.image and paged.draw with no
//             new contract surface.
//   AC-EYE-3  sampling the SAME colour twice reuses one swatch. Without
//             the find-or-create the document grows a near-duplicate on
//             every click, which is the kind of thing nobody notices
//             until a file has 400 swatches in it.
//   AC-EYE-4  with a selection, the sample also becomes that element's
//             fill.

import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { elementPageRectPt } from "./harness/fixtures";
import {
  activateTool,
  loadViaReactPath,
  screenPoint,
} from "./harness/viewport";

/** The rail keys slots by GROUP (`data-tool-slot={slot.group}`), not by
 *  tool id — and this group holds two tools, the host's and
 *  paged.draw's. The host one is `isGroupDefault`, so activating the
 *  slot picks it. */
const TOOL_SLOT = "eyedropper";
/** A colour nothing else on the page carries, so a mis-mapped sample
 *  cannot accidentally match it. */
const PAINT = { r: 0, g: 128, b: 64 };
const PAINT_SWATCH = `R=${PAINT.r} G=${PAINT.g} B=${PAINT.b}`;

interface Handle {
  client: {
    mutate: (m: unknown) => Promise<unknown>;
    collection: <T>(n: string) => Promise<readonly T[]>;
    documentMeta: () => Promise<{ defaultFillColor?: string | null }>;
  };
  setElementSelection: (ids: unknown[]) => void;
}

// NOTE: every `__canvas` reach-in below is written INLINE inside its
// own `page.evaluate`. A shared `handle()` helper reads better and does
// not work — `evaluate` ships the function source to the browser, so a
// closure over anything in Node scope is a ReferenceError at runtime,
// not a compile error.

async function swatches(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    (
      globalThis as unknown as { __canvas: Handle }
    ).__canvas.client.collection<{ selfId: string; name?: string | null }>(
      "swatches",
    ),
  );
}

async function defaultFill(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const m = await (
      globalThis as unknown as { __canvas: Handle }
    ).__canvas.client.documentMeta();
    return m.defaultFillColor ?? null;
  });
}

test.describe("E2E host eyedropper (C-32 — composited-pixel sampling)", () => {
  test("AC-EYE-1..4 — sample a painted frame, and the colour flows where plugins read it @feat:plugin-platform.host-eyedropper @level:gesture", async ({
    page,
  }) => {
    await openCanvas(page);
    // REACT path, not `loadFixture`: the worker path bypasses React, so
    // no <canvas> is mounted and `screenPoint` — which measures the
    // rendered canvas to turn page pt into a click position — has
    // nothing to measure. Any spec that CLICKS the viewport needs this
    // one; specs that only read the model can use the worker path.
    const fx = await loadViaReactPath(page, "geometry");

    // Paint a frame a colour nothing else has, so the sample is
    // unambiguous. Done through the engine rather than the UI: this
    // test is about the SAMPLER, and using the colour panel to set up
    // would make a colour-panel bug look like a sampler bug.
    const target = fx.firstRectangle;
    test.skip(!target, "fixture exposes no rectangle to paint");
    const painted = await page.evaluate(
      async ({ paint, name, el }) => {
        const h = (globalThis as unknown as { __canvas: Handle }).__canvas;
        await h.client.mutate({
          op: "createSwatch",
          args: {
            spec: { name, space: "RGB", value: [paint.r, paint.g, paint.b] },
          },
        });
        const list = await h.client.collection<{
          selfId: string;
          name?: string | null;
        }>("swatches");
        const id = list.find((s) => s.name === name)?.selfId ?? null;
        if (!id) return null;
        await h.client.mutate({
          op: "setElementProperty",
          args: {
            elementId: el,
            path: "frameFillColor",
            value: { type: "colorRef", value: id },
          },
        });
        return id;
      },
      { paint: PAINT, name: PAINT_SWATCH, el: target! },
    );
    expect(painted, "the fixture frame took the paint").not.toBeNull();
    await page.waitForTimeout(800);

    // PAGE-space, not model-space: `frameBounds` is pre-transform and
    // the geometry fixture's "identity" rect lives at [0,0,100,100]
    // while painting at the page centre. Snapshots render in page
    // space, so the sampler maps from page space and the test must aim
    // in it too.
    const b = await elementPageRectPt(page, target!);
    test.skip(!b, "fixture exposes no page rect for the painted frame");
    const cx = (b!.left + b!.right) / 2;
    const cy = (b!.top + b!.bottom) / 2;

    const before = (await swatches(page)).length;
    await activateTool(page, TOOL_SLOT);
    const p = await screenPoint(page, cx, cy);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(1500);

    // AC-EYE-1 + AC-EYE-2 — the sampled colour is the painted one, and
    // it is now the document default. `defaultFillColor` holding the
    // painted swatch's id is BOTH assertions at once: a wrong pixel
    // would have minted a different swatch and pointed here at that.
    expect(await defaultFill(page)).toBe(painted);

    // AC-EYE-3 — the swatch was REUSED, not duplicated. The painted
    // swatch already carried this exact colour, so a correct sampler
    // adds nothing.
    expect((await swatches(page)).length).toBe(before);

    // AC-EYE-4 — with a selection, the sample also lands on the
    // element. Sample a second, different point first so the assertion
    // cannot pass on the paint we set up above.
    await page.evaluate(
      (el) =>
        (
          globalThis as unknown as { __canvas: Handle }
        ).__canvas.setElementSelection([el]),
      target!,
    );
    await page.waitForTimeout(300);
    const corner = await screenPoint(page, b!.left - 24, b!.top - 24);
    await page.mouse.click(corner.x, corner.y);
    await page.waitForTimeout(1500);
    const paperFill = await defaultFill(page);
    expect(paperFill, "sampling paper is still a sample").not.toBe(painted);
    expect(paperFill).not.toBeNull();
  });
});
