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

// Shared steps for the paged.sheet journeys, and the one reader they all
// assert with: `placedTables`, which reads what the lowering actually put
// in the DOCUMENT — the native tables in the exported IDML — rather than
// counting changed pixels. A pixel count says "something painted"; it
// cannot tell 13 from 31, a stale table from a refreshed one, or a bold
// cell from a plain one. The exported story says all three.

import { expect, type Page } from "@playwright/test";

import { openPanel } from "../../fidelity/canvas-driver";
import { readZipText, zipEntryNames } from "../../e2e/harness/read-zip";

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS = pathResolve(dirname(fileURLToPath(import.meta.url)), "../../e2e/harness");

/** sheet-02-formulas.xlsx — A1=2, B1="Sum", A2=3, B2="Product",
 *  A3=SUM(A1:A2) (5), B3=B1&B2 ("SumProduct"). */
export const FORMULAS_XLSX = pathResolve(HARNESS, "sheet-02-formulas.xlsx");
export const FORMULAS_A1_B3 = [
  ["2", "Sum"],
  ["3", "Product"],
  ["5", "SumProduct"],
];

export const WORKBOOK_PANEL = "media.paged.sheet.panel.workbook";
export const GRID_PANEL = "media.paged.sheet.panel.grid";
export const MOD = process.platform === "darwin" ? "Meta" : "Control";

export interface ElementRef {
  kind: string;
  id: string;
}

export type WorkbookFile =
  | string
  | { name: string; mimeType: string; buffer: Buffer };

interface CanvasHandle {
  __canvas: {
    client: {
      camera: { read: () => { scale: number; tx: number; ty: number } };
      elementGeometry: (ids: unknown[]) => Promise<
        Array<{
          bounds: [number, number, number, number];
          itemTransform?: [number, number, number, number, number, number] | null;
        }>
      >;
      executeScript: (s: string) => Promise<{ output: string[]; error: string | null }>;
      exportIdml: () => Promise<Uint8Array>;
      exportPaged: () => Promise<Uint8Array>;
    };
  };
}

export async function selectedElement(page: Page): Promise<ElementRef | null> {
  return page.evaluate(async () => {
    const c = (globalThis as unknown as CanvasHandle).__canvas;
    const r = await c.client.executeScript("paged.selection()");
    const ids = JSON.parse(r.output[0] ?? "[]") as ElementRef[];
    return ids.length === 1 ? ids[0] : null;
  });
}

/** Screen point at the centre of an element's transformed page bounds. */
export async function elementScreenCenter(
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
  expect(at, "the frame has on-screen geometry").not.toBeNull();
  return at!;
}

/** Load a workbook through the workbook panel's picker (the K-5 door). */
export async function importWorkbook(page: Page, file: WorkbookFile = FORMULAS_XLSX): Promise<void> {
  await openPanel(page, WORKBOOK_PANEL);
  const pick = page.locator("[data-sheet-pick]");
  await expect(pick).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await pick.click();
  await (await chooser).setFiles(file);
  await expect(page.locator("[data-sheet-range]")).toBeVisible({ timeout: 20_000 });
}

/** Set the panel's range and lower it to a new page frame; resolves to the
 *  frame the lowering selected. */
export async function lowerRange(page: Page, range: string): Promise<ElementRef> {
  await page.locator("[data-sheet-range]").fill(range);
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

export async function importAndLower(
  page: Page,
  range: string,
  file: WorkbookFile = FORMULAS_XLSX,
): Promise<ElementRef> {
  await importWorkbook(page, file);
  return lowerRange(page, range);
}

/** Double-click into the frame's sheet context, then click inside it so the
 *  keyboard focus is on the canvas and the grid has an active cell.
 *  `withGrid` also shows the grid panel (its cell badge and formula bar
 *  are the readable cursor). */
export async function enterSheet(
  page: Page,
  frame: ElementRef,
  opts: { withGrid?: boolean } = {},
): Promise<void> {
  const at = await elementScreenCenter(page, frame);
  await page.mouse.dblclick(at.x, at.y);
  await expect(page.locator("[data-edit-context-breadcrumb]")).toBeVisible({
    timeout: 10_000,
  });
  if (opts.withGrid) await openPanel(page, GRID_PANEL);
  // Entering raises the context's panels; the relayout moves the canvas.
  await page.waitForTimeout(600);
  const at2 = await elementScreenCenter(page, frame);
  await page.mouse.click(at2.x, at2.y);
  await page.waitForTimeout(300);
}

export async function exitSheet(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-edit-context-breadcrumb]")).toHaveCount(0);
}

/** One native table as the document holds it. `rows[r][c]` is the cell's
 *  text; `cellAttrs` and `charStyles` carry the raw IDML for style checks. */
export interface PlacedTable {
  storyFile: string;
  rows: string[][];
  cellAttrs: Map<string, string>;
  charStyles: Map<string, string[]>;
}

export interface PlacedDocument {
  tables: PlacedTable[];
  /** Resources/Styles.xml and Resources/Graphic.xml, for resolving the
   *  character styles and swatches a cell references. */
  styles: string;
  graphic: string;
}

const attr = (tag: string, name: string): string | null =>
  tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;

function xmlText(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Parse every native table out of an IDML package, in story order. */
export function parsePlacedTables(idml: Buffer): PlacedDocument {
  const tables: PlacedTable[] = [];
  for (const name of zipEntryNames(idml).filter((n) => n.startsWith("Stories/"))) {
    const story = readZipText(idml, name) ?? "";
    for (const t of story.matchAll(/<Table\b[^>]*>([\s\S]*?)<\/Table>/g)) {
      const rows: string[][] = [];
      const cellAttrs = new Map<string, string>();
      const charStyles = new Map<string, string[]>();
      for (const c of t[1].matchAll(/<Cell\b([^>]*)>([\s\S]*?)<\/Cell>/g)) {
        // IDML names a cell "column:row".
        const [col, row] = (attr(c[1], "Name") ?? "0:0").split(":").map(Number);
        const text = [...c[2].matchAll(/<Content>([\s\S]*?)<\/Content>/g)]
          .map((m) => xmlText(m[1]))
          .join("");
        (rows[row] ??= [])[col] = text;
        cellAttrs.set(`${row},${col}`, c[1]);
        charStyles.set(
          `${row},${col}`,
          [...c[2].matchAll(/<CharacterStyleRange\b([^>]*)>/g)]
            .map((m) => attr(m[1], "AppliedCharacterStyle"))
            .filter((s): s is string => !!s),
        );
      }
      tables.push({ storyFile: name, rows, cellAttrs, charStyles });
    }
  }
  return {
    tables,
    styles: readZipText(idml, "Resources/Styles.xml") ?? "",
    graphic: readZipText(idml, "Resources/Graphic.xml") ?? "",
  };
}

/** Export the open document as IDML (in the page) and parse its tables. */
export async function placedTables(page: Page): Promise<PlacedDocument> {
  const bytes = await page.evaluate(async () =>
    Array.from(await (globalThis as unknown as CanvasHandle).__canvas.client.exportIdml()),
  );
  return parsePlacedTables(Buffer.from(bytes));
}

/** The text grid of the only (or the first) placed table. */
export async function placedValues(page: Page): Promise<string[][]> {
  const doc = await placedTables(page);
  return doc.tables[0]?.rows ?? [];
}

/** Save the open document as a `.paged` container (File ▸ Save's bytes). */
export async function exportPaged(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () =>
    Array.from(await (globalThis as unknown as CanvasHandle).__canvas.client.exportPaged()),
  );
  return Buffer.from(bytes);
}

/** The swatch a cell is filled with, as "R G B" (or the raw value), or null. */
export function cellFill(doc: PlacedDocument, table: PlacedTable, row: number, col: number): string | null {
  const ref = attr(table.cellAttrs.get(`${row},${col}`) ?? "", "FillColor");
  if (!ref || ref === "Swatch/None") return null;
  const tag = doc.graphic.match(new RegExp(`<Color\\b[^>]*Self="${ref.replace(/[$/]/g, "\\$&")}"[^>]*>`))?.[0];
  return tag ? attr(tag, "ColorValue") : ref;
}

/** Whether a cell's text runs are set in a bold face (through the character
 *  style the lowering minted). */
export function cellIsBold(doc: PlacedDocument, table: PlacedTable, row: number, col: number): boolean {
  const styles = table.charStyles.get(`${row},${col}`) ?? [];
  return styles.some((s) => {
    const tag = doc.styles.match(
      new RegExp(`<CharacterStyle\\b[^>]*Self="${s.replace(/[$/[\]]/g, "\\$&")}"[^>]*>`),
    )?.[0];
    return /bold/i.test((tag && attr(tag, "FontStyle")) ?? "");
  });
}
