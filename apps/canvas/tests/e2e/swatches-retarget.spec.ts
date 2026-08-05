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

// E2E — ADR 023: ONE Swatches panel that RETARGETS. The falsifiable test
// for the SCOPE axis, which is the axis the Layers proof cannot reach.
//
// WHY THIS IS A DIFFERENT PROOF FROM `layers-retarget.spec.ts`, and not a
// second copy of it. ADR 023 requires three consumers of DIFFERENT SHAPE,
// because one consumer only proves you built something shaped like its
// only caller:
//
//   · LAYERS — an element COLLECTION addressed by row identity, whose
//     per-row state IS core `PropertyPath`s. Proven already.
//   · CHARACTER/PARAGRAPH — SCALAR paths over a RANGE, value may be
//     MIXED. Not this slice.
//   · SWATCHES — a DOCUMENT-SCOPED RESOURCE the panel edits directly.
//     There is no selection to address (`readCollection` takes no
//     target), and core models a swatch's whole mutable surface as
//     STRUCTURAL OPS, not paths: the `PropertyPath` union has no
//     `swatchName` and no swatch colour. So the capability gate here is
//     an OP gate (`useCollectionOpOffered`), which is the host hook this
//     consumer forced into existence.
//
//   AC-SWATCH-RETARGET-1  with nothing plugin-owned selected the panel is
//                         answered by CORE and lists the DOCUMENT's
//                         swatches;
//   AC-SWATCH-RETARGET-2  double-clicking a lowered sheet frame enters
//                         paged.sheet's `sheet` context and the SAME
//                         panel is answered by media.paged.sheet, listing
//                         the WORKBOOK PALETTE — different rows, same
//                         panel, one tab. The fixture's chart declares
//                         `<a:srgbClr val="3366CC"/>`, so the palette
//                         must carry that colour at its deterministic
//                         minted id;
//   AC-SWATCH-RETARGET-3  Esc pops the context and the panel returns to
//                         core. Retargeting, not a one-way switch;
//   AC-SWATCH-CAP-1       the panel's OP-shaped capability gates follow
//                         the ACTIVE provider: "+ New" / Libraries /
//                         delete are live over core and DISABLED over the
//                         workbook palette, because paged.sheet declares
//                         only `editSwatch`. `provides.ops` doing the job
//                         `provides.paths` does for Layers — and the
//                         reason the path-shaped gate alone was not
//                         enough;
//   AC-SWATCH-WRITE-1     an edit made through the panel while the sheet
//                         context is active MINTS the workbook colour as
//                         a real DOCUMENT swatch, at the id the lowering
//                         already uses. This is the ADR's own observation
//                         closing the loop: plugin-sheets was already
//                         minting document swatches from production code
//                         with no panel to drive them from.
//
// The panel contains no `if (pluginId === …)` and neither does the
// platform seam it reads through. `data-swatches-provider` is a DOM hook
// and a diagnostic; this spec is the only thing that reads it.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "../fidelity/canvas-driver";
import { fixturePath } from "./harness/fixtures";

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const PANEL_ID = "paged.swatches";
const SHEET_PLUGIN = "media.paged.sheet";
const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";

/** The chart workbook: `xl/charts/chart1.xml` carries an explicit
 *  `<a:solidFill><a:srgbClr val="3366CC"/></a:solidFill>` series colour,
 *  so the workbook palette is non-empty AND deterministic. A colourless
 *  fixture would make every assertion below vacuously true, which is the
 *  exact shape of a green test that proves nothing. */
const XLSX_FIXTURE = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  "harness/sheet-09-chart.xlsx",
);

/** The palette id paged.sheet mints for the fixture's series colour —
 *  pinned in plugin-sheets' own `engine-real.spec.ts` against the real
 *  wasm engine, so the two ends of the seam agree by test, not by
 *  coincidence. */
const CHART_SWATCH_ID = "Color/uPagedSheetChart3366CC";

interface ElementRef {
  kind: string;
  id: string;
}

/** The panel's swatch grid — the element carrying the answering
 *  authority. */
function grid(page: Page) {
  return page.locator('[data-swatch-collection="ready"]');
}

/** Swatch ids in render order. */
async function renderedSwatchIds(page: Page): Promise<string[]> {
  return grid(page)
    .locator("[data-swatch-id]")
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-swatch-id") ?? ""),
    );
}

/** The engine's own swatch collection — the ground truth the CORE half
 *  of the retarget must equal, read independently of the panel. */
async function engineSwatchIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<{ selfId: string }[]>;
          };
        };
      }
    ).__canvas;
    return (await c.client.collection("swatches")).map((s) => s.selfId);
  });
}

/** Seed a NON-RESERVED document swatch.
 *
 *  The generated `geometry` fixture ships only the four reserved swatches
 *  ([None]/[Paper]/[Black]/[Registration]), which the panel pins: no
 *  rename, no edit, no delete affordance. Without this seed the CORE half
 *  of the capability assertions would have no row to be enabled ON —
 *  which is the shape of a green test that proves nothing. */
async function addSwatch(page: Page, name: string): Promise<void> {
  await page.evaluate(async (n) => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { mutate: (m: unknown) => Promise<unknown> } };
      }
    ).__canvas;
    await c.client.mutate({
      op: "createSwatch",
      args: {
        spec: { name: n, space: "CMYK", value: [0, 0, 0, 50], model: "Process" },
      },
    });
  }, name);
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

/** The single-selected element, via the worker. */
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

/** Import the fixture through the workbook panel's picker and lower a
 *  range to a page frame; resolves to the created frame's ref. */
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

/** Enter paged.sheet's `sheet` context by double-clicking the lowered
 *  frame, then RE-RAISE the Swatches tab.
 *
 *  Re-raising is what a user does, and it is here for the same reason
 *  the Layers spec records: entering a plugin context relayouts the
 *  right-hand dock, and dockview unmounts inactive tabs — so a shared
 *  panel can be off screen at the exact moment it retargets. */
async function enterSheetContext(page: Page, frame: ElementRef) {
  const at = await elementScreenCenter(page, frame);
  expect(at).not.toBeNull();
  await page.mouse.dblclick(at!.x, at!.y);
  await expect(page.locator("[data-edit-context-breadcrumb]")).toBeVisible({
    timeout: 10_000,
  });
  await openPanel(page, PANEL_ID);
  await expect(grid(page)).toBeVisible();
}

test.describe("E2E swatches-retarget (ADR 023 — the DOCUMENT-SCOPED axis)", () => {
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
    await page.keyboard.press("Home");
    await page.waitForTimeout(1200);
  });

  test("AC-SWATCH-RETARGET-1/2/3 — the SAME panel is answered by core, then by paged.sheet, then by core again", async ({
    page,
  }) => {
    // There is exactly ONE Swatches panel registered in the whole app —
    // host panels and every loaded bundle's, in one registry. Asserted
    // against the registry rather than the DOM, because "one panel" is a
    // statement about panel IDENTITY, not about how many nodes the dock
    // happens to mount.
    //
    // The filter is deliberately narrow. A loose /swatch/i also catches
    // `paged.schema-list-demo` ("Swatch List (schema)"), which is the
    // schema-widget-tier demo panel from phase B, not a second Swatches
    // panel — counting it would make this assertion measure the wrong
    // thing in both directions.
    const swatchPanels = await page.evaluate(() =>
      (
        globalThis as unknown as {
          __canvas: {
            registries: {
              panels: { list: () => { id: string; title: string }[] };
            };
          };
        }
      ).__canvas.registries.panels
        .list()
        .filter(
          (p) =>
            /(^|[.-])swatches$/i.test(p.id) ||
            p.title.trim().toLowerCase() === "swatches",
        )
        .map((p) => p.id),
    );
    expect(swatchPanels).toEqual([PANEL_ID]);

    const frame = await importAndLower(page, "A1:B4");

    // --- core answers -------------------------------------------------
    await openPanel(page, PANEL_ID);
    await expect(grid(page)).toBeVisible();
    await expect(grid(page)).toHaveAttribute("data-swatches-provider", "core");
    const coreRows = await renderedSwatchIds(page);
    const documentSwatches = await engineSwatchIds(page);
    expect(documentSwatches.length).toBeGreaterThan(0);
    expect([...coreRows].sort()).toEqual([...documentSwatches].sort());
    // The document does NOT already carry the workbook's chart colour —
    // otherwise "the two lists differ" could be true for the wrong
    // reason.
    expect(documentSwatches).not.toContain(CHART_SWATCH_ID);

    // --- paged.sheet answers ------------------------------------------
    await enterSheetContext(page, frame);
    await expect(grid(page)).toHaveAttribute(
      "data-swatches-provider",
      SHEET_PLUGIN,
      { timeout: 10_000 },
    );
    const sheetRows = await renderedSwatchIds(page);
    // DIFFERENT content — this is what makes the retarget falsifiable
    // rather than decorative. paged.sheet serves the WORKBOOK PALETTE,
    // not a second copy of the document's swatch list.
    expect(sheetRows).not.toEqual(coreRows);
    expect(sheetRows).toContain(CHART_SWATCH_ID);
    // …and the DOCUMENT's own swatch list did not move while the panel
    // showed somebody else's. A document resource is not a selection.
    expect(await engineSwatchIds(page)).toEqual(documentSwatches);

    // The registry agrees about who is active, and it is BORROWED from
    // the edit-context stack — no second notion of activation.
    const active = await page.evaluate(() =>
      (
        globalThis as unknown as {
          __bindingProviders: {
            active: () => { plugin: string; contextType: string }[];
          };
        }
      ).__bindingProviders.active(),
    );
    expect(active.map((a) => [a.plugin, a.contextType])).toEqual([
      [SHEET_PLUGIN, "sheet"],
    ]);

    // --- core answers again -------------------------------------------
    await page.keyboard.press("Escape");
    await expect(grid(page)).toHaveAttribute("data-swatches-provider", "core", {
      timeout: 10_000,
    });
    expect(await renderedSwatchIds(page)).toEqual(coreRows);
  });

  test("AC-SWATCH-CAP-1 — the OP-shaped capability gates follow the ACTIVE provider", async ({
    page,
  }) => {
    await addSwatch(page, "Editable");
    const frame = await importAndLower(page, "A1:B4");
    await openPanel(page, PANEL_ID);
    await expect(grid(page)).toBeVisible();
    await expect
      .poll(() => renderedSwatchIds(page).then((r) => r.length), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    // Over CORE every document-resource verb is live: core serves
    // createSwatch, deleteSwatch and importSwatchLibrary.
    await expect(grid(page)).toHaveAttribute("data-swatches-provider", "core");
    await expect(page.locator('[data-action="add-swatch"]')).toBeEnabled();
    await expect(page.locator('[data-action="open-libraries"]')).toBeEnabled();
    await expect(
      grid(page).locator('[data-action="remove-swatch"]').first(),
    ).toBeEnabled();
    await expect(
      grid(page).locator('[data-action="assign-group"]').first(),
    ).toBeEnabled();

    // Inside the sheet context the panel DISABLES them, because
    // paged.sheet declares only `editSwatch`. A workbook palette gains a
    // colour by USE, and a chart series colour cannot be deleted from a
    // colour panel — so the honest control is a disabled one, not a
    // write that would land on the DOCUMENT's list while the panel shows
    // the workbook's.
    //
    // This is the assertion Layers could not make: `layerName` is a
    // PropertyPath, so its gate is `provides.paths`. A swatch has no
    // path at all, so its gate has to be `provides.ops`.
    await enterSheetContext(page, frame);
    await expect(grid(page)).toHaveAttribute(
      "data-swatches-provider",
      SHEET_PLUGIN,
      { timeout: 10_000 },
    );
    await expect(page.locator('[data-action="add-swatch"]')).toBeDisabled();
    await expect(page.locator('[data-action="open-libraries"]')).toBeDisabled();
    await expect(
      grid(page).locator('[data-action="remove-swatch"]').first(),
    ).toBeDisabled();
    // Group-assign too, and it asks the owner of THESE ROWS rather than
    // of `colorGroups`: a group's members are swatch ids, so grouping a
    // palette colour the document does not carry would write a group
    // member that names nothing.
    await expect(
      grid(page).locator('[data-action="assign-group"]').first(),
    ).toBeDisabled();
    // …but the EDIT affordance stays live, because that op IS declared.
    await expect(
      grid(page).locator('[data-action="edit-swatch"]').first(),
    ).toBeEnabled();
  });

  test("AC-SWATCH-WRITE-1 — an edit through the panel MINTS the workbook colour as a document swatch", async ({
    page,
  }) => {
    const frame = await importAndLower(page, "A1:B4");
    await enterSheetContext(page, frame);
    await expect(grid(page)).toHaveAttribute(
      "data-swatches-provider",
      SHEET_PLUGIN,
      { timeout: 10_000 },
    );

    const before = await engineSwatchIds(page);
    expect(before).not.toContain(CHART_SWATCH_ID);

    // Rename the chart colour through the panel's own inline editor —
    // the panel emits `editSwatch`, core's own op, exactly as it would
    // over a document swatch. It never learns that paged.sheet claimed
    // it and turned it into a `createSwatch` in its own realm.
    const row = grid(page).locator(`[data-swatch-id="${CHART_SWATCH_ID}"]`);
    await expect(row).toHaveCount(1);
    // The honest gap made visible: `SwatchSummary` carries no colour and
    // the chip is resolved by a SEPARATE core RPC keyed on the swatch id,
    // which the binding-provider contract has no lane for. So a palette
    // entry the document has not minted yet says UNRESOLVED rather than
    // painting a plausible grey.
    await expect(row.locator('[data-action="edit-swatch"]')).toHaveAttribute(
      "data-swatch-preview",
      "unresolved",
    );
    await row.locator("[data-swatch-name]").dblclick();
    const input = row.locator("[data-swatch-rename-input]");
    await expect(input).toBeVisible();
    await input.fill("Brand blue");
    await input.press("Enter");

    // The ENGINE's own swatch collection gained the palette's id — at
    // the SAME deterministic id the chart lowering mints, which is why
    // the panel and the lowering can never disagree about a colour.
    await expect
      .poll(() => engineSwatchIds(page), { timeout: 10_000 })
      .toContain(CHART_SWATCH_ID);
    const after = await engineSwatchIds(page);
    // Exactly one swatch was added, and it is that one.
    expect(after.length).toBe(before.length + 1);

    // …and the chip now RESOLVES, because the id the panel was showing is
    // the id the mint used. That equality is the whole reason the palette
    // and the lowering share one implementation of the convention.
    await expect(
      row.locator('[data-action="edit-swatch"]'),
    ).not.toHaveAttribute("data-swatch-preview", "unresolved", {
      timeout: 10_000,
    });
  });
});
