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

// File ▸ Place… and Insert ▸ Table, driven through the real commands, the
// real file chooser and the real pointer, with every outcome read back
// from the engine. Each test pins a defect that recording the product
// films on 2026-10-12 caught:
//
//   ED-6  The place cursor ignored a drag (the image landed at natural
//         size), and Place ignored a selected empty frame.
//   IMG-2 Place with a .psd did nothing: the browser cannot decode a PSD,
//         and the error reached only the Problems sink.
//   ED-7  Insert ▸ Table with a caret drew a black bar (every row 0 pt
//         tall), and the text typed next landed above the table.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { openCanvas } from "../fidelity/canvas-driver";
import { Designer } from "../journey/driver/designer";
import { selectElements } from "./harness/ui";
import { loadViaReactPath, screenPoint } from "./harness/viewport";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PSD = pathResolve(__dirname, "harness", "annual-layers.psd");
/** The PSD header's own size (big-endian u32 at bytes 14 / 18). */
const PSD_W = 400;
const PSD_H = 300;

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

/** Record every call the importer claiming `.psd` receives, then let the
 *  real importer run. */
async function spyOnPsdImporter(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as CanvasGlobal).__canvas.registries.importers.resolve(
            "x.psd",
          ) != null,
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas;
    const w = globalThis as unknown as {
      __psdImports: Array<{ name: string; size: number; selected: string[] }>;
    };
    w.__psdImports = [];
    const imp = c.registries.importers.resolve("x.psd")!;
    const real = imp.import.bind(imp);
    imp.import = async (req) => {
      w.__psdImports.push({
        name: req.name,
        size: req.bytes.length,
        selected: (globalThis as unknown as CanvasGlobal).__canvas.elementSelection.map(
          (e) => e.id,
        ),
      });
      return real(req);
    };
  });
}

const psdImports = (page: Page) =>
  page.evaluate(
    () =>
      (globalThis as unknown as {
        __psdImports: Array<{ name: string; size: number; selected: string[] }>;
      }).__psdImports,
  );

test.describe("File ▸ Place… (film defects ED-6, IMG-2)", () => {
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

  test("IMG-2 — Place with a .psd mints a frame at the PSD's size and hands the file to the importer that claims it @feat:images-graphics.placed-images @feat:image.psd.mutatable @level:happy", async ({
    page,
  }) => {
    await openText(page);
    await spyOnPsdImporter(page);

    const chooser = page.waitForEvent("filechooser");
    const placed = invoke(page, "paged.insert.placeImage");
    await (await chooser).setFiles(PSD);
    await placementArmed(page);
    const at = await screenPoint(page, 60, 80);
    await page.mouse.click(at.x, at.y);

    const outcome = await placed;
    expect(outcome.applied).toBe(true);
    const frame = outcome.createdId!;
    // Sized from the header: the browser cannot decode a PSD, and the
    // size used to come from the browser's decoder alone.
    const geo = await geometryOf(page, frame);
    const [top, left, bottom, right] = geo!.bounds;
    expect(Math.abs(left - 60)).toBeLessThan(3);
    expect(Math.abs(top - 80)).toBeLessThan(3);
    expect((right - left) / (bottom - top)).toBeCloseTo(PSD_W / PSD_H, 2);
    expect(right - left).toBeLessThanOrEqual(PSD_W + 0.01);

    // The importer got the whole file, with the new frame — and only it —
    // selected, which is how paged.image knows where the layers go.
    await expect.poll(() => psdImports(page)).toHaveLength(1);
    const [call] = await psdImports(page);
    expect(call.name).toBe("annual-layers.psd");
    expect(call.size).toBe(27654);
    expect(call.selected).toEqual([frame.id]);
  });

  test("IMG-2 — a .psd placed with an empty frame selected goes to the importer with that frame @feat:images-graphics.placed-images @feat:image.psd.mutatable @level:edge", async ({
    page,
  }) => {
    const pageId = await openText(page);
    await spyOnPsdImporter(page);
    const frame = await emptyFrame(page, pageId, [400, 100, 520, 300]);
    const before = await itemCount(page);

    const chooser = page.waitForEvent("filechooser");
    const placed = invoke(page, "paged.insert.placeImage");
    await (await chooser).setFiles(PSD);

    await page.waitForTimeout(500);
    await expect(page.locator("html[data-paged-placement]")).toHaveCount(0);
    const outcome = await placed;
    expect(outcome.applied).toBe(true);
    expect(outcome.createdId?.id).toBe(frame.id);
    await expect.poll(() => psdImports(page)).toHaveLength(1);
    expect((await psdImports(page))[0].selected).toEqual([frame.id]);
    expect(await itemCount(page)).toBe(before);
  });

  test("IMG-2 — a file Place cannot read is reported where the user sees it @feat:images-graphics.placed-images @feat:editor-shell.panels.problems @level:edge", async ({
    page,
  }) => {
    await openText(page);
    const before = await itemCount(page);
    const chooser = page.waitForEvent("filechooser");
    const placed = invoke(page, "paged.insert.placeImage");
    await (await chooser).setFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image at all"),
    });
    const outcome = await placed;
    expect(outcome.applied).toBe(false);
    expect(await itemCount(page)).toBe(before);

    // The Problems panel opens on the reason instead of the reason waiting
    // in a panel nobody has open.
    await expect
      .poll(() =>
        page.evaluate(() =>
          (globalThis as unknown as CanvasGlobal).__canvas.debugContext().panels.open,
        ),
      )
      .toContain("paged.problems");
    await expect(page.getByText(/could not decode "broken\.png"/)).toBeVisible();
  });
});

test.describe("Insert ▸ Table with a caret (film defect ED-7)", () => {
  test("ED-7 — the rows have height and the caret moves into the first cell, so typing fills it @feat:tables.model @feat:editor-shell.command-authoring @feat:editor-tools.text.caret-typing @level:happy", async ({
    page,
  }) => {
    const d = new Designer(page);
    await d.open();
    await d.newDocument();
    await d.activate("type");
    const a = await screenPoint(page, 72, 72);
    const b = await screenPoint(page, 400, 300);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(
          () => (globalThis as unknown as CanvasGlobal).__canvas.contentSelection?.storyId ?? null,
        ),
      )
      .not.toBeNull();
    const storyId = await page.evaluate(
      () => (globalThis as unknown as CanvasGlobal).__canvas.contentSelection!.storyId,
    );

    const outcome = await invoke(page, "paged.insert.table");
    expect(outcome.applied).toBe(true);
    const tableId = (outcome.createdId!.id as unknown as { table_id: string }).table_id;

    // The caret is in the first cell.
    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.contentSelection),
      )
      .toMatchObject({ storyId, start: 0, end: 0, cell: { tableId, row: 0, col: 0 } });

    // Typing lands in the cell, not in the body above the table.
    await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el && el !== document.body) el.blur?.();
    });
    await page.keyboard.type("Cell");
    await expect
      .poll(() =>
        page.evaluate(
          async ({ storyId, tableId }) =>
            (
              await (globalThis as unknown as CanvasGlobal).__canvas.client.paragraphBounds(
                storyId,
                0x7fff_ffff,
                { tableId, row: 0, col: 0 },
              )
            )?.end ?? null,
          { storyId, tableId },
        ),
      )
      .toBe(4);

    // Every row has height, the empty ones too: the last row sits three
    // rows below the first. Unsized, the two empty rows between were 0 pt
    // tall — every stroke on one line, the black bar.
    const caretTop = (row: number) =>
      page.evaluate(
        async ({ storyId, tableId, row }) =>
          (
            await (globalThis as unknown as CanvasGlobal).__canvas.client.caretGeometry({
              storyId,
              start: 0,
              end: 0,
              cell: { tableId, row, col: 0 },
            })
          )?.topPt ?? null,
        { storyId, tableId, row },
      );
    await page.evaluate(
      ({ storyId, tableId }) =>
        (
          globalThis as unknown as {
            __canvas: { setContentSelection: (s: unknown) => void };
          }
        ).__canvas.setContentSelection({
          storyId,
          start: 0,
          end: 0,
          cell: { tableId, row: 3, col: 0 },
        }),
      { storyId, tableId },
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => (globalThis as unknown as CanvasGlobal).__canvas.contentSelection?.cell?.row,
        ),
      )
      .toBe(3);
    await page.keyboard.type("D");
    await expect.poll(() => caretTop(3)).not.toBeNull();
    const first = (await caretTop(0))!;
    const last = (await caretTop(3))!;
    expect(last - first).toBeGreaterThan(3 * 15);

    const body = await page.evaluate(async (sid) => {
      const r = await (globalThis as unknown as CanvasGlobal).__canvas.client.send({
        kind: "requestStoryContent",
        payload: { storyId: sid },
      });
      return (r.payload.content?.paragraphs ?? [])
        .map((p) => p.runs.map((run) => run.text).join(""))
        .join("\n");
    }, storyId);
    expect(body).not.toContain("Cell");
    expect(body).not.toContain("D");
  });
});
