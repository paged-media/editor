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

// File ▸ Place…, driven through the real commands, the
// real file chooser and the real pointer, with every outcome read back
// from the engine. Each test pins a defect that recording the product
// films on 2026-10-12 caught:
//
//   ED-6  The place cursor ignored a drag (the image landed at natural
//         size), and Place ignored a selected empty frame.

import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { openCanvas } from "../fidelity/canvas-driver";
import { selectElements } from "./harness/ui";
import { loadViaReactPath, screenPoint } from "./harness/viewport";

interface ElementId {
  kind: string;
  id: string;
}
interface Outcome {
  applied: boolean;
  createdId: ElementId | null;
}
interface Geometry {
  pageId: string | null;
  bounds: [number, number, number, number];
  hasImage?: boolean;
}

type CanvasGlobal = {
  __canvas: {
    elementSelection: ElementId[];
    contentSelection: {
      storyId: string;
      start: number;
      end: number;
      cell?: { tableId: string; row: number; col: number } | null;
    } | null;
    handle: { pageIds: string[] };
    client: {
      mutate: (m: unknown) => Promise<{
        kind: string;
        payload?: { createdId?: ElementId | null };
      }>;
      elementGeometry: (ids: unknown[]) => Promise<Geometry[]>;
      send: (m: unknown) => Promise<{
        kind: string;
        payload: {
          content?: { paragraphs: Array<{ runs: Array<{ text: string }> }> } | null;
        };
      }>;
      caretGeometry: (s: unknown) => Promise<{ topPt: number; heightPt: number } | null>;
      paragraphBounds: (
        storyId: string,
        offset: number,
        cell: unknown,
      ) => Promise<{ start: number; end: number } | null>;
      executeScript: (s: string) => Promise<{ output: string[] }>;
    };
    registries: {
      commands: { invoke: (id: string) => Promise<unknown> };
      importers: {
        resolve: (
          name: string,
          mime?: string,
        ) => { import: (req: { name: string; bytes: Uint8Array; mimeType?: string }) => Promise<void> } | null;
      };
    };
    debugContext: () => { panels: { open: string[] } };
  };
};

function tinyPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height * 4; i += 4) {
    png.data[i] = 200;
    png.data[i + 1] = 40;
    png.data[i + 2] = 40;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

const invoke = (page: Page, id: string) =>
  page.evaluate(
    (commandId) =>
      (globalThis as unknown as CanvasGlobal).__canvas.registries.commands.invoke(commandId),
    id,
  ) as Promise<Outcome>;

const geometryOf = (page: Page, id: ElementId) =>
  page.evaluate(
    async (target) =>
      (await (globalThis as unknown as CanvasGlobal).__canvas.client.elementGeometry([target]))[0] ??
      null,
    id,
  );

const placementArmed = (page: Page) =>
  expect(page.locator("html[data-paged-placement='armed']")).toHaveCount(1, {
    timeout: 10_000,
  });

/** All page items, document order — for "nothing else was minted". */
async function itemCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const r = await (globalThis as unknown as CanvasGlobal).__canvas.client.executeScript(
      "paged.tree()",
    );
    let n = 0;
    const visit = (node: { id?: unknown; children?: unknown[] }) => {
      if (node.id) n += 1;
      for (const c of (node.children ?? []) as Array<typeof node>) visit(c);
    };
    for (const root of JSON.parse(r.output[0] ?? "[]")) visit(root);
    return n;
  });
}

async function openText(page: Page): Promise<string> {
  await openCanvas(page);
  const fx = await loadViaReactPath(page, "text");
  return fx.pages[0].pageId;
}

/** An empty graphic frame on page 0, selected the way a click selects. */
async function emptyFrame(
  page: Page,
  pageId: string,
  bounds: [number, number, number, number],
): Promise<ElementId> {
  const created = await page.evaluate(
    async ({ pageId, bounds }) =>
      (
        await (globalThis as unknown as CanvasGlobal).__canvas.client.mutate({
          op: "insertFrame",
          args: { pageId, bounds },
        })
      ).payload?.createdId ?? null,
    { pageId, bounds },
  );
  expect(created).toBeTruthy();
  await selectElements(page, [created as ElementId]);
  return created as ElementId;
}

test.describe("File ▸ Place… (film defect ED-6)", () => {
  test("ED-6 — a drag with the place cursor sizes the frame to the drag, keeping the image's proportions @feat:images-graphics.placed-images @feat:editor-shell.command-authoring @level:gesture", async ({
    page,
  }) => {
    await openText(page);
    const chooser = page.waitForEvent("filechooser");
    const placed = invoke(page, "paged.insert.placeImage");
    await (await chooser).setFiles({
      name: "wide.png",
      mimeType: "image/png",
      buffer: tinyPng(40, 20),
    });
    await placementArmed(page);

    // A 200 × 150 pt box for a 2:1 image: the frame fills the box's width
    // and keeps the image's proportions, anchored where the drag began.
    const a = await screenPoint(page, 100, 150);
    const b = await screenPoint(page, 300, 300);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();

    const outcome = await placed;
    expect(outcome.applied).toBe(true);
    const geo = await geometryOf(page, outcome.createdId!);
    expect(geo?.hasImage).toBe(true);
    const [top, left, bottom, right] = geo!.bounds;
    const tol = 3; // one screen pixel is ~2.5 pt at the fitted zoom
    expect(Math.abs(left - 100)).toBeLessThan(tol);
    expect(Math.abs(top - 150)).toBeLessThan(tol);
    expect(Math.abs(right - left - 200)).toBeLessThan(tol);
    expect(Math.abs(bottom - top - 100)).toBeLessThan(tol);
  });

  test("ED-6 — with an empty frame selected, Place fills that frame instead of arming the cursor @feat:images-graphics.placed-images @feat:editor-shell.command-authoring @level:happy", async ({
    page,
  }) => {
    const pageId = await openText(page);
    const frame = await emptyFrame(page, pageId, [400, 100, 520, 300]);
    expect((await geometryOf(page, frame))?.hasImage).toBe(false);
    const before = await itemCount(page);

    const chooser = page.waitForEvent("filechooser");
    const placed = invoke(page, "paged.insert.placeImage");
    await (await chooser).setFiles({
      name: "wide.png",
      mimeType: "image/png",
      buffer: tinyPng(40, 20),
    });

    // No cursor to aim: the selected frame is where it goes. (Asserted
    // before awaiting the command, which would otherwise wait on a click.)
    await page.waitForTimeout(500);
    await expect(page.locator("html[data-paged-placement]")).toHaveCount(0);
    const outcome = await placed;
    expect(outcome.applied).toBe(true);
    expect(outcome.createdId?.id).toBe(frame.id);
    expect((await geometryOf(page, frame))?.hasImage).toBe(true);
    // Its own bounds, and nothing new on the page.
    expect((await geometryOf(page, frame))?.bounds).toEqual([400, 100, 520, 300]);
    expect(await itemCount(page)).toBe(before);
  });
});
