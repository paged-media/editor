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

// U7 — `paged.insert.*`: click-free object authoring through the
// command surface (palette / menus / Cmd+D), the layer
// `insert-commands.ts` adds. The U7 repro this kills: ask the palette
// for "text frame" and NOTHING answered — every engine insert op was
// reachable only through a tool-rail drag.
//
// What is pinned here:
//   · the palette surfaces + runs "Insert text frame", and the result
//     is a centred, SELECTED frame on the current page;
//   · every simple verb creates its element and ONE Cmd+Z removes it;
//   · the compound verbs (table-with-frame, place-image) land BOTH
//     halves and unwind in TWO undo steps — sequential by measurement,
//     not by choice: wire v61's batch executor has no story-handle
//     door and no PlaceImage/ReplaceImageBytes dispatch (see
//     insert-commands.ts fact 3), so the specs pin the honest shape;
//   · the ADR-024 when-gate: no document / inside an edit context ⇒
//     the palette HIDES the verbs and `invoke` refuses cleanly;
//   · File ▸ Place… is a REAL, enabled menu item (the `soon` seam is
//     retired) and drives the picker through Playwright's filechooser.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";

import { fitFirstPage, openCanvas } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");
const TEXT_FIXTURE = `${REPO_ROOT}/corpus/idml/generated/text.idml`;
const GEOMETRY_FIXTURE = `${REPO_ROOT}/corpus/idml/generated/geometry.idml`;

type ElementId = { kind: string; id: unknown };

interface InsertOutcome {
  applied: boolean;
  createdId: ElementId | null;
}

/** Invoke a command through the registry (the palette/menu/keybinding
 *  path) and return whatever the handler resolved with. */
async function invoke(page: Page, id: string): Promise<unknown> {
  return page.evaluate(async (commandId) => {
    return await (
      globalThis as unknown as {
        __canvas: {
          registries: {
            commands: { invoke: (id: string) => Promise<unknown> };
          };
        };
      }
    ).__canvas.registries.commands.invoke(commandId);
  }, id);
}

async function undoOnce(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas.client.undo();
  });
}

async function elementProperties(
  page: Page,
  id: ElementId,
): Promise<unknown> {
  return page.evaluate(async (target) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: { elementProperties: (id: unknown) => Promise<unknown> };
        };
      }
    ).__canvas;
    return c.client.elementProperties(target);
  }, id);
}

interface GeometryLite {
  pageId: string | null;
  bounds: [number, number, number, number];
  hasImage?: boolean;
}

async function geometryOf(
  page: Page,
  id: ElementId,
): Promise<GeometryLite | null> {
  return page.evaluate(async (target) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementGeometry: (ids: unknown[]) => Promise<GeometryLite[]>;
          };
        };
      }
    ).__canvas;
    const items = await c.client.elementGeometry([target]);
    return items[0] ?? null;
  }, id);
}

/** Page size in pt for a pageId, off the live handle mirror. */
async function pageSizeOf(
  page: Page,
  pageId: string,
): Promise<[number, number]> {
  return page.evaluate((id) => {
    const h = (
      globalThis as unknown as {
        __canvas: {
          handle: { pageIds: string[]; pageSizesPt: [number, number][] };
        };
      }
    ).__canvas.handle;
    return h.pageSizesPt[h.pageIds.indexOf(id)];
  }, pageId);
}

/** Count addressable (id-bearing) nodes in the scene tree — the
 *  atomicity oracle for the batch verbs. */
async function sceneNodeCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { sceneTree: () => Promise<unknown[]> } };
      }
    ).__canvas;
    const roots = (await c.client.sceneTree()) as Array<{
      id?: unknown;
      children?: unknown[];
    }>;
    let n = 0;
    const walk = (nodes: Array<{ id?: unknown; children?: unknown[] }>) => {
      for (const node of nodes) {
        if (node.id) n += 1;
        if (node.children) walk(node.children as typeof nodes);
      }
    };
    walk(roots);
    return n;
  });
}

async function loadFixture(page: Page, fixture: string): Promise<void> {
  // The REACT door (file input → loadDocumentFile → setHandle): the
  // when-gate reads `paged.document.handle`, so the load must go
  // through the path that sets it.
  await page.setInputFiles('input[type="file"]', fixture);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { ready: boolean } }).__canvas
            .ready,
      ),
    )
    .toBe(true);
}

/** Fit page 1 (the Home shortcut) so the viewport centre — the
 *  placement anchor — deterministically resolves to page 0. */

async function firstPageId(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (globalThis as unknown as { __canvas: { handle: { pageIds: string[] } } })
        .__canvas.handle.pageIds[0],
  );
}

/** 40×20 solid-red PNG — a valid image with a non-square aspect so
 *  the place test can assert aspect-fit. */
function tinyPng(width = 40, height = 20): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = 200;
    png.data[i * 4 + 1] = 30;
    png.data[i * 4 + 2] = 30;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

test.describe("U7 — paged.insert.* command authoring", () => {
  test("palette search 'text frame' surfaces + runs Insert text frame — a centred, selected frame @feat:editor-shell.command-authoring @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, TEXT_FIXTURE);
    await fitFirstPage(page);

    // The U7 repro, through the REAL palette UI.
    await invoke(page, "paged.palette.toggle");
    const input = page.getByPlaceholder("Ask or search anything…");
    await expect(input).toBeVisible();
    await input.fill("text frame");
    const item = page.getByRole("option", { name: /Insert text frame/ });
    await expect(item).toBeVisible();
    await item.click();

    // The created frame is SELECTED (the tools' post-insert flow).
    await expect
      .poll(() =>
        page.evaluate(() => {
          const sel = (
            globalThis as unknown as {
              __canvas: { elementSelection: ElementId[] };
            }
          ).__canvas.elementSelection;
          return sel.length === 1 ? sel[0].kind : null;
        }),
      )
      .toBe("textFrame");

    const created = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __canvas: { elementSelection: ElementId[] };
          }
        ).__canvas.elementSelection[0],
    );
    const geo = await geometryOf(page, created);
    expect(geo).not.toBeNull();
    // Centred on page 0 (the Home fit makes the viewport centre land
    // there) at the named default size.
    expect(geo!.pageId).toBe(await firstPageId(page));
    const [pageW, pageH] = await pageSizeOf(page, geo!.pageId!);
    const [top, left, bottom, right] = geo!.bounds;
    expect(right - left).toBeCloseTo(240, 0);
    expect(bottom - top).toBeCloseTo(120, 0);
    expect(left).toBeCloseTo((pageW - 240) / 2, 0);
    expect(top).toBeCloseTo((pageH - 120) / 2, 0);

    // One undo removes it.
    await undoOnce(page);
    expect(await elementProperties(page, created)).toBeNull();
  });

  test("rectangle / ellipse / line create centred elements; one undo removes each @feat:editor-shell.command-authoring @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, TEXT_FIXTURE);
    await fitFirstPage(page);
    const page0 = await firstPageId(page);

    for (const { command, kind, w, h } of [
      { command: "paged.insert.rectangle", kind: "rectangle", w: 160, h: 160 },
      { command: "paged.insert.ellipse", kind: "oval", w: 160, h: 160 },
      { command: "paged.insert.line", kind: "graphicLine", w: 200, h: 0 },
    ]) {
      const outcome = (await invoke(page, command)) as InsertOutcome;
      expect(outcome.applied, `${command} applies`).toBe(true);
      expect(outcome.createdId, `${command} reports createdId`).not.toBeNull();
      expect(outcome.createdId!.kind).toBe(kind);

      const geo = await geometryOf(page, outcome.createdId!);
      expect(geo, `${command} geometry`).not.toBeNull();
      expect(geo!.pageId).toBe(page0);
      const [pageW, pageH] = await pageSizeOf(page, geo!.pageId!);
      const [top, left, bottom, right] = geo!.bounds;
      expect(right - left, `${command} width`).toBeCloseTo(w, 0);
      expect(bottom - top, `${command} height`).toBeCloseTo(h, 0);
      expect(left, `${command} centred x`).toBeCloseTo((pageW - w) / 2, 0);
      expect(top, `${command} centred y`).toBeCloseTo((pageH - h) / 2, 0);

      await undoOnce(page);
      expect(
        await elementProperties(page, outcome.createdId!),
        `${command} single undo removes`,
      ).toBeNull();
    }
  });

  test("insert table with NO caret mints frame + table; two undos unwind both halves @feat:editor-shell.command-authoring @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, TEXT_FIXTURE);
    await fitFirstPage(page);

    const before = await sceneNodeCount(page);
    const outcome = (await invoke(page, "paged.insert.table")) as InsertOutcome;
    expect(outcome.applied).toBe(true);
    // The verb reports the TABLE it created, inside the minted frame's
    // story…
    expect(outcome.createdId).not.toBeNull();
    expect(outcome.createdId!.kind).toBe("table");
    expect(await elementProperties(page, outcome.createdId!)).not.toBeNull();
    // …and exactly one new addressable node (the text frame) exists.
    expect(await sceneNodeCount(page)).toBe(before + 1);

    // Sequential compound (insert-commands.ts fact 3): undo #1 removes
    // the table, the frame survives; undo #2 removes the frame.
    await undoOnce(page);
    expect(await elementProperties(page, outcome.createdId!)).toBeNull();
    expect(await sceneNodeCount(page)).toBe(before + 1);
    await undoOnce(page);
    expect(await sceneNodeCount(page)).toBe(before);
  });

  test("insert table with a caret lands the table in that story @feat:editor-shell.command-authoring @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, TEXT_FIXTURE);
    await fitFirstPage(page);

    const storyId = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              collection: (n: string) => Promise<Array<{ selfId: string }>>;
            };
          };
        }
      ).__canvas;
      const stories = await c.client.collection("stories");
      return stories[0].selfId;
    });

    // Place a collapsed caret at the story head (the state the text
    // tool leaves behind) and let the mirror settle.
    await page.evaluate((id) => {
      (
        globalThis as unknown as {
          __canvas: { setContentSelection: (s: unknown) => void };
        }
      ).__canvas.setContentSelection({ storyId: id, start: 0, end: 0 });
    }, storyId);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              globalThis as unknown as {
                __canvas: { contentSelection: { storyId: string } | null };
              }
            ).__canvas.contentSelection?.storyId ?? null,
        ),
      )
      .toBe(storyId);

    const before = await sceneNodeCount(page);
    const outcome = (await invoke(page, "paged.insert.table")) as InsertOutcome;
    expect(outcome.applied).toBe(true);
    // No frame was minted — the table went INTO the caret's story.
    expect(await sceneNodeCount(page)).toBe(before);
    expect(outcome.createdId).not.toBeNull();
    expect(outcome.createdId!.kind).toBe("table");
    expect(
      (outcome.createdId!.id as { story_id: string }).story_id,
    ).toBe(storyId);
    expect(await elementProperties(page, outcome.createdId!)).not.toBeNull();

    // One undo removes the table again.
    await undoOnce(page);
    expect(await elementProperties(page, outcome.createdId!)).toBeNull();
  });

  test("Place image: filechooser → CLICK to position → aspect-fit frame filled with the picked bytes; two undos unwind it @feat:editor-shell.command-authoring @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, TEXT_FIXTURE);
    await fitFirstPage(page);

    const chooser = page.waitForEvent("filechooser");
    const invoked = invoke(page, "paged.insert.placeImage");
    await (
      await chooser
    ).setFiles({
      name: "swatch.png",
      mimeType: "image/png",
      buffer: tinyPng(40, 20),
    });
    // Place now ASKS WHERE. After the picker returns, the pointer arms
    // and the next click inside the canvas positions the image; the
    // command does not resolve until it has a point. (Before this, every
    // place landed centred, so four places built a pile of four.)
    const viewport = page.locator("[data-paged-viewport]");
    await expect(page.locator("html[data-paged-placement='armed']")).toHaveCount(
      1,
      { timeout: 10_000 },
    );
    const box = (await viewport.boundingBox())!;
    const clickX = box.x + box.width * 0.35;
    const clickY = box.y + box.height * 0.3;
    await page.mouse.click(clickX, clickY);

    const outcome = (await invoked) as InsertOutcome;
    expect(outcome.applied).toBe(true);
    expect(outcome.createdId).not.toBeNull();

    const geo = await geometryOf(page, outcome.createdId!);
    expect(geo).not.toBeNull();
    // The frame HOSTS a placed image (the replaceImageBytes half of
    // the batch landed on the minted frame via `$created`).
    expect(geo!.hasImage).toBe(true);
    // Natural size (40×20 px = pt — well under 80% of the page), aspect
    // preserved.
    const [pageW, pageH] = await pageSizeOf(page, geo!.pageId!);
    const [top, left, bottom, right] = geo!.bounds;
    expect(right - left).toBeCloseTo(40, 0);
    expect(bottom - top).toBeCloseTo(20, 0);
    expect(right - left).toBeLessThanOrEqual(pageW * 0.8);
    expect(bottom - top).toBeLessThanOrEqual(pageH * 0.8);
    // AND it is NOT centred — the click decided the position.
    //
    // Only a coarse check here on purpose: page-local bounds are
    // relative to the page's origin in the `layoutPages` stack, which is
    // NOT the document origin, so comparing `left` against a camera-
    // inverted click needs the page rect and gets fragile. The exact
    // pointer tracking is asserted origin-independently in the
    // "tracks the pointer" test below, which recovers the page origin
    // from two placements and requires the two answers to agree.
    expect(Math.abs(left - (pageW - 40) / 2)).toBeGreaterThan(2);

    // Sequential compound (insert-commands.ts fact 3): undo #1 pops
    // the bytes (the frame survives, image-less); undo #2 removes the
    // frame.
    await undoOnce(page);
    const afterFirstUndo = await geometryOf(page, outcome.createdId!);
    expect(afterFirstUndo).not.toBeNull();
    expect(afterFirstUndo!.hasImage).toBe(false);
    await undoOnce(page);
    expect(await elementProperties(page, outcome.createdId!)).toBeNull();
  });

  /** Place an image at a viewport fraction and return its page-local
   *  top-left plus the document-space point that was clicked. */
  async function placeAt(
    page: Page,
    fx: number,
    fy: number,
  ): Promise<{
    left: number;
    top: number;
    docX: number;
    docY: number;
    pageId: string;
  }> {
    const chooser = page.waitForEvent("filechooser");
    const invoked = invoke(page, "paged.insert.placeImage");
    await (await chooser).setFiles({
      name: "swatch.png",
      mimeType: "image/png",
      buffer: tinyPng(40, 20),
    });
    await expect(page.locator("html[data-paged-placement='armed']")).toHaveCount(
      1,
      { timeout: 10_000 },
    );
    const box = (await page.locator("[data-paged-viewport]").boundingBox())!;
    // INTEGER click coordinates. The mouse lands on whole CSS pixels,
    // and at this zoom (scale ~0.41) one pixel is ~2.5pt of document
    // space — so a fractional target quantises on the way out and the
    // conversion below would be comparing two different points. Two
    // placements then disagree by ~5pt for no reason but arithmetic.
    const cx = Math.round(box.x + box.width * fx);
    const cy = Math.round(box.y + box.height * fy);
    // Convert through the camera AS IT IS AT CLICK TIME. Reading it
    // afterwards compares the click against a camera that the placement
    // itself may have moved (the new frame is selected on insert), which
    // silently shifts the answer.
    const [docX, docY] = await page.evaluate(
      ({ cx, cy }) => {
        const wrap = document.querySelector("[data-paged-viewport]")!;
        const r = wrap.getBoundingClientRect();
        const cam = (
          globalThis as unknown as {
            __canvas: {
              client: {
                camera: { read: () => { scale: number; tx: number; ty: number } };
              };
            };
          }
        ).__canvas.client.camera.read();
        return [
          (cx - r.left - cam.tx) / cam.scale,
          (cy - r.top - cam.ty) / cam.scale,
        ];
      },
      { cx, cy },
    );
    await page.mouse.click(cx, cy);
    const outcome = (await invoked) as InsertOutcome;
    expect(outcome.applied).toBe(true);
    const geo = await geometryOf(page, outcome.createdId!);
    const [top, left] = geo!.bounds;
    const pageId = geo!.pageId as string;
    return { left, top, docX, docY, pageId };
  }

  test("Place image tracks the pointer — two placements recover the SAME page origin @feat:editor-shell.command-authoring @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, TEXT_FIXTURE);
    await fitFirstPage(page);

    // Both clicks must land on the SAME page: page-local bounds are
    // relative to their own page's origin, so two placements on two
    // pages recover two DIFFERENT origins and the comparison below is
    // meaningless. (This fixture has several pages and the first
    // attempt at this test straddled two of them.)
    const a = await placeAt(page, 0.4, 0.35);
    const b = await placeAt(page, 0.52, 0.55);
    expect(a.pageId).toBe(b.pageId);

    // Two different clicks must produce two different frames — the
    // regression this whole change exists to prevent is every place
    // landing in one spot.
    expect(Math.abs(a.left - b.left)).toBeGreaterThan(10);
    expect(Math.abs(a.top - b.top)).toBeGreaterThan(10);

    // ORIGIN-INDEPENDENT EXACTNESS. `docPoint - pageLocalTopLeft` is the
    // page's origin in document space. It is the same page both times,
    // so both placements must recover the same origin — which is only
    // true if each frame's top-left sits exactly on its own click. This
    // holds without the spec knowing where `layoutPages` puts the page,
    // and it fails for any constant offset, any inversion, and for the
    // old centred behaviour.
    const originAx = a.docX - a.left;
    const originAy = a.docY - a.top;
    const originBx = b.docX - b.left;
    const originBy = b.docY - b.top;
    expect(Math.abs(originAx - originBx)).toBeLessThan(2);
    expect(Math.abs(originAy - originBy)).toBeLessThan(2);
  });

  test("Place image: Escape cancels and places NOTHING @feat:editor-shell.command-authoring @level:unhappy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, TEXT_FIXTURE);
    await fitFirstPage(page);

    const before = await sceneNodeCount(page);
    const chooser = page.waitForEvent("filechooser");
    const invoked = invoke(page, "paged.insert.placeImage");
    await (await chooser).setFiles({
      name: "swatch.png",
      mimeType: "image/png",
      buffer: tinyPng(40, 20),
    });
    await expect(page.locator("html[data-paged-placement='armed']")).toHaveCount(
      1,
      { timeout: 10_000 },
    );

    await page.keyboard.press("Escape");
    const outcome = (await invoked) as InsertOutcome;
    expect(outcome.applied).toBe(false);

    // The armed state is torn down AND nothing was minted. A place that
    // landed anyway after a cancel would be worse than the centred
    // behaviour this replaced, because the user believes they cancelled.
    await expect(page.locator("html[data-paged-placement]")).toHaveCount(0);
    expect(await sceneNodeCount(page)).toBe(before);
  });

  test("Add page inserts after the current page; one undo removes it @feat:editor-shell.command-authoring @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, TEXT_FIXTURE);
    await fitFirstPage(page);

    const pageCount = () =>
      page.evaluate(
        () =>
          (
            globalThis as unknown as {
              __canvas: { handle: { pageIds: string[] } };
            }
          ).__canvas.handle.pageIds.length,
      );
    const before = await pageCount();
    const outcome = (await invoke(page, "paged.insert.newPage")) as InsertOutcome;
    expect(outcome.applied).toBe(true);
    // The page-structure mirror follows (pageStructureChanged contract).
    await expect.poll(pageCount).toBe(before + 1);
    await undoOnce(page);
    await expect.poll(pageCount).toBe(before);
  });

  test("File menu: Place… is a REAL, enabled item (the seam is retired) @feat:editor-shell.command-authoring @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, TEXT_FIXTURE);

    await page
      .locator('nav[aria-label="Main menu"]')
      .getByRole("button", { name: "File" })
      .click();
    const place = page.getByRole("menuitem", { name: /^Place…/ });
    await expect(place).toBeVisible();
    // Enabled — no grey, and no "soon" badge (the honest-stub marker).
    await expect(place).not.toHaveAttribute("data-disabled", /.*/);
    await expect(place.getByText("soon")).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("when-gate: with NO document the verbs hide from the palette and invoke refuses @feat:editor-shell.command-authoring @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);

    // Palette: HIDDEN, not greyed (a dead hit is a wrong answer to a
    // search).
    await invoke(page, "paged.palette.toggle");
    const input = page.getByPlaceholder("Ask or search anything…");
    await expect(input).toBeVisible();
    await input.fill("Insert text frame");
    await expect(
      page.getByRole("option", { name: /Insert text frame/ }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Invoke: a clean refusal — resolves undefined, the handler never
    // ran (no outcome object).
    const result = await invoke(page, "paged.insert.textFrame");
    expect(result).toBeUndefined();
  });

  test("when-gate: inside an edit context the verbs hide and invoke refuses @feat:editor-shell.command-authoring @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, GEOMETRY_FIXTURE);
    await fitFirstPage(page);

    // Enter the paged.draw vectorGraphic edit context by double-
    // clicking a path-bearing rectangle (the edit-context spec's
    // proven entry).
    const target = await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              executeScript: (
                s: string,
              ) => Promise<{ output: string[]; error: string | null }>;
            };
          };
        }
      ).__canvas;
      const r = await c.client.executeScript("paged.tree()");
      const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
        id?: { kind: string; id: string } | null;
        children?: unknown[];
      }>;
      let found: { kind: string; id: string } | null = null;
      const visit = (node: (typeof tree)[number]) => {
        if (found) return;
        if (node.id && node.id.kind === "rectangle") {
          found = node.id;
          return;
        }
        for (const ch of (node.children ?? []) as typeof tree) visit(ch);
      };
      for (const root of tree) visit(root);
      return found;
    });
    expect(target).not.toBeNull();

    const at = await page.evaluate(async (id) => {
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
            client: {
              camera: { read: () => { scale: number; tx: number; ty: number } };
              elementGeometry: (ids: unknown[]) => Promise<
                Array<{
                  bounds: [number, number, number, number];
                  itemTransform?:
                    | [number, number, number, number, number, number]
                    | null;
                }>
              >;
            };
          };
        }
      ).__canvas;
      const items = await c.client.elementGeometry([id]);
      const item = items[0];
      if (!item) return null;
      const [top, left, bottom, right] = item.bounds;
      const [a, b, cc, d, tx, ty] = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      const px = a * cx + cc * cy + tx;
      const py = b * cx + d * cy + ty;
      const cam = c.client.camera.read();
      return {
        x: wrap.left + px * cam.scale + cam.tx,
        y: wrap.top + py * cam.scale + cam.ty,
      };
    }, target);
    expect(at).not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(page.locator("[data-edit-context-breadcrumb]")).toBeVisible({
      timeout: 5_000,
    });

    // Invoke refuses cleanly; nothing is created.
    const before = await sceneNodeCount(page);
    const result = await invoke(page, "paged.insert.rectangle");
    expect(result).toBeUndefined();
    expect(await sceneNodeCount(page)).toBe(before);

    // Palette: hidden while the context is active.
    await invoke(page, "paged.palette.toggle");
    const input = page.getByPlaceholder("Ask or search anything…");
    await expect(input).toBeVisible();
    await input.fill("Insert rectangle");
    await expect(
      page.getByRole("option", { name: /Insert rectangle/ }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Leave the context — picking a dimmed rail tool is an EXIT (the
    // edit-context spec's proven door; a bare Escape can land on the
    // just-closed palette dialog instead of the context) — and the
    // verbs come back.
    await page
      .locator('[data-tool-rail="ready"] [data-tool="paged.tool.select"]')
      .click();
    await expect(page.locator("[data-edit-context-breadcrumb]")).toHaveCount(
      0,
      { timeout: 5_000 },
    );
    const outcome = (await invoke(
      page,
      "paged.insert.rectangle",
    )) as InsertOutcome;
    expect(outcome.applied).toBe(true);
    await undoOnce(page);
  });
});
