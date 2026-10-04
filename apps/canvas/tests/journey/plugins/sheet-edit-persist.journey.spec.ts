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

// Journey: a sheet EDIT survives save → reopen.
//
// A designer places A1:B3, enters the frame, types 10 into A1 and leaves.
// The placed table refreshes (A1 10, A3 = SUM(A1:A2) = 13). They save the
// document as .paged and open that file in a FRESH editor — a new browser
// context, so no per-browser cache (OPFS blob, session memory) can stand in
// for what the file itself carries.
//
//   1. The placed values survive the reopen (HARD).
//   2. The WORKBOOK survives it: the .paged carries the edited workbook as
//      its part (paged/media.paged.sheet/workbook.xlsx), and re-entering the
//      frame should show A1 = 10 in the grid.
//
// (2) was a DEFECT until paged.sheet 0.1.0-canary.12: the bundle read its
// part only when it ACTIVATED (app boot, before any document was open), so
// entering the reopened frame logged "showGridInFrame: no workbook / sheet".
// The bundle now restores the workbook on every `documentLoaded` and lazily
// on entering a sheet frame.
//
// A reopened document re-mints its element ids, so the frame is found
// again by its geometry (the only text frame at the placed bounds).

import { expect, test, type Browser, type Page } from "@playwright/test";

import { fitFirstPage, openPanel } from "../../fidelity/canvas-driver";
import { zipEntryNames } from "../../e2e/harness/read-zip";
import { Designer } from "../driver/designer";
import {
  GRID_PANEL,
  MOD,
  enterSheet,
  exitSheet,
  exportPaged,
  importAndLower,
  placedValues,
  type ElementRef,
} from "./sheet-kit";

const EDITED = [
  ["10", "Sum"],
  ["3", "Product"],
  ["13", "SumProduct"],
];

type Bounds = [number, number, number, number];

/** The frame's bounds (top, left, bottom, right) in page points. */
async function boundsOf(page: Page, frame: ElementRef): Promise<Bounds> {
  return page.evaluate(async (id) => {
    const c = (globalThis as unknown as {
      __canvas: { client: { elementGeometry: (ids: unknown[]) => Promise<Array<{ bounds: Bounds }>> } };
    }).__canvas;
    return (await c.client.elementGeometry([id]))[0]!.bounds;
  }, frame);
}

/** The text frame at `bounds` in the open document (ids differ after a
 *  reopen; the geometry does not). */
async function frameAt(page: Page, bounds: Bounds): Promise<ElementRef | null> {
  return page.evaluate(async (want) => {
    type Node = { id?: { kind: string; id: unknown }; children?: Node[] };
    const c = (globalThis as unknown as {
      __canvas: {
        client: {
          sceneTree: () => Promise<Node[]>;
          elementGeometry: (ids: unknown[]) => Promise<Array<{ bounds: Bounds }>>;
        };
      };
    }).__canvas;
    const frames: { kind: string; id: string }[] = [];
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        if (n.id?.kind === "textFrame" && typeof n.id.id === "string") {
          frames.push({ kind: "textFrame", id: n.id.id });
        }
        if (n.children) walk(n.children);
      }
    };
    walk(await c.client.sceneTree());
    const geom = await c.client.elementGeometry(frames);
    const hit = frames.filter((_, i) =>
      geom[i]?.bounds.every((v, k) => Math.abs(v - want[k]!) < 0.01),
    );
    return hit.length === 1 ? hit[0]! : null;
  }, bounds);
}

/** Place, edit A1 → 10 in-frame, leave; returns the saved .paged bytes. */
async function editAndSave(page: Page): Promise<{ paged: Buffer; frame: ElementRef }> {
  const designer = new Designer(page);
  await designer.open();
  await designer.newDocument();
  const frame = await importAndLower(page, "A1:B3");
  await enterSheet(page, frame);
  await page.keyboard.press(`${MOD}+Home`);
  await page.keyboard.type("10");
  await page.keyboard.press("Enter");
  await exitSheet(page);
  await expect.poll(() => placedValues(page), { timeout: 10_000 }).toEqual(EDITED);
  const paged = await exportPaged(page);
  expect(zipEntryNames(paged), "the .paged carries the workbook part").toContain(
    "paged/media.paged.sheet/workbook.xlsx",
  );
  return { paged, frame };
}

/** Open `paged` through the file door of a brand-new editor. */
async function reopenFresh(browser: Browser, paged: Buffer): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await new Designer(page).open();
  await page.setInputFiles('input[type="file"]', {
    name: "sheet-edit-persist.paged",
    mimeType: "application/octet-stream",
    buffer: paged,
  });
  // The open is asynchronous; until the document lands an export throws.
  await expect
    .poll(() => placedValues(page).catch(() => []), { timeout: 20_000 })
    .not.toEqual([]);
  await fitFirstPage(page);
  return page;
}

test.describe("journey · paged.sheet edit persistence", () => {
  test("an in-frame edit survives save → reopen in a fresh editor (placed values) @feat:sheet.plugin.persistence @feat:sheet.lower.page @level:happy", async ({
    page,
    browser,
  }) => {
    const { paged } = await editAndSave(page);
    const reopened = await reopenFresh(browser, paged);
    expect(await placedValues(reopened)).toEqual(EDITED);
    await reopened.context().close();
  });

  test("the edited workbook itself is restored from the reopened .paged @feat:sheet.plugin.persistence @level:edge", async ({
    page,
    browser,
  }) => {
    const { paged, frame } = await editAndSave(page);
    const bounds = await boundsOf(page, frame);
    const reopened = await reopenFresh(browser, paged);
    try {
      const again = await frameAt(reopened, bounds);
      expect(again, "the placed frame is in the reopened document").not.toBeNull();
      await enterSheet(reopened, again!, { withGrid: true });
      await openPanel(reopened, GRID_PANEL);
      await reopened.keyboard.press(`${MOD}+Home`);
      await expect(reopened.locator("[data-formula-cellref]")).toHaveText("A1", {
        timeout: 10_000,
      });
      await expect(reopened.locator("[data-formula-input]")).toHaveValue("10");
    } finally {
      await reopened.context().close();
    }
  });
});
