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

// Journey: the protocol-66 binary doors, through the editor handle a
// plugin host reads (`globalThis.__paged`, the PagedEditor):
//
//   · sceneLayers.submitImage — a frame's scene layer becomes one RGBA8
//     image sent as bytes (transferred), and the page draws it;
//   · sceneLayers.submitImageTiles — a tile patches that image in place,
//     and the page changes again;
//   · parts.write / read / delete — bytes in and out of the container
//     without a `number[]`, and a deleted part is gone;
//   · the will-save registry — Save (.paged) waits for a listener.
//
// CPU-safe: the scene image rides the same display-list image lane as a
// placed asset, so the deterministic tiny-skia snapshot sees it.

import { expect, test } from "@playwright/test";

import { Designer } from "./driver/designer";

test.describe("journey · protocol 66 binary doors", () => {
  test("a plugin draws an image as bytes, patches a tile, and keeps parts as bytes @feat:editor-shell.plugin-bundles @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    const frame = await designer.drawRectangle({ x0: 90, y0: 120, x1: 290, y1: 320 });
    expect(frame, "drew a target frame").not.toBe("");

    const before = await designer.renderBytes();
    const transferred = await page.evaluate(async (elementId) => {
      const paged = (globalThis as unknown as {
        __paged: {
          sceneLayers: {
            submitImage(
              id: string,
              image: { rgba: Uint8Array; width: number; height: number; dest: number[] },
              caller?: string,
              transfer?: boolean,
            ): Promise<void>;
          };
        };
      }).__paged;
      const w = 64;
      const h = 64;
      const rgba = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) rgba.set([220, 30, 30, 255], i * 4);
      await paged.sceneLayers.submitImage(
        elementId,
        { rgba, width: w, height: h, dest: [0, 0, 200, 200] },
        "journey.binary",
        true,
      );
      // Transferred: the buffer now belongs to the worker.
      return rgba.byteLength;
    }, frame);
    expect(transferred, "the pixels were transferred, not copied").toBe(0);
    const drawn = await designer.expectRenderChangesFrom(before);
    expect(drawn, "the binary scene image renders in the frame").toBeGreaterThan(64);

    const afterImage = await designer.renderBytes();
    await page.evaluate(async (elementId) => {
      const paged = (globalThis as unknown as {
        __paged: {
          sceneLayers: {
            submitImageTiles(
              id: string,
              tiles: Array<{ x: number; y: number; width: number; height: number; rgba: Uint8Array }>,
              caller?: string,
              transfer?: boolean,
            ): Promise<void>;
          };
        };
      }).__paged;
      const rgba = new Uint8Array(32 * 32 * 4);
      for (let i = 0; i < 32 * 32; i++) rgba.set([20, 20, 220, 255], i * 4);
      await paged.sceneLayers.submitImageTiles(
        elementId,
        [{ x: 0, y: 0, width: 32, height: 32, rgba }],
        "journey.binary",
        true,
      );
    }, frame);
    const patched = await designer.expectRenderChangesFrom(afterImage);
    expect(patched, "the patched tile repaints").toBeGreaterThan(64);

    // A malformed tile is refused, loudly.
    const refused = await page.evaluate(async (elementId) => {
      const paged = (globalThis as unknown as {
        __paged: { sceneLayers: { submitImageTiles(...a: unknown[]): Promise<void> } };
      }).__paged;
      try {
        await paged.sceneLayers.submitImageTiles(
          elementId,
          [{ x: 60, y: 60, width: 8, height: 8, rgba: new Uint8Array(8 * 8 * 4) }],
          "journey.binary",
        );
        return "accepted";
      } catch (e) {
        return String(e);
      }
    }, frame);
    expect(refused).toContain("refused");

    // Parts as bytes.
    const parts = await page.evaluate(async () => {
      const paged = (globalThis as unknown as {
        __paged: {
          parts: {
            write(path: string, bytes: Uint8Array, caller?: string): Promise<void>;
            read(path: string): Promise<Uint8Array | null>;
            delete(path: string, caller?: string): Promise<boolean>;
          };
        };
      }).__paged;
      const body = new Uint8Array(256);
      for (let i = 0; i < 256; i++) body[i] = i;
      const path = "paged/journey.binary/px/a.bin";
      await paged.parts.write(path, body, "journey.binary");
      const back = await paged.parts.read(path);
      const deleted = await paged.parts.delete(path, "journey.binary");
      const again = await paged.parts.delete(path, "journey.binary");
      const gone = await paged.parts.read(path);
      return {
        same: back !== null && back.length === 256 && back.every((v, i) => v === i),
        deleted,
        again,
        gone,
      };
    });
    expect(parts).toEqual({ same: true, deleted: true, again: false, gone: null });

    // Save waits for a will-save listener.
    const waited = await page.evaluate(async () => {
      const reg = (globalThis as unknown as {
        __willSave: {
          register(id: string, l: (e: { format: string }) => Promise<void>): { dispose(): void };
          run(e: { format: "paged" }, timeoutMs?: number): Promise<{ failed: string[]; timedOut: string[] }>;
        };
      }).__willSave;
      let ran = false;
      const d = reg.register("journey.binary", async () => {
        await new Promise((r) => setTimeout(r, 50));
        ran = true;
      });
      const stuck = reg.register("journey.stuck", () => new Promise(() => {}));
      const outcome = await reg.run({ format: "paged" }, 300);
      d.dispose();
      stuck.dispose();
      return { ran, outcome };
    });
    expect(waited).toEqual({
      ran: true,
      outcome: { failed: [], timedOut: ["journey.stuck"] },
    });
  });
});
