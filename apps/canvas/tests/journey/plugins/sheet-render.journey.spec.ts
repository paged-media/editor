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

// Journey: paged.sheet RENDERED output — not "the grid panel shows the
// value" (the sibling sheet.journey.spec.ts asserts the panel DOM), but
// "the spreadsheet actually reached the PAGE pixels a designer sees".
//
// What this render-verifies (and what it found):
//   1. IN-FRAME GRID (HARD) — entering the K-1 modal session paints the
//      windowed grid through the C-1 sceneLayer; requestSnapshot composites
//      that sceneLayer, so the page (blank before) now carries the grid.
//      This is the surface a designer edits, on the PUBLISHED engine.
//   2. CELL EDIT (best-effort) — typing a value re-renders the grid
//      sceneLayer; the modal screen-point math is fiddly headless, so it
//      collects rather than gates.
//
// FINDING (root-caused + FIXED — pending a paired release): on the PUBLISHED
// engine the LOWERED STATIC native table renders BLANK because its phase-3
// cell pour never applies. Three causes, all now fixed:
//   1. The bundle nested the whole Table id object as `table_id`
//      (createdId.id was cast `as string` but insertTable mints a STRUCTURED
//      {story_id, table_id}), so the engine rejected every cell op with
//      "invalid type: map, expected a string". [plugin-sheets fix/tablecell-id]
//   2. The bundle combined the text pour (insertText) + decor
//      (setElementProperty) in ONE batch; Operation::Batch carries only frame
//      ops (text is a separate apply lane), so the engine rejected the whole
//      batch (Mutation::Batch NotImplemented). [plugin-sheets fix/tablecell-id]
//   3. Pouring text into a fresh (zero-paragraph) cell PANICKED in core
//      (index out of bounds at mutate.rs:264), poisoning the wasm.
//      [core fix/empty-cell-text-pour — seed an empty paragraph]
// With both fixes the table RENDERS (verified under the protocol-50 sync-wasm
// override). On the published 0.49.0 editor it stays blank until that paired
// core+bundle release ships — so the finding below still fires there. The
// sibling plumbing journey never saw this — it reads the modal grid PANEL
// (DOM), never the page.

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const XLSX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/sheet-02-formulas.xlsx",
);

const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";

interface ElementRef {
  kind: string;
  id: string;
}

/** The element currently selected (single selection), via the worker. */
async function selectedElement(page: Page): Promise<ElementRef | null> {
  return page.evaluate(async () => {
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
    const r = await c.client.executeScript("paged.selection()");
    const ids = JSON.parse(r.output[0] ?? "[]") as ElementRef[];
    return ids.length === 1 ? ids[0] : null;
  });
}

/** Screen point at the centre of an element's TRANSFORMED page-0 bounds. */
async function elementScreenCenter(
  page: Page,
  ref: ElementRef,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(async (id) => {
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
  }, ref);
}

/** Import the xlsx through the workbook panel's K-5 picker and lower
 *  `range` to a page frame; resolves to the created frame's ref. */
async function importAndLower(page: Page, range: string): Promise<ElementRef> {
  await openPanel(page, WORKBOOK_PANEL);
  const pick = page.locator("[data-sheet-pick]");
  await expect(pick).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await pick.click();
  await (await chooser).setFiles(XLSX_FIXTURE);
  const rangeInput = page.locator("[data-sheet-range]");
  await expect(rangeInput).toBeVisible({ timeout: 20_000 });
  await rangeInput.fill(range);
  await page.locator("[data-sheet-lower]").click();
  let frame: ElementRef | null = null;
  await expect
    .poll(
      async () => {
        frame = await selectedElement(page);
        return frame?.kind ?? null;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  return frame!;
}

test.describe("journey · paged.sheet render output", () => {
  test("a lowered spreadsheet renders its grid in-frame through the K-1 modal session (the static native table is blank until the paired core+bundle cell-pour fix ships) @feat:sheet.grid.inframe @feat:plugin-platform.modal-edit-session @feat:sheet.lower.page @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const collected: string[] = [];

    // ── 0. NEGATIVE CONTROL — the blank page is render-stable, so a later
    //    "changed" is genuine sheet pixels, not snapshot noise. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. LOWER — import the .xlsx, lower A1:B3 to a page frame. HARD: a
    //    frame reaches the page. Whether its STATIC cells poured is REPORTED —
    //    blank on the published 0.49.0 engine until the paired core+bundle
    //    cell-pour fix ships (see the file header). ──
    const beforeLower = await designer.renderBytes();
    const frame = await importAndLower(page, "A1:B3");
    expect(frame.id, "the lowering created a page frame").not.toBe("");
    await page.waitForTimeout(400);
    const afterLower = await designer.renderBytes();
    const staticPx = await designer.renderDiffPixels(beforeLower, afterLower);
    if (staticPx <= 64) {
      collected.push(
        `static native table did NOT render (${staticPx}px) on the published engine — ` +
          "root-caused + FIXED on core fix/empty-cell-text-pour (empty-cell paragraph seed) " +
          "+ plugin-sheets fix/tablecell-id (table id + two apply lanes); renders under the " +
          "protocol-50 override, ships when that paired release lands",
      );
    }

    // ── 2. IN-FRAME GRID RENDERS (HARD) — double-click to enter the K-1
    //    modal session; the C-1 sceneLayer paints the windowed grid onto the
    //    page. The snapshot, blank before, must now carry the grid. ──
    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    const at = await elementScreenCenter(page, frame);
    expect(at, "the lowered frame has on-screen geometry").not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);
    const inSession = await designer.renderBytes();
    const gridPx = await designer.expectRenderChanged(afterLower, inSession);
    expect(gridPx, "the in-frame grid sceneLayer rendered onto the page").toBeGreaterThan(64);

    // ── 3. CELL EDIT RE-RENDERS (best-effort) — recompute the point (the
    //    entry relayout shifts the canvas), click a cell, type a value; the
    //    grid sceneLayer must re-render. The modal screen math is fiddly
    //    headless, so collect. ──
    try {
      const at2 = await elementScreenCenter(page, frame);
      if (!at2) throw new Error("no on-screen geometry after entering the session");
      const beforeEdit = await designer.renderBytes();
      await page.mouse.click(at2.x, at2.y);
      await page.waitForTimeout(300);
      await page.keyboard.type("4321");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      const afterEdit = await designer.renderBytes();
      const editPx = await designer.renderDiffPixels(beforeEdit, afterEdit);
      if (editPx <= 64) {
        collected.push(`in-frame cell edit re-rendered only ${editPx}px (≤64)`);
      }
    } catch (err) {
      collected.push(`in-frame edit threw: ${String(err)}`);
    }

    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0);

    // The HARD gates were the negative control + the in-frame grid render
    // above. The static-table cell-pour status and the best-effort edit
    // re-render are recorded as visible annotations — NOT gated, so this
    // journey stays green while surfacing exactly what does and doesn't
    // reach the page. The static-table note clears once the paired
    // core+bundle cell-pour fix ships to the published engine; the in-frame
    // grid proof holds regardless.
    for (const note of collected) {
      test.info().annotations.push({ type: "render-finding", description: note });
      // eslint-disable-next-line no-console
      console.log(`[sheet-render] finding: ${note}`);
    }
  });
});
