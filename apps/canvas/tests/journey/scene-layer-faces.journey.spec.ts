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

// Journey: protocol 68 — a plugin scene layer's text draws in the face it
// names, and the host says when it could not.
//
// Before v68 a scene text item's `family` / `style` were reserved: every
// run drew in the document default font and nothing reported it. Now the
// engine resolves each run's face through the fonts registered for the
// document, draws an unresolved one in the default font, and the
// `sceneLayerApplied` reply carries `fontFallbacks`. The editor's client
// returns that list from `submitSceneLayer`; the PagedEditor's
// `sceneLayers.submit` hands it to the plugin-sdk host, which returns it
// from `SceneLayerSurface.submit` and — because the channel is wired —
// advertises `rendering.sceneLayer.faces@1`.
//
// WHAT THIS VERIFIES (values and pixels, not DOM):
//   · the report: an unregistered family is listed, a registered one is
//     not, a style derived from `weight` is named (`"Inter Bold"`);
//   · registering a font REBUILDS a frame whose layer names it, with no
//     resubmit (the Lora run turns from the Inter fallback into Lora);
//   · `weight` reaches the face: the variable Inter at 700 paints
//     differently from 400.
//
// The editor's default Inter is the document DEFAULT font, not a
// registered family: a run naming "Inter" is reported as a fallback until
// Inter is registered by name (it still draws in Inter — the default).

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "./driver/designer";

const CALLER = "journey.faces";

type TextItem = {
  kind: "text";
  x: number;
  y: number;
  text: string;
  size: number;
  paint: { r: number; g: number; b: number; a: number };
  family?: string;
  weight?: number;
};

const text = (family: string, weight?: number): TextItem => ({
  kind: "text",
  x: 6,
  y: 60,
  text: "Hamburgefonstiv",
  size: 30,
  paint: { r: 0, g: 0, b: 0, a: 1 },
  family,
  ...(weight ? { weight } : {}),
});

/** Submit through the PagedEditor handle the plugin-sdk host calls, and
 *  return the host's report. */
async function submit(
  page: Page,
  elementId: string,
  items: TextItem[],
): Promise<{ fontFallbacks: string[] }> {
  return page.evaluate(
    async ({ elementId, items, caller }) => {
      const paged = (
        globalThis as unknown as {
          __paged: {
            sceneLayers: {
              submit(
                id: string,
                layer: unknown,
                caller?: string,
              ): Promise<{ fontFallbacks: string[] }>;
            };
          };
        }
      ).__paged;
      const r = await paged.sceneLayers.submit(elementId, { items }, caller);
      return { fontFallbacks: [...r.fontFallbacks] };
    },
    { elementId, items, caller: CALLER },
  );
}

/** Register a corpus font under `family` (the vite `/fonts/` route). */
async function registerFont(page: Page, family: string, file: string): Promise<void> {
  await page.evaluate(
    async ({ family, file }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              registerFont(f: string, b: Uint8Array, s?: string | null): Promise<void>;
            };
          };
        }
      ).__canvas;
      const resp = await fetch(`/fonts/${file}`);
      if (!resp.ok) throw new Error(`/fonts/${file}: ${resp.status}`);
      await c.client.registerFont(family, new Uint8Array(await resp.arrayBuffer()), null);
    },
    { family, file },
  );
}

test.describe("journey · protocol 68 scene-layer text faces", () => {
  test("a plugin's scene text draws in the face it names, and the host reports the faces that fell back @feat:plugin-platform.scene-layer @feat:plugin-web.engine-rendering @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const frame = await designer.drawRectangle({ x0: 60, y0: 120, x1: 400, y1: 260 });
    expect(frame, "drew a target frame").not.toBe("");

    // ── 1. REPORT — nothing registered by name yet: every named family
    //    falls back, and a weight-derived style is part of the name. ──
    const empty = await designer.renderBytes();
    expect(await submit(page, frame, [text("Lora")])).toEqual({
      fontFallbacks: ["Lora"],
    });
    await designer.expectRenderChangesFrom(empty);
    expect(await submit(page, frame, [text("Inter", 700)])).toEqual({
      fontFallbacks: ["Inter Bold"],
    });
    expect(await submit(page, frame, [text("NoSuchFace Sans")])).toEqual({
      fontFallbacks: ["NoSuchFace Sans"],
    });

    // ── 2. REBUILD ON REGISTER — the Lora run draws in the default font;
    //    registering Lora repaints the frame in Lora with NO resubmit. ──
    expect((await submit(page, frame, [text("Lora")])).fontFallbacks).toEqual(["Lora"]);
    // Let the fallback render settle, then prove it is stable before the
    // register, so the change below is the register's doing.
    await page.waitForTimeout(300);
    const fallback = await designer.renderBytes();
    await designer.expectRenderStable(fallback, await designer.renderBytes());
    await registerFont(page, "Lora", "Lora.ttf");
    const relaid = await designer.expectRenderChangesFrom(fallback);
    // eslint-disable-next-line no-console
    console.log(`[faces] Lora registered: ${relaid}px repainted without a resubmit`);
    expect(await submit(page, frame, [text("Lora")])).toEqual({ fontFallbacks: [] });

    // ── 3. WEIGHT — Inter registered by name resolves (no report), and
    //    the variable face's wght follows `weight`. ──
    await registerFont(page, "Inter", "Inter.ttf");
    expect(await submit(page, frame, [text("Inter", 400)])).toEqual({ fontFallbacks: [] });
    await page.waitForTimeout(300);
    const regular = await designer.renderBytes();
    await designer.expectRenderStable(regular, await designer.renderBytes());
    expect(await submit(page, frame, [text("Inter", 700)])).toEqual({ fontFallbacks: [] });
    const bolder = await designer.expectRenderChangesFrom(regular);
    // eslint-disable-next-line no-console
    console.log(`[faces] Inter 400 -> 700: ${bolder}px changed`);

    // An unregistered family is still reported beside a resolved one.
    expect(
      await submit(page, frame, [text("Inter", 700), text("NoSuchFace Sans")]),
    ).toEqual({ fontFallbacks: ["NoSuchFace Sans"] });
  });
});
