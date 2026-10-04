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

// The host half of in-frame grid editing: what an ACTIVE edit context
// receives from the shell besides printable keys.
//
//   AC-KEYS-1  arrows, Tab, Shift-Tab, Enter, Cmd+Home and F2 reach a sheet
//              frame's grid with no cell edit open (they used to arrive only
//              mid-edit), and Tab moves the cell cursor instead of hiding the
//              chrome;
//   AC-KEYS-2  Cmd+D inside the sheet fills down — the editor's Place, bound
//              to the same chord and registered first, does not open;
//   AC-KEYS-3  a chord the context does not claim still reaches the host
//              (Cmd+K opens the palette inside the sheet);
//   AC-KEYS-4  the dispatch rule itself: an enabled GUARDED binding beats an
//              unguarded one on the same combo, whatever the order;
//   AC-WHEEL-1 a wheel over the active frame goes to the context's
//              onContentWheel in content points; the canvas pans only when
//              the context declines, and Cmd-wheel stays zoom.
//
// The grid panel's cell-reference badge and formula bar are the readable
// proof of where the cursor is and what a cell holds.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { resolveBinding } from "../../../../packages/shell/src/registries/keybinding";
import { fitFirstPage, openCanvas, openPanel } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

// sheet-02-formulas.xlsx: A1=2, B1="Sum", A2=3, B2="Product",
// A3=SUM(A1:A2)=5, B3=B1&B2="SumProduct".
const XLSX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "harness/sheet-02-formulas.xlsx",
);
const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";
const GRID_PANEL = "media.paged.sheet.panel.grid";
const MOD = process.platform === "darwin" ? "Meta" : "Control";

interface ElementRef {
  kind: string;
  id: string;
}

interface CanvasHandle {
  __canvas: {
    ready: boolean;
    client: {
      camera: { read: () => { scale: number; tx: number; ty: number } };
      elementGeometry: (ids: unknown[]) => Promise<
        Array<{
          bounds: [number, number, number, number];
          itemTransform?: [number, number, number, number, number, number] | null;
        }>
      >;
      executeScript: (s: string) => Promise<{ output: string[]; error: string | null }>;
    };
    registries: {
      editContexts: { get: (type: string) => Record<string, unknown> | undefined };
    };
  };
}

async function elementScreenCenter(
  page: Page,
  ref: ElementRef,
): Promise<{ x: number; y: number }> {
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
    const c = (globalThis as unknown as CanvasHandle).__canvas;
    const item = (await c.client.elementGeometry([id]))[0];
    if (!item) return null;
    const [top, left, bottom, right] = item.bounds;
    const [a, b, cc, d, tx, ty] = item.itemTransform ?? [1, 0, 0, 1, 0, 0];
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const cam = c.client.camera.read();
    return {
      x: wrap.left + (a * cx + cc * cy + tx) * cam.scale + cam.tx,
      y: wrap.top + (b * cx + d * cy + ty) * cam.scale + cam.ty,
    };
  }, ref);
  expect(at, "the lowered frame has on-screen geometry").not.toBeNull();
  return at!;
}

async function selectedElement(page: Page): Promise<ElementRef | null> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as CanvasHandle).__canvas;
    const r = await c.client.executeScript("paged.selection()");
    const ids = JSON.parse(r.output[0] ?? "[]") as ElementRef[];
    return ids.length === 1 ? ids[0] : null;
  });
}

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

/** Enter the sheet context on `frame`, show the grid panel, and leave the
 *  keyboard focus on the canvas with the frame's grid live. Returns the
 *  frame's screen centre AFTER the dock relayout. */
async function enterSheet(page: Page, frame: ElementRef): Promise<{ x: number; y: number }> {
  const at = await elementScreenCenter(page, frame);
  await page.mouse.dblclick(at.x, at.y);
  await expect(page.locator("[data-edit-context-breadcrumb]")).toBeVisible({
    timeout: 10_000,
  });
  await openPanel(page, GRID_PANEL);
  await page.waitForTimeout(600);
  const at2 = await elementScreenCenter(page, frame);
  await page.mouse.click(at2.x, at2.y);
  await page.waitForTimeout(300);
  return at2;
}

const cellRef = (page: Page) => page.locator("[data-formula-cellref]");
const formula = (page: Page) => page.locator("[data-formula-input]");

test.describe("sheet frame — keys and wheel reach the active edit context", () => {
  test("AC-KEYS-4 — an enabled guarded binding beats an unguarded one on the same combo @feat:editor-shell.tool-rail @level:edge", () => {
    const place = { key: "cmd+d", command: "host.place" };
    let inGrid = true;
    const fill = { key: "cmd+d", command: "plugin.fillDown", when: () => inGrid };
    const press = { key: "d", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
    // Registered after the unguarded one, and still wins while it holds.
    expect(resolveBinding([place, fill], press)?.command).toBe("plugin.fillDown");
    expect(resolveBinding([fill, place], press)?.command).toBe("plugin.fillDown");
    // Its guard false → the global binding applies again.
    inGrid = false;
    expect(resolveBinding([place, fill], press)?.command).toBe("host.place");
    // Two unguarded / two guarded: registration order, as before.
    const other = { key: "cmd+d", command: "host.other" };
    expect(resolveBinding([place, other], press)?.command).toBe("host.place");
    inGrid = true;
    const fill2 = { key: "cmd+d", command: "plugin.fill2", when: () => true };
    expect(resolveBinding([fill, fill2], press)?.command).toBe("plugin.fillDown");
    // A different chord never matches.
    expect(resolveBinding([fill], { ...press, shiftKey: true })).toBeNull();
  });

  test.describe("in the editor", () => {
    test.beforeEach(async ({ page }) => {
      await openCanvas(page);
      await page.setInputFiles('input[type="file"]', fixturePath("geometry"));
      await expect
        .poll(
          () =>
            page.evaluate(() => (globalThis as unknown as CanvasHandle).__canvas.ready),
          { timeout: 30_000 },
        )
        .toBe(true);
      await fitFirstPage(page);
      await page.waitForTimeout(300);
    });

    test("AC-KEYS-1 — navigation keys move the grid cursor with no cell edit open; Tab does not hide the chrome @feat:sheet.grid.keyboard @feat:plugin-platform.modal-edit-session @level:gesture", async ({
      page,
    }) => {
      const frame = await importAndLower(page, "A1:B3");
      await enterSheet(page, frame);
      const rail = page.locator('[data-tool-rail="ready"]');
      await expect(rail).toBeVisible();

      await page.keyboard.press(`${MOD}+Home`);
      await expect(cellRef(page)).toHaveText("A1");
      await page.keyboard.press("ArrowDown");
      await expect(cellRef(page)).toHaveText("A2");
      await page.keyboard.press("Tab");
      await expect(cellRef(page)).toHaveText("B2");
      // The chrome toggle is bound to Tab too; the grid claimed it.
      await expect(rail).toBeVisible();
      await page.keyboard.press("Shift+Tab");
      await expect(cellRef(page)).toHaveText("A2");
      await expect(rail).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(cellRef(page)).toHaveText("A3");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await expect(cellRef(page)).toHaveText("A1");
      await expect(formula(page)).toHaveValue("2");

      // F2 opens the cell for editing in place; what is typed appends.
      await page.keyboard.press("F2");
      await page.keyboard.type("1");
      await page.keyboard.press("Enter");
      await page.keyboard.press(`${MOD}+Home`);
      await expect(cellRef(page)).toHaveText("A1");
      await expect(formula(page)).toHaveValue("21");

      // Still inside the sheet — none of these keys left the context.
      await expect(page.locator("[data-edit-context-breadcrumb]")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-edit-context-breadcrumb]")).toHaveCount(0);
    });

    test("AC-KEYS-2 — Cmd+D fills down inside the sheet and Place does not open @feat:sheet.edit.fill @feat:sheet.grid.keyboard @level:gesture", async ({
      page,
    }) => {
      const frame = await importAndLower(page, "A1:B3");
      await enterSheet(page, frame);
      let chooserOpened = false;
      page.on("filechooser", () => {
        chooserOpened = true;
      });

      await page.keyboard.press(`${MOD}+Home`);
      await page.keyboard.press("Shift+ArrowDown");
      await page.keyboard.press(`${MOD}+d`);
      await page.waitForTimeout(400);
      expect(chooserOpened, "Place (Cmd+D) did not open a file picker").toBe(false);

      // A2 now holds A1's 2, so A3 = SUM(A1:A2) recalculates to 4.
      await page.keyboard.press("ArrowDown");
      await expect(cellRef(page)).toHaveText("A2");
      await expect(formula(page)).toHaveValue("2");
      await expect(page.locator("[data-sheet-panel='grid']")).toContainText("4");
      await expect(page.locator("[data-edit-context-breadcrumb]")).toBeVisible();
    });

    test("AC-KEYS-3 — a chord the sheet does not claim still reaches the host @feat:sheet.grid.keyboard @level:edge", async ({
      page,
    }) => {
      const frame = await importAndLower(page, "A1:B3");
      await enterSheet(page, frame);
      const palette = page.locator("[data-palette-footer]");
      await expect(palette).toBeHidden();
      await page.keyboard.press(`${MOD}+k`);
      await expect(palette).toBeVisible();
    });

    test("AC-WHEEL-1 — a wheel over the active frame goes to onContentWheel; the canvas pans only when it declines @feat:plugin-platform.modal-edit-session @feat:sheet.grid.inframe @level:gesture", async ({
      page,
    }) => {
      const frame = await importAndLower(page, "A1:B3");
      const at = await enterSheet(page, frame);

      // Stand in for the bundle's hook on the live contribution — the
      // registry hands the stack the same object, so the host reads it at
      // wheel time. (plugin-api does not name the hook yet; this pins the
      // host side of it.)
      await page.evaluate(() => {
        const w = globalThis as unknown as CanvasHandle & {
          __wheels: Array<{ delta: [number, number]; contentPoint: [number, number] }>;
          __wheelTake: boolean;
        };
        w.__wheels = [];
        w.__wheelTake = true;
        const sheet = w.__canvas.registries.editContexts.get("sheet");
        if (!sheet) throw new Error("no sheet edit context registered");
        sheet.onContentWheel = (e: {
          delta: [number, number];
          contentPoint: [number, number];
        }) => {
          w.__wheels.push({ delta: e.delta, contentPoint: e.contentPoint });
          return w.__wheelTake;
        };
      });
      const camera = () =>
        page.evaluate(() =>
          (globalThis as unknown as CanvasHandle).__canvas.client.camera.read(),
        );
      const wheels = () =>
        page.evaluate(
          () =>
            (globalThis as unknown as { __wheels: Array<{ delta: [number, number] }> })
              .__wheels,
        );

      await page.mouse.move(at.x, at.y);
      const before = await camera();
      await page.mouse.wheel(0, 120);
      await expect.poll(async () => (await wheels()).length).toBe(1);
      const [first] = await wheels();
      // Content points: the screen delta divided by the camera scale.
      expect(first.delta[1]).toBeCloseTo(120 / before.scale, 3);
      await page.waitForTimeout(200);
      expect(await camera(), "a claimed wheel does not pan the canvas").toEqual(before);

      // Declined → the host pans as ever.
      await page.evaluate(() => {
        (globalThis as unknown as { __wheelTake: boolean }).__wheelTake = false;
      });
      await page.mouse.wheel(0, 120);
      await expect.poll(async () => (await camera()).ty).not.toBe(before.ty);
      expect((await wheels()).length).toBe(2);

      // Cmd/Ctrl-wheel is the host's zoom and never reaches the context.
      await page.keyboard.down(MOD);
      await page.mouse.wheel(0, -120);
      await page.keyboard.up(MOD);
      await page.waitForTimeout(200);
      expect((await wheels()).length).toBe(2);
    });
  });
});
