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
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// B4 — View ▸ Show text threads.
//
// Threading ports render only on the SELECTED, page-owned frame, so a
// story's route across the spread had no representation anywhere in the
// product. This overlay draws it.
//
// WHY THIS IS A JOURNEY AND NOT A PANEL SPEC. The overlay renders from
// REACT state — the live document handle and camera. The chromium tier's
// `loadIdml` deliberately bypasses React (it calls
// `__canvas.client.loadDocument` directly to hand in a CMYK profile, and
// its own comment says "the React UI won't update visually for this
// load"), so at that tier no overlay mounts at all and every assertion
// here would pass or fail for reasons having nothing to do with threads.
// Found the hard way: the first version of this spec asserted an absence
// that was guaranteed by the harness rather than by the code.
//
// WHAT IT IS CAREFUL ABOUT. The overlay is OFF by default and fetches
// nothing while off, so "no lines" is its correct resting state — a
// spec that only asserted absence would pass against an overlay that
// never worked. Every assertion is paired: off → idle, on → PRESENT
// with the right hop count and direction, off → idle again.

import { test, expect } from "@playwright/test";

import { Designer } from "../driver/designer";

type Page = import("@playwright/test").Page;

/** Invoke the View toggle through the command registry — the path the
 *  menu item uses, so the command wiring is under test too. */
async function toggleThreads(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const reg = (
      globalThis as unknown as {
        __canvas: {
          registries: { commands: { invoke: (c: string) => Promise<unknown> } };
        };
      }
    ).__canvas.registries.commands;
    await reg.invoke("paged.view.toggleTextThreads");
  });
}

async function link(page: Page, from: string, to: string): Promise<void> {
  await page.evaluate(
    async ({ from, to }) => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { mutate: (m: unknown) => Promise<unknown> } };
        }
      ).__canvas;
      await c.client.mutate({ op: "linkFrames", args: { from, to } });
    },
    { from, to },
  );
}

test.describe("journey · text thread overlay", () => {
  test("threads draw on toggle, name their frames, and clear again @feat:editor-shell.overlays.text-threads @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Three stacked frames, threaded into one story.
    //
    // The 150pt GAPS are load-bearing. Ports sit a camera-CONSTANT 13px
    // outside their corner, which at the journey camera's scale (~0.43)
    // is ~30pt of document space at each end. Frames 30pt apart put the
    // out-port BELOW the next in-port, the segment runs upward, and the
    // direction assertion below fails on correct geometry. That is also
    // how it genuinely looks when zoomed out — the line is drawn between
    // port centres, as InDesign draws it — so the fixture gives the
    // assertion room rather than the overlay pretending otherwise.
    const a = await designer.addTextFrame({ x0: 40, y0: 40, x1: 260, y1: 130 });
    const b = await designer.addTextFrame({ x0: 40, y0: 280, x1: 260, y1: 370 });
    const c = await designer.addTextFrame({ x0: 40, y0: 520, x1: 260, y1: 610 });
    expect(a.frameId).toBeTruthy();
    expect(b.frameId).toBeTruthy();
    expect(c.frameId).toBeTruthy();
    await link(page, a.frameId, b.frameId);
    await link(page, b.frameId, c.frameId);

    // OFF — mounted and idle. The marker distinguishes "idle" from
    // "never mounted", which are the same DOM when the off branch
    // returns null.
    await expect(page.locator('[data-thread-lines="off"]')).toHaveCount(1);
    await expect(page.locator("[data-thread-hop]")).toHaveCount(0);

    // ON — three chained frames make exactly two hops.
    await toggleThreads(page);
    await expect(page.locator("[data-thread-hop]")).toHaveCount(2, {
      timeout: 15_000,
    });

    // The hop keys name the frames they join, so this is THIS chain
    // rather than any two frames that happen to exist.
    await expect(
      page.locator(`[data-thread-hop="${a.frameId}->${b.frameId}"]`),
    ).toHaveCount(1);
    await expect(
      page.locator(`[data-thread-hop="${b.frameId}->${c.frameId}"]`),
    ).toHaveCount(1);

    // Direction: the frames are stacked down the page, so each hop must
    // travel DOWN. A zero-length or inverted segment would mean both
    // corners resolved from the same frame — the failure a count-only
    // assertion cannot see.
    const seg = page
      .locator(`[data-thread-hop="${a.frameId}->${b.frameId}"] line`)
      .first();
    const [y1, y2] = await seg.evaluate((el) => [
      Number(el.getAttribute("y1")),
      Number(el.getAttribute("y2")),
    ]);
    expect(Number.isFinite(y1) && Number.isFinite(y2)).toBe(true);
    expect(y2).toBeGreaterThan(y1);

    // OFF again — the mirror is dropped, not merely hidden.
    await toggleThreads(page);
    await expect(page.locator("[data-thread-hop]")).toHaveCount(0);
    await expect(page.locator('[data-thread-lines="off"]')).toHaveCount(1);
  });

  test("an unthreaded document draws nothing with the overlay ON @feat:editor-shell.overlays.text-threads", async ({
    page,
  }) => {
    // The negative control: overlay ON over single-frame stories.
    // Separates "draws the right thing" from "draws whenever switched on".
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await designer.addTextFrame({ x0: 40, y0: 40, x1: 260, y1: 130 });

    await toggleThreads(page);
    await expect(page.locator('[data-thread-lines="empty"]')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(page.locator("[data-thread-hop]")).toHaveCount(0);
  });
});
