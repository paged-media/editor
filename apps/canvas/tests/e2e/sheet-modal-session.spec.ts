// E2E — K-1 LIVE VALIDATION (the RFI's last open K-1 residual): the
// sheets modal session end-to-end through the REAL editor, INCLUDING a
// ROTATED frame (the §8.5 content-coordinate inversion the unit suites
// can't see) and the ADR-012 Tier-1 in-session undo:
//
//   AC-K1-1  import an xlsx via the workbook panel (K-5 picker), lower a
//            range to a page frame (binding stamped), double-click it →
//            the "sheet" edit context enters (breadcrumb), Esc exits;
//   AC-K1-2  ROTATE the frame 30°, re-enter, click INSIDE the rotated
//            content → a cell selects (the editor's page→content
//            inversion), type → Enter commits — the value shows in the
//            grid panel — then Cmd-Z routes to the session's journal
//            (ADR-012: the document stack stays suspended) and the cell
//            reverts.
//
// The grid panel renders the engine's windowed GridScene into DOM, so it
// is the readable proof of what the in-frame edit committed.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const XLSX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "harness/sheet-02-formulas.xlsx",
);

const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";
const GRID_PANEL = "media.paged.sheet.panel.grid";

interface ElementRef {
  kind: string;
  id: string;
}

/** Screen point at the centre of an element's TRANSFORMED page-0 bounds
 *  (itemTransform folded in — correct under rotation). */
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

/** Rotate a frame via the real mutation lane (undoable, like a panel). */
async function rotateFrame(
  page: Page,
  ref: ElementRef,
  degrees: number,
): Promise<void> {
  await page.evaluate(
    async ({ id, deg }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: { mutate: (m: unknown) => Promise<unknown> };
          };
        }
      ).__canvas;
      await c.client.mutate({
        op: "setElementProperty",
        args: {
          elementId: id,
          path: "frameRotationAngle",
          value: { type: "length", value: deg },
        },
      });
    },
    { id: ref, deg: degrees },
  );
}

async function fitHome(page: Page): Promise<void> {
  await page.keyboard.press("Home");
  await page.waitForTimeout(1200);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              globalThis as unknown as {
                __canvas: {
                  client: { camera: { read: () => { scale: number } } };
                };
              }
            ).__canvas.client.camera.read().scale,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0.2);
}

/** Import the xlsx through the workbook panel's K-5 picker and lower
 *  `range` to a page frame; resolves to the created frame's ref. */
async function importAndLower(
  page: Page,
  range: string,
): Promise<ElementRef> {
  await openPanel(page, WORKBOOK_PANEL);
  const pick = page.locator("[data-sheet-pick]");
  await expect(pick).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await pick.click();
  await (await chooser).setFiles(XLSX_FIXTURE);
  // The loaded state renders the sheet/range controls — the proof the
  // engine booted IN-BROWSER and parsed the workbook.
  const rangeInput = page.locator("[data-sheet-range]");
  await expect(rangeInput).toBeVisible({ timeout: 20_000 });
  await rangeInput.fill(range);
  await page.locator("[data-sheet-lower]").click();
  // The lowering selects its created frame — read it back.
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

test.describe("E2E sheet modal session (K-1 live validation + ADR-012)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await page.setInputFiles('input[type="file"]', fixturePath("geometry"));
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (globalThis as unknown as { __canvas: { ready: boolean } })
                .__canvas.ready,
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await fitHome(page);
  });

  test("AC-K1-1 — lower a range, double-click enters the sheet context, Esc exits", async ({
    page,
  }) => {
    const frame = await importAndLower(page, "A1:B3");
    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    await expect(breadcrumb).toHaveCount(0);

    const at = await elementScreenCenter(page, frame);
    expect(at).not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0);
  });

  test("AC-K1-2 — unrotated: click selects, type+Enter commits, Cmd-Z journals back", async ({
    page,
  }) => {
    const frame = await importAndLower(page, "A1:B3");
    await runEditLoop(page, frame);
  });

  test("AC-K1-3 — ROTATED frame: the §8.5 content inversion holds for the same loop", async ({
    page,
  }) => {
    const frame = await importAndLower(page, "A1:B3");
    // Rotate the lowered frame — the case the unit suites can't
    // exercise: the editor must invert the content transform so the
    // in-frame grid still hit-tests correctly.
    await rotateFrame(page, frame, 30);
    await page.waitForTimeout(500);
    await runEditLoop(page, frame);
  });

  async function runEditLoop(page: Page, frame: ElementRef): Promise<void> {
    const at = await elementScreenCenter(page, frame);
    expect(at).not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);
    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });

    // Entering the context raises the context's panels — the dock
    // relayout shifts the canvas, so the pre-entry screen point is
    // stale. Recompute before the in-frame click.
    await page.waitForTimeout(600);
    const at2 = await elementScreenCenter(page, frame);
    expect(at2).not.toBeNull();

    // Click inside the content → the content-pointer lane selects a
    // cell (selection is engine state; the next keystroke edits it).
    await page.mouse.click(at2!.x, at2!.y);
    await page.waitForTimeout(300);

    // Type a value into the selected cell and commit it (Enter routes to
    // the cell editor while dirty — K-1's onContentKey contract).
    await page.keyboard.type("4321");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    // The grid panel renders the engine's windowed scene into DOM — the
    // committed value must be there.
    await openPanel(page, GRID_PANEL);
    const grid = page.locator("[data-sheet-panel='grid']");
    await expect(grid).toContainText("4321", { timeout: 10_000 });

    // ADR-012 Tier 1 — Cmd-Z while the context is active routes to the
    // session's journal (NOT the document stack): the cell reverts.
    await page.mouse.click(at2!.x, at2!.y); // keep focus on the canvas
    await page.waitForTimeout(200);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(grid).not.toContainText("4321", { timeout: 10_000 });

    // And the context is still active (the undo did NOT exit or touch
    // the document stack — the frame is still there, still entered).
    await expect(breadcrumb).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0);
  }
});
