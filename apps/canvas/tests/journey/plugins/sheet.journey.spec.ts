// Journey: the paged.sheet plugin — placing a spreadsheet and editing
// it IN-FRAME through the K-1 modal edit session.
//
// A designer imports an .xlsx through the workbook panel's K-5 picker,
// lowers a range to a page frame (the native <Table> reaches the
// document — sheet.lower.page), double-clicks it to ENTER the modal
// sheet session (plugin-platform.modal-edit-session — breadcrumb shows),
// clicks a cell, types a value, Enter commits, and reads it back through
// the in-frame grid panel (sheet.grid.inframe). Then Cmd-Z routes to the
// session's OWN journal (ADR-012: the document stack stays suspended) so
// the cell reverts, and Esc exits — exactly the K-1 loop the proven e2e
// sheet-modal-session.spec.ts validates, here framed as a designer's
// DTP workflow on a blank File ▸ New document instead of a fixture load.
//
// The modal-session + screen-point math is FIDDLY (the entry raises the
// context's panels, the dock relayout shifts the canvas, so the screen
// point must be RECOMPUTED before the in-frame click; the center folds
// itemTransform so it survives rotation/dock-relayout). This spec COPIES
// that mechanism verbatim from the e2e — it is not reinvented here.
//
// Per-step COLLECT-FAILURES: the import + lower + session-entry are HARD
// assertions (they gate the test — the e2e proves them green); the
// in-frame edit + journal-undo collect so one run reveals which parts of
// the K-1 loop drove through the real host.

import { expect, test, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { Designer } from "../driver/designer";

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

// Reuse the SAME .xlsx the proven e2e drives (a formulas workbook).
const XLSX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../e2e/harness/sheet-02-formulas.xlsx",
);

const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";
const GRID_PANEL = "media.paged.sheet.panel.grid";

interface ElementRef {
  kind: string;
  id: string;
}

/** Screen point at the centre of an element's TRANSFORMED page-0 bounds
 *  (itemTransform folded in — correct under rotation / after a dock
 *  relayout shifts the camera). COPIED from sheet-modal-session.spec. */
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

/** The element currently selected (single selection), via the worker.
 *  COPIED from sheet-modal-session.spec. */
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

/** Import the xlsx through the workbook panel's K-5 picker and lower
 *  `range` to a page frame; resolves to the created frame's ref. COPIED
 *  from sheet-modal-session.spec (the file-picker → filechooser →
 *  setFiles dance + range fill + lower + selection read-back). */
async function importAndLower(page: Page, range: string): Promise<ElementRef> {
  await openPanel(page, WORKBOOK_PANEL);
  const pick = page.locator("[data-sheet-pick]");
  await expect(pick).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await pick.click();
  await (await chooser).setFiles(XLSX_FIXTURE);
  // The loaded state renders the sheet/range controls — the proof the
  // engine booted IN-BROWSER and parsed the workbook (boots lazily, so
  // allow a generous timeout).
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

test.describe("journey · paged.sheet plugin", () => {
  test("a designer places a spreadsheet and edits it in-frame: import an xlsx, lower a range, enter the modal sheet session, edit a cell, then journal-undo @feat:plugin-platform.modal-edit-session @feat:sheet.lower.page @feat:sheet.grid.inframe @feat:editor-shell.plugin-bundles @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const failures: string[] = [];

    // ── 1. PLACE — import the .xlsx through the workbook panel's K-5
    //    picker and lower A1:B3 to a page frame. The native S-03 table
    //    must reach the document (the "frame placed empty" console
    //    warning was a live regression the e2e caught: hitTest can't
    //    resolve an EMPTY frame's story). HARD — gates the test. ──
    const emptyPours: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("frame placed empty")) emptyPours.push(msg.text());
    });
    const frame = await importAndLower(page, "A1:B3");
    expect(emptyPours, "the lowered frame poured a non-empty table").toEqual([]);

    const breadcrumb = page.locator("[data-edit-context-breadcrumb]");
    await expect(breadcrumb).toHaveCount(0);

    // ── 2. ENTER — double-click the lowered frame to enter the K-1 modal
    //    sheet session; the edit-context breadcrumb appears. HARD — this
    //    is the modal-edit-session surface under test. ──
    const at = await elementScreenCenter(page, frame);
    expect(at, "the lowered frame has on-screen geometry").not.toBeNull();
    await page.mouse.dblclick(at!.x, at!.y);
    await expect(breadcrumb).toBeVisible({ timeout: 10_000 });

    // Entering the context raises the context's panels — the dock
    // relayout shifts the canvas, so the pre-entry screen point is stale.
    // Recompute before the in-frame click (the §8.5 fiddly bit).
    await page.waitForTimeout(600);
    const at2 = await elementScreenCenter(page, frame);
    expect(at2).not.toBeNull();

    // ── 3. EDIT — click inside the content → the content-pointer lane
    //    selects a cell (engine state); type a value, Enter commits
    //    (K-1's onContentKey routes Enter to the cell editor while
    //    dirty). The grid panel renders the engine's windowed scene into
    //    DOM — the readable proof of what the in-frame edit committed.
    //    Best-effort: collect so a partial drive is visible. ──
    await page.mouse.click(at2!.x, at2!.y);
    await page.waitForTimeout(300);
    await page.keyboard.type("4321");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    await openPanel(page, GRID_PANEL);
    const grid = page.locator("[data-sheet-panel='grid']");
    try {
      await expect(grid).toContainText("4321", { timeout: 10_000 });
    } catch {
      failures.push(
        "in-frame edit: the typed value did not appear in the grid panel",
      );
    }

    // ── 4. JOURNAL-UNDO — ADR-012 Tier 1: Cmd-Z while the context is
    //    active routes to the session's OWN journal (NOT the document
    //    stack), so the cell reverts and the context stays active.
    //    Best-effort: collect. ──
    await page.mouse.click(at2!.x, at2!.y); // keep focus on the canvas
    await page.waitForTimeout(200);
    await page.keyboard.press("ControlOrMeta+z");
    try {
      await expect(grid).not.toContainText("4321", { timeout: 10_000 });
      // The undo did NOT exit or touch the document stack — the context
      // is still active (the frame is still entered).
      await expect(breadcrumb).toBeVisible();
    } catch {
      failures.push(
        "session undo: Cmd-Z did not revert the cell via the session journal",
      );
    }

    // ── 5. EXIT — Esc leaves the modal session. HARD — the session must
    //    be exitable (the breadcrumb disappears). ──
    await page.keyboard.press("Escape");
    await expect(breadcrumb).toHaveCount(0);

    // One run, the K-1 loop reported. The import, lower, session entry,
    // and exit above are HARD assertions (they gate the test); the
    // in-frame edit + journal-undo collect so a partial drive is visible.
    expect(
      failures,
      `paged.sheet in-frame edit steps that did not drive: ${failures.join("; ")}`,
    ).toEqual([]);
  });
});
