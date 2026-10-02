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

// E2E — Transform ▸ X / Y and Properties ▸ Bounds say where the object IS.
//
// Both used to project `frameBounds`, the item's INNER box, so after a
// nudge (a transform write) the numbers stood still although the object
// had moved, and on a rotated frame they described a box that is not on
// the page anywhere. They now read the bounds through the item transform
// — the footprint the selection chrome draws — and a typed X / Y moves
// the selection by the difference through the nudge's own write. Every
// test below checks the READ against the engine's geometry and the WRITE
// against the READ, so the two cannot drift apart unnoticed.
//
// The documents are blank (File ▸ New), whose spread origin IS the page
// origin, so "where it is in the engine's element space" and "where it
// is on the page" are the same numbers (engine-findings §17 for the
// documents where they are not).

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { loadFixture } from "./harness/fixtures";

interface ElementRef {
  kind: string;
  id: string;
}

interface Geometry {
  bounds: number[];
  transform: number[] | null;
}

const NUDGE_RIGHT_LARGE = "paged.object.nudgeRightLarge";
const NUDGE_DOWN_LARGE = "paged.object.nudgeDownLarge";
const GROUP = "paged.object.group";

const X = '[data-object-transform-panel="ready"] input[aria-label="x"]';
const Y = '[data-object-transform-panel="ready"] input[aria-label="y"]';
const W = '[data-object-transform-panel="ready"] input[aria-label="width"]';
const BOUNDS = '[data-properties-section="object"] [data-page-bounds]';

async function newBlankDocument(page: Page): Promise<void> {
  await openCanvas(page);
  await page.evaluate(async () => {
    await (
      globalThis as unknown as {
        __canvas: {
          registries: { commands: { invoke: (id: string) => Promise<unknown> } };
        };
      }
    ).__canvas.registries.commands.invoke("paged.file.new");
  });
  await page.waitForFunction(
    () =>
      (globalThis as unknown as { __canvas?: { ready?: boolean } }).__canvas
        ?.ready === true,
    null,
    { timeout: 15_000 },
  );
}

async function mutate(
  page: Page,
  m: unknown,
): Promise<{ kind: string; payload: { createdId?: ElementRef | null } }> {
  return page.evaluate(async (mm) => {
    return (await (
      globalThis as unknown as {
        __canvas: { client: { mutate: (x: unknown) => Promise<unknown> } };
      }
    ).__canvas.client.mutate(mm)) as never;
  }, m);
}

async function made(page: Page, m: unknown): Promise<ElementRef> {
  const reply = await mutate(page, m);
  expect(reply.kind).toBe("mutationApplied");
  return reply.payload.createdId!;
}

async function pageId(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (globalThis as unknown as { __canvas: { handle: { pageIds: string[] } } })
        .__canvas.handle.pageIds[0],
  );
}

/** Select through the worker AND the React mirror the panels read. */
async function select(page: Page, refs: ElementRef[]): Promise<void> {
  await page.evaluate(async (ids) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            setElementSelection: (ids: unknown[], mode: string) => Promise<unknown[]>;
            elementGeometry: (ids: unknown[]) => Promise<unknown[]>;
          };
          setElementSelection?: (ids: unknown[]) => void;
          setElementGeometry?: (items: unknown[]) => void;
        };
      }
    ).__canvas;
    const applied = await c.client.setElementSelection(ids, "replace");
    c.setElementSelection?.(applied);
    c.setElementGeometry?.(await c.client.elementGeometry(applied));
  }, refs);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __canvas: { elementSelection: unknown[] } })
            .__canvas.elementSelection.length,
      ),
    )
    .toBe(refs.length);
}

async function invoke(page: Page, id: string): Promise<void> {
  await page.evaluate(async (commandId) => {
    await (
      globalThis as unknown as {
        __canvas: {
          registries: { commands: { invoke: (id: string) => Promise<unknown> } };
        };
      }
    ).__canvas.registries.commands.invoke(commandId);
  }, id);
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as { __canvas: { client: { undo: () => Promise<unknown> } } }
    ).__canvas.client.undo();
  });
}

async function geometry(page: Page, ref: ElementRef): Promise<Geometry> {
  return page.evaluate(async (id) => {
    const [g] = await (
      globalThis as unknown as {
        __canvas: {
          client: {
            elementGeometry: (ids: unknown[]) => Promise<
              Array<{ bounds: number[]; itemTransform?: number[] | null }>
            >;
          };
        };
      }
    ).__canvas.client.elementGeometry([id]);
    return { bounds: g.bounds, transform: g.itemTransform ?? null };
  }, ref);
}

/** The footprint the selection chrome draws: bounds corners through the
 *  item transform, boxed. Computed HERE, independently of the editor's
 *  own `composedBox`, so the test is not checking the code against
 *  itself. */
function footprint(g: Geometry): { left: number; top: number; right: number; bottom: number } {
  const [top, left, bottom, right] = g.bounds;
  const [a, b, c, d, tx, ty] = g.transform ?? [1, 0, 0, 1, 0, 0];
  const pts = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ].map(([x, y]) => [a * x + c * y + tx, b * x + d * y + ty]);
  return {
    left: Math.min(...pts.map((p) => p[0])),
    top: Math.min(...pts.map((p) => p[1])),
    right: Math.max(...pts.map((p) => p[0])),
    bottom: Math.max(...pts.map((p) => p[1])),
  };
}

/** A metric field's number, whatever unit text rides with it. */
async function shown(page: Page, selector: string): Promise<number | null> {
  const raw = await page.locator(selector).inputValue();
  const n = Number.parseFloat(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Type a value the way a user does: focus, replace, Enter.
 *
 *  FOCUS FIRST, as its own step. The kit's NumberInput swaps its display
 *  ("110 pt") for the raw number on focus, and that re-render lands
 *  after a bare `fill()` has selected the text — so `fill()` alone
 *  APPENDS ("110150"). Once focused, `fill()` replaces cleanly. */
async function type(page: Page, selector: string, value: number): Promise<void> {
  const field = page.locator(selector);
  await field.focus();
  await expect(field).not.toHaveValue(/pt/);
  await field.fill(String(value));
  await field.press("Enter");
}

test.describe("E2E Transform X / Y and Bounds — where the object is", () => {
  test.beforeEach(async ({ page }) => {
    await newBlankDocument(page);
  });

  test("AC-XY-1 — after a nudge X / Y and Bounds show the new position @feat:editor-shell.panels.object-transform @feat:editor-shell.panels.properties @feat:editor-tools.move.translate @level:happy", async ({
    page,
  }) => {
    const rect = await made(page, {
      op: "insertFrame",
      args: { pageId: await pageId(page), bounds: [100, 100, 200, 300] },
    });
    await select(page, [rect]);
    await openPanel(page, "paged.object-transform");
    await expect.poll(() => shown(page, X)).toBe(100);
    await expect.poll(() => shown(page, Y)).toBe(100);

    await invoke(page, NUDGE_RIGHT_LARGE);
    await invoke(page, NUDGE_DOWN_LARGE);
    // The nudge wrote the TRANSFORM; frameBounds did not move. The
    // readout follows the object, not the inner box.
    expect((await geometry(page, rect)).bounds).toEqual([100, 100, 200, 300]);
    await expect.poll(() => shown(page, X)).toBe(110);
    await expect.poll(() => shown(page, Y)).toBe(110);
    // W / H are the frame's own size, unchanged by a move.
    expect(await shown(page, W)).toBe(200);

    // Properties ▸ Bounds reads the same footprint.
    await openPanel(page, "paged.properties");
    const bounds = page.locator(BOUNDS);
    await expect(bounds).toHaveAttribute("data-page-bounds", "edges");
    await expect
      .poll(async () => [
        await shown(page, `${BOUNDS} input[aria-label="top"]`),
        await shown(page, `${BOUNDS} input[aria-label="left"]`),
        await shown(page, `${BOUNDS} input[aria-label="bottom"]`),
        await shown(page, `${BOUNDS} input[aria-label="right"]`),
      ])
      .toEqual([110, 110, 210, 310]);
  });

  test("AC-XY-2 — typing X moves the object there, rigidly, in ONE undo step; then Y @feat:editor-shell.panels.object-transform @feat:editor-tools.move.translate @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    const rect = await made(page, {
      op: "insertFrame",
      args: { pageId: await pageId(page), bounds: [100, 100, 200, 300] },
    });
    await select(page, [rect]);
    await invoke(page, NUDGE_RIGHT_LARGE); // a transform first, as a real doc has
    await openPanel(page, "paged.object-transform");
    await expect.poll(() => shown(page, X)).toBe(110);

    await type(page, X, 150);
    await expect.poll(async () => footprint(await geometry(page, rect)).left).toBe(150);
    const moved = await geometry(page, rect);
    // A MOVE: same inner box, same linear part, only the translation.
    expect(moved.bounds).toEqual([100, 100, 200, 300]);
    expect(moved.transform).toEqual([1, 0, 0, 1, 50, 0]);
    expect(footprint(moved).top).toBe(100);
    await expect.poll(() => shown(page, X)).toBe(150);

    await type(page, Y, 40);
    await expect.poll(async () => footprint(await geometry(page, rect)).top).toBe(40);
    await expect.poll(() => shown(page, Y)).toBe(40);

    // Each typed value is one undo step.
    await undo(page);
    await expect.poll(async () => footprint(await geometry(page, rect)).top).toBe(100);
    expect(footprint(await geometry(page, rect)).left).toBe(150);
    await undo(page);
    await expect.poll(async () => footprint(await geometry(page, rect)).left).toBe(110);
  });

  test("AC-XY-3 — a ROTATED frame: X / Y read its footprint, and a typed X lands its footprint there with the rotation kept @feat:editor-shell.panels.object-transform @feat:editor-tools.rotate @feat:editor-tools.move.translate @level:edge", async ({
    page,
  }) => {
    const rect = await made(page, {
      op: "insertFrame",
      args: { pageId: await pageId(page), bounds: [200, 200, 300, 400] },
    });
    const rotated = await mutate(page, {
      op: "setElementProperty",
      args: {
        elementId: rect,
        path: "frameRotationAngle",
        value: { type: "length", value: 30 },
      },
    });
    expect(rotated.kind).toBe("mutationApplied");
    await select(page, [rect]);
    await invoke(page, NUDGE_RIGHT_LARGE);
    await openPanel(page, "paged.object-transform");

    const before = await geometry(page, rect);
    const box = footprint(before);
    // The footprint, not the inner box's [200, 200] corner.
    await expect.poll(() => shown(page, X)).toBeCloseTo(box.left, 1);
    await expect.poll(() => shown(page, Y)).toBeCloseTo(box.top, 1);
    expect(box.left).not.toBeCloseTo(200, 0);

    const target = Math.round(box.left) + 25;
    await type(page, X, target);
    await expect
      .poll(async () => footprint(await geometry(page, rect)).left, { timeout: 10_000 })
      .toBeCloseTo(target, 1);
    const after = await geometry(page, rect);
    // Rigid: the rotation, the inner box and Y are all where they were.
    expect(after.bounds).toEqual(before.bounds);
    expect(after.transform!.slice(0, 4)).toEqual(before.transform!.slice(0, 4));
    expect(footprint(after).top).toBeCloseTo(box.top, 3);

    // Bounds cannot write the edges of a rotated frame (a frameBounds
    // write moves it along its own axes), so it is a read-only readout.
    await openPanel(page, "paged.properties");
    await expect(page.locator(BOUNDS)).toHaveAttribute("data-page-bounds", "readout");
    await expect(page.locator(`${BOUNDS} input[aria-label="left"]`)).toBeDisabled();
    await expect
      .poll(() => shown(page, `${BOUNDS} input[aria-label="left"]`))
      .toBeCloseTo(target, 1);
  });

  test("AC-XY-4 — a line and a pen path move to a typed Y; a group to a typed X @feat:editor-shell.panels.object-transform @feat:frames-paths.line.insert @feat:frames-paths.path.insert @feat:frames-paths.groups @level:edge", async ({
    page,
  }) => {
    const pid = await pageId(page);
    const at = (x: number, y: number) => ({ anchor: [x, y], left: [x, y], right: [x, y] });
    const line = await made(page, {
      op: "insertLine",
      args: { pageId: pid, start: [60, 80], end: [180, 130] },
    });
    const path = await made(page, {
      op: "insertPath",
      args: { pageId: pid, open: false, anchors: [at(300, 300), at(360, 300), at(330, 360)] },
    });
    await openPanel(page, "paged.object-transform");

    // `frameBounds` is the write that does NOT move these two (§14); the
    // transform write does, and the readout reads what it wrote.
    for (const ref of [line, path]) {
      await select(page, [ref]);
      const box = footprint(await geometry(page, ref));
      await expect.poll(() => shown(page, Y)).toBeCloseTo(box.top, 1);
      await type(page, Y, Math.round(box.top) + 30);
      await expect
        .poll(async () => footprint(await geometry(page, ref)).top)
        .toBeCloseTo(Math.round(box.top) + 30, 3);
      const anchors = await page.evaluate(async (id) => {
        const r = await (
          globalThis as unknown as {
            __canvas: {
              client: {
                pathAnchors: (id: unknown) => Promise<{
                  anchors: Array<{ anchor: [number, number] }>;
                  itemTransform?: number[] | null;
                } | null>;
              };
            };
          }
        ).__canvas.client.pathAnchors(id);
        const [, , , , , ty] = r?.itemTransform ?? [1, 0, 0, 1, 0, 0];
        return r?.anchors.map((a) => a.anchor[1] + ty) ?? [];
      }, ref);
      // The DRAWN geometry (anchors through the transform) moved too.
      expect(Math.min(...anchors)).toBeCloseTo(Math.round(box.top) + 30, 3);
    }

    // A group: frameBounds is refused on a group id, and the group's own
    // transform write moves nothing (§13) — the typed X must ride
    // setGroupTransform, which moves every member.
    const a = await made(page, { op: "insertFrame", args: { pageId: pid, bounds: [400, 100, 450, 150] } });
    const b = await made(page, { op: "insertFrame", args: { pageId: pid, bounds: [420, 200, 480, 260] } });
    await select(page, [a, b]);
    await invoke(page, GROUP);
    await expect.poll(() => shown(page, X)).toBe(100);
    await type(page, X, 130);
    await expect.poll(async () => footprint(await geometry(page, a)).left).toBe(130);
    expect(footprint(await geometry(page, b)).left).toBe(230);
    await expect.poll(() => shown(page, X)).toBe(130);
  });

  test("AC-XY-5 — Bounds writes an EDGE of an un-rotated frame at the page position it shows @feat:editor-shell.panels.properties @feat:editor-shell.panels.object-transform @level:edge", async ({
    page,
  }) => {
    const rect = await made(page, {
      op: "insertFrame",
      args: { pageId: await pageId(page), bounds: [100, 100, 200, 300] },
    });
    await select(page, [rect]);
    await invoke(page, NUDGE_RIGHT_LARGE); // translated by 10: page ≠ inner
    await openPanel(page, "paged.properties");
    const right = `${BOUNDS} input[aria-label="right"]`;
    await expect.poll(() => shown(page, right)).toBe(310);

    await type(page, right, 350);
    // The RIGHT edge lands at 350 on the page; the left edge stays at 110.
    await expect.poll(async () => footprint(await geometry(page, rect)).right).toBe(350);
    expect(footprint(await geometry(page, rect)).left).toBe(110);
    await expect.poll(() => shown(page, right)).toBe(350);
  });
});

test.describe("E2E engine anchor — the space element geometry is in", () => {
  test("AC-XY-ENGINE-1 — on an InDesign document, element geometry composes against the PAGE @feat:editor-shell.panels.object-transform @level:edge", async ({
    page,
  }) => {
    test.fail(
      true,
      "engine-findings §17: elementGeometry composes in spread space; the page origin is on no read",
    );
    await openCanvas(page);
    const fx = await loadFixture(page, "sample");
    const { pageId, widthPt, heightPt } = fx.pages[0];
    // The middle of the cover, which its full-bleed background covers.
    const hit = await page.evaluate(
      async ({ pageId, at }) => {
        const r = (await (
          globalThis as unknown as {
            __canvas: { client: { send: (m: unknown) => Promise<unknown> } };
          }
        ).__canvas.client.send({
          kind: "hitTest",
          payload: { pageId, docPoint: at, filter: "any" },
        })) as {
          payload: {
            element: ElementRef | null;
            frameBounds: { top: number; left: number } | null;
          };
        };
        return r.payload;
      },
      { pageId, at: [widthPt / 2, heightPt / 2] },
    );
    const box = footprint(await geometry(page, hit.element!));
    // The hit's `frameBounds` is page-local; the composed geometry should
    // be too. Today it is off by the page's origin in its spread.
    expect(box.top).toBeCloseTo(hit.frameBounds!.top, 1);
    expect(box.left).toBeCloseTo(hit.frameBounds!.left, 1);
  });
});
