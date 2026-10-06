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

// ADR 323 (Wave 6) — the STRUCTURE panels on the object model, end to end
// on the real engine: Inspector, Align, Table, Layers.
//
//   · Inspector — every row with a schema row is a `PropertyField`: set →
//     `host.objects` → one undo; "Bind to data…" on it.
//   · Align — NOT fields: a typed command (`paged.align.objects`,
//     declared args) over `host.objects`; one click over two frames is
//     ONE batch = one undo step.
//   · Table — cell properties on `cell:<table>/<r>,<c>` addresses.
//   · Layers — layer flags on `layer:<id>` addresses.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";
import { loadFixture, type ElementRef } from "./e2e/harness/fixtures";
import { mutate, selectElements } from "./e2e/harness/ui";
import { loadViaReactPath, screenPoint } from "./e2e/harness/viewport";
import { bindDryRun, fieldOf, objGet, undoOnce } from "./e2e/harness/objects";

const addr = (r: ElementRef) => `${r.kind}:${r.id}`;

async function commit(page: Page, input: ReturnType<Page["locator"]>, value: string) {
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

/** First table cell on page 0 (hit-test sweep), as the Table panel's
 *  own spec finds it. */
async function findCell(page: Page, pageId: string, w: number, h: number) {
  return page.evaluate(
    async ({ pageId, w, h }) => {
      const c = (globalThis as unknown as {
        __canvas: { client: { send(m: unknown): Promise<{ kind: string; payload?: { storyId?: string | null; tableContext?: { tableId: string; row: number; col: number } | null } }> } };
      }).__canvas;
      for (let gy = 0.04; gy < 0.97; gy += 0.03) {
        for (let gx = 0.04; gx < 0.97; gx += 0.03) {
          const r = await c.client.send({ kind: "hitTest", payload: { pageId, docPoint: [w * gx, h * gy], filter: "any" } });
          const p = r.payload;
          if (r.kind === "hitResult" && p?.tableContext && p.storyId) {
            return { tableId: p.tableContext.tableId, row: p.tableContext.row, col: p.tableContext.col, gx, gy };
          }
        }
      }
      return null;
    },
    { pageId, w, h },
  );
}

test.describe("ADR 323 — structure panels over host.objects", () => {
  test("OM-STRUCT-1 — Inspector rows are schema fields: set → host.objects → one undo; Bind to data… @feat:editor-shell.panels.inspector @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const fx = await loadFixture(page, "geometry");
    const rect = fx.firstRectangle!;
    await selectElements(page, [rect]);
    await openPanel(page, "paged.inspector");
    const field = fieldOf(page.locator('[data-inspector="ready"]'), "frameStrokeWeight");
    await expect(field).toHaveAttribute("data-value-type", "length");
    const before = await objGet(page, addr(rect), "frameStrokeWeight");
    const next = before === 6 ? 8 : 6;
    await commit(page, field.locator("input").first(), String(next));
    await expect.poll(() => objGet(page, addr(rect), "frameStrokeWeight")).toBe(next);
    await undoOnce(page);
    await expect.poll(() => objGet(page, addr(rect), "frameStrokeWeight")).toEqual(before);
    await bindDryRun(page, field, "frameStrokeWeight");
  });

  test("OM-STRUCT-2 — Align is a typed command over host.objects: two frames, ONE undo step @feat:editor-shell.panels.align @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const fx = await loadFixture(page, "geometry");
    // Two frames on page 0 and an edge they do not share (so the
    // alignment moves one of them).
    const two = fx.frames.filter((f) => f.pageIndex === 0).map((f) => f.ref).slice(0, 2);
    expect(two.length).toBe(2);
    const before = await Promise.all(two.map((r) => objGet(page, addr(r), "frameBounds") as Promise<number[]>));
    const edges = [
      { kind: "left", i: 1, pick: Math.min },
      { kind: "top", i: 0, pick: Math.min },
      { kind: "right", i: 3, pick: Math.max },
      { kind: "bottom", i: 2, pick: Math.max },
    ];
    const edge = edges.find((e) => Math.abs(before[0][e.i] - before[1][e.i]) > 1);
    expect(edge, "an edge the two frames do not share").toBeTruthy();
    await selectElements(page, two);
    await openPanel(page, "paged.align");
    // The command is typed: its declared args refuse a bad payload.
    const refused = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: { registries: { commands: { invoke(id: string, p: unknown): Promise<unknown> } } } }).__canvas;
      try {
        await c.registries.commands.invoke("paged.align.objects", { kind: "sideways", targets: [] });
        return null;
      } catch (e) {
        return String(e);
      }
    });
    expect(refused).toMatch(/invalidValue/);
    await page.locator(`[data-align-panel="ready"] [data-align-kind="${edge!.kind}"]`).click();
    const target = edge!.pick(before[0][edge!.i], before[1][edge!.i]);
    for (const r of two) {
      await expect
        .poll(async () => ((await objGet(page, addr(r), "frameBounds")) as number[])[edge!.i])
        .toBeCloseTo(target, 3);
    }
    await undoOnce(page);
    for (const [i, r] of two.entries()) {
      await expect.poll(() => objGet(page, addr(r), "frameBounds")).toEqual(before[i]);
    }
  });

  test("OM-STRUCT-3 — Table ▸ cell inset on a cell: address: set → host.objects → one undo @feat:editor-shell.panels.table @feat:tables.model @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "tables");
    const p0 = fx.pages[0];
    const cell = await findCell(page, p0.pageId, p0.widthPt, p0.heightPt);
    expect(cell).not.toBeNull();
    const pt = await screenPoint(page, p0.widthPt * cell!.gx, p0.heightPt * cell!.gy);
    await page.mouse.click(pt.x, pt.y);
    await openPanel(page, "paged.table");
    await expect(page.locator('[data-table-panel="ready"]')).toBeVisible();
    const address = `cell:${encodeURIComponent(cell!.tableId)}/${cell!.row},${cell!.col}`;
    const field = fieldOf(page.locator('[data-table-panel="ready"]'), "cellInsetTop");
    await expect(field).toHaveAttribute("data-binding-state", "value");
    const before = await objGet(page, address, "cellInsetTop");
    const next = before === 7 ? 9 : 7;
    await commit(page, field.locator('[data-num-input="inset-top"]'), String(next));
    await expect.poll(() => objGet(page, address, "cellInsetTop")).toBe(next);
    await undoOnce(page);
    await expect.poll(() => objGet(page, address, "cellInsetTop")).toEqual(before);
  });

  test("OM-STRUCT-4 — Layers ▸ visibility on a layer: address: set → host.objects → one undo @feat:editor-shell.panels.layers @feat:layers.ops @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    await loadFixture(page, "geometry");
    await mutate(page, { op: "layerInsert", args: { position: 0, name: "OM" } });
    await openPanel(page, "paged.layers");
    const id = await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: { client: { layers(): Promise<Array<{ selfId: string; name: string }>> } } }).__canvas;
      return (await c.client.layers()).find((l) => l.name === "OM")?.selfId ?? null;
    });
    expect(id).not.toBeNull();
    const address = `layer:${encodeURIComponent(id!)}`;
    expect(await objGet(page, address, "layerVisible")).toBe(true);
    await page.locator(`[data-list-row="${id}"] [data-list-action="paged.layers.toggleVisible"]`).click();
    await expect.poll(() => objGet(page, address, "layerVisible")).toBe(false);
    await undoOnce(page);
    await expect.poll(() => objGet(page, address, "layerVisible")).toBe(true);
  });
});
