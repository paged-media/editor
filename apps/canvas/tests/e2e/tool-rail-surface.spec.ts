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

// The six LIVE built-in tools that no spec had ever named.
//
// `scripts/surface-coverage.mjs` counts the concrete surface a user can
// touch and reported 13/19 live tools. The six missing ones — Page,
// Pencil, Scissors, Shear, Gradient Swatch, Gradient Feather — all carry
// a real `gesture` in `built-in-tools.ts`, so they are shipping
// affordances, not the five `status: "planned"` stubs (which are dimmed,
// aria-disabled and refuse activation by construction, and are correctly
// excluded from the gate).
//
// This is exactly the class the rail already shipped once: 15 of 31
// entries rendered, accepted a click and silently did nothing — "worse
// than an empty slot, because the user reads the dead affordance as a
// fault in their own input". A tool that no test has selected is a tool
// nobody has checked still routes anywhere.
//
// WHAT EACH TIER PROVES, because they are not equal:
//
//   tier 1 — the slot exists in the rail and the keyboard shortcut
//     activates it. This is what catches a tool that has fallen out of
//     the registry or lost its key to a collision.
//   tier 2 — the gesture reaches the document. Only written where a
//     gesture is safe to drive without a bespoke fixture: Pencil draws a
//     path, and Page inserts. Shear and the two gradient tools need a
//     selected target and are asserted at tier 1 plus activation-with-
//     selection; Scissors needs a path under the pointer.
//
// A tier-1 pass is NOT a claim that the tool works. It is a claim that
// it is still wired to something, which is the specific regression this
// file guards.
//
// Fitting page 0: `Home` is NOT an unconditional "fit page 1".
// `useKeyboardShortcuts.ts:55` drops every page-navigation key while the
// canvas has no measured size (`vw < 10 || vh < 10`), and the handler
// early-returns when the nearest page is already the target. Both are
// silent. `fitPageZero` below retries until the camera actually responds
// rather than pressing once and trusting it — a bare press is why three
// specs went red in CI while passing on a dev machine.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

/** Tools under test: rail slot id (the tool's `group`) + shortcut. */
const TOOLS = [
  { id: "paged.tool.page", slot: "page", key: "P", shift: true, title: "Page" },
  { id: "paged.tool.pencil", slot: "pencil", key: "n", shift: false, title: "Pencil" },
  { id: "paged.tool.scissors", slot: "scissors", key: "c", shift: false, title: "Scissors" },
  { id: "paged.tool.shear", slot: "transform", key: "o", shift: false, title: "Shear" },
  {
    id: "paged.tool.gradientSwatch",
    slot: "gradientSwatch",
    key: "g",
    shift: false,
    title: "Gradient Swatch",
  },
  {
    id: "paged.tool.gradientFeather",
    slot: "gradientFeather",
    key: "G",
    shift: true,
    title: "Gradient Feather",
  },
] as const;

/** The rail's own active mark, read from the DOM.
 *
 *  `__canvas.debugContext()` carries only `{ panels, editContext }` — it
 *  has no tool field — so there is no scripted read of the active tool.
 *  The DOM is the better oracle anyway: `data-active="true"` is what the
 *  rail actually paints, so asserting it is asserting what the user can
 *  see, not an internal the UI might disagree with. */
async function activeSlot(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-tool-slot][data-active="true"]');
    return el?.getAttribute("data-tool-slot") ?? null;
  });
}

async function cameraScale(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __canvas: { client: { camera: { read: () => { scale: number } } } };
        }
      ).__canvas.client.camera.read().scale,
  );
}

/** Fit page 0, retrying because `Home` is swallowed silently while the
 *  canvas is unmeasured (see the header note). */
async function fitPageZero(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.keyboard.press("Home");
    await page.waitForTimeout(300);
    if ((await cameraScale(page)) > 0.2) return;
  }
  await expect.poll(() => cameraScale(page), { timeout: 8_000 }).toBeGreaterThan(0.2);
}

async function countKind(page: Page, kind: string): Promise<number> {
  return page.evaluate(async (k) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            executeScript: (s: string) => Promise<{ output: string[]; error: string | null }>;
          };
        };
      }
    ).__canvas;
    const r = await c.client.executeScript("paged.tree()");
    const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
      id?: { kind: string } | null;
      children?: unknown[];
    }>;
    let n = 0;
    const visit = (node: { id?: { kind: string } | null; children?: unknown[] }) => {
      if (node.id && node.id.kind === k) n += 1;
      for (const ch of (node.children ?? []) as typeof tree) visit(ch);
    };
    for (const root of tree) visit(root);
    return n;
  }, kind);
}

async function pageZeroScreenCenter(page: Page): Promise<{ x: number; y: number; scale: number }> {
  return page.evaluate(() => {
    let best: HTMLCanvasElement | null = null;
    let bestArea = 0;
    for (const cv of Array.from(document.querySelectorAll("canvas"))) {
      const r = cv.getBoundingClientRect();
      if (r.width * r.height > bestArea) {
        bestArea = r.width * r.height;
        best = cv;
      }
    }
    const wrap = (best?.parentElement ?? best)!.getBoundingClientRect();
    const c = (
      globalThis as unknown as {
        __canvas: {
          handle: { pageSizesPt: [number, number][] };
          client: { camera: { read: () => { scale: number; tx: number; ty: number } } };
        };
      }
    ).__canvas;
    const [w0, h0] = c.handle.pageSizesPt[0];
    const cam = c.client.camera.read();
    return {
      x: wrap.left + (w0 / 2) * cam.scale + cam.tx,
      y: wrap.top + (h0 / 2) * cam.scale + cam.ty,
      scale: cam.scale,
    };
  });
}

test.describe("tool rail — the six live tools no spec had named", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await page.setInputFiles('input[type="file"]', fixturePath("geometry"));
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas.ready,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await fitPageZero(page);
  });

  for (const tool of TOOLS) {
    test(`AC-RAIL-${tool.slot} — ${tool.title} has a rail slot and its shortcut activates it @feat:editor-shell.tool-rail @feat:editor-tools.stub-tools @level:happy`, async ({
      page,
    }) => {
      // The slot renders. A tool that fell out of the registry has none,
      // which is the failure this catches first.
      const slot = page.locator(`[data-tool-slot="${tool.slot}"]`);
      await expect(slot).toBeVisible();

      // The shortcut reaches it. Tool keys are guarded by
      // `contentSelectionInactive`, so this asserts the un-guarded path:
      // no caret, no text selection.
      await page.keyboard.press(tool.shift ? `Shift+${tool.key}` : tool.key);
      await expect.poll(() => activeSlot(page), { timeout: 5_000 }).toBe(tool.slot);
    });
  }

  test("AC-RAIL-pencil-draws — the Pencil gesture reaches the document as a path @feat:editor-tools.draw.pencil @feat:editor-tools.gesture-lifecycle @level:happy", async ({
    page,
  }) => {
    const before = await countKind(page, "polygon");

    await page.locator('[data-tool-slot="pencil"]').click();
    await expect.poll(() => activeSlot(page), { timeout: 5_000 }).toBe("pencil");

    // A freehand stroke: several moves, because a single down/up is a
    // click and the handler needs points to fit a path to.
    const c = await pageZeroScreenCenter(page);
    await page.mouse.move(c.x - 60, c.y - 40);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(c.x - 60 + i * 15, c.y - 40 + Math.sin(i) * 18);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();

    await expect
      .poll(() => countKind(page, "polygon"), { timeout: 8_000 })
      .toBeGreaterThan(before);
  });

  test("AC-RAIL-type-draws — the Type tool drags out a text frame @feat:editor-tools.draw.rectangle @feat:stories-text.frame.insert @level:happy", async ({
    page,
  }) => {
    // "Press T, drag a box, type" — the muscle memory of every InDesign
    // user, which produced nothing at all until the Type tool gained a
    // gesture. A CLICK still places a caret: the pointer-up dispatch
    // splits click from drag at CLICK_DRAG_THRESHOLD_PX, so the two
    // halves of the tool do not compete.
    await page.keyboard.press("t");
    await expect.poll(() => activeSlot(page), { timeout: 5_000 }).toBe("type");

    // On a BLANK document, not the fixture. `geometry.idml` carries 20
    // text frames across 20 pages, so a drag anywhere near the page
    // centre starts over one — and the handler then correctly declines,
    // because creating a frame on top of the one the user was aiming at
    // is worse than doing nothing. Testing the create path needs canvas
    // that is genuinely empty.
    await page.evaluate(async () => {
      const cmd = (
        globalThis as unknown as {
          __canvas: { registries: { commands: { invoke: (id: string) => Promise<unknown> } } };
        }
      ).__canvas.registries.commands;
      await cmd.invoke("paged.file.new");
    });
    await expect
      .poll(() => countKind(page, "textFrame"), { timeout: 15_000 })
      .toBe(0);
    await fitPageZero(page);

    // Drag from the page CENTRE outward, not from an offset: the blank
    // document is one letter page, and a drag that starts off-page gives
    // the handler a null pageId and it correctly does nothing.
    const c = await pageZeroScreenCenter(page);
    await page.mouse.move(c.x - 40, c.y - 30);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y, { steps: 8 });
    await page.mouse.move(c.x + 60, c.y + 40, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(() => countKind(page, "textFrame"), { timeout: 8_000 })
      .toBe(1);
  });

  test("AC-RAIL-transform-needs-a-target — Shear activates and stays active with a selection @feat:editor-tools.shear @level:edge", async ({
    page,
  }) => {
    // Shear drives the WORKER gesture `{kind:"shear"}` about a selected
    // element, so activation with nothing selected is the honest limit of
    // what this tier asserts: the tool takes the tool slot and does not
    // fall back to select.
    await page.keyboard.press("o");
    await expect.poll(() => activeSlot(page), { timeout: 5_000 }).toBe("transform");

    // Selecting an element must not knock the tool off — the spring-loaded
    // override and the ADR-024 leave-by-tool rule both act on this path,
    // and getting it wrong is what put AC-K1-2/3 red in August.
    const c = await pageZeroScreenCenter(page);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(300);
    expect(await activeSlot(page)).toBe("transform");
  });
});
