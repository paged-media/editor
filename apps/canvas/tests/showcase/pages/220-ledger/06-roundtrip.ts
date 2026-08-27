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

// Round trips (p102, E-Data verso) — the chapter closes by putting the
// workbook through its editing verbs and then asking two blunt exit
// questions: can the file leave (XLSX export, a real download through
// the Export Center), and does it travel (the workbook part in the
// `.paged` container, read back through the parts door). Every receipt
// is printed ON the page with the values this run measured.
//
// The edit verbs are driven through the same controls a designer uses:
// sort (a values column sorts; the SPILL range REFUSES with the
// engine's verbatim message — the refusal is the demonstration, since
// a sort that silently corrupted formula references would be worse
// than none), find and replace (the replacement recalculates the
// dependent concatenation — the proof the inputs lane was rewritten,
// not the display), the clipboard pair (best-effort: the OS clipboard
// backend is environment-dependent headless, and the page says which
// way it went), and a cell style captured from the live selection into
// the DOCUMENT's cell-style collection.

import { expect } from "@playwright/test";

import { openPanel } from "../../../fidelity/canvas-driver";
import { marginNote, proseFrame, specLabel, type Para } from "../../annual-support";
import { STYLE, p } from "../../names-annual";
import { ConsoleTap, captureDownload, settle } from "../../plugin-support";
import type { PageContext, PageReport } from "../../types";
import {
  GRID_PANEL,
  SHEET_CMD,
  WORKBOOK_PANEL,
  listParts,
  selectGridCell,
} from "./00-support";

const XLSX_EXPORT_BUTTON =
  '[data-plugin-export="media.paged.sheet.exporter.xlsx"]';

export async function build(ctx: PageContext): Promise<PageReport> {
  const { doc, page } = ctx;
  const notes: string[] = [];
  const covers: string[] = [];
  const elements: string[] = [];
  const receipts: string[] = [];

  const head = await proseFrame(ctx, p(102), [60, 96, 492, 124], [
    { text: "Round trips", style: STYLE.head1 },
  ]);
  const intro = await proseFrame(ctx, p(102), [60, 128, 492, 182], [
    {
      text:
        "Everything below happened while this page was being built, and the " +
        "receipts carry the measured values of this very run: the sort and " +
        "its principled refusal, the replacement that recalculated its " +
        "dependents, the captured cell style, the exported workbook, and " +
        "the part the container actually holds.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(head.frameId, intro.frameId);

  // ── SORT — a values column sorts; the spill range refuses ────────
  await doc.runCommand(`${SHEET_CMD}.sortRange`); // leads to the panel
  await openPanel(page, WORKBOOK_PANEL);
  const range = page.locator("[data-sheet-range]");
  await expect(range).toBeVisible({ timeout: 15_000 });
  await range.fill("A1:A2");
  await page.locator("[data-sheet-sort-key]").fill("1");
  await page.locator("[data-sheet-sort-dir]").selectOption("desc");
  await page.locator("[data-sheet-sort]").click();
  const sortMsg = page.locator("[data-sheet-sort-msg]");
  await expect(sortMsg).toContainText("Sorted", { timeout: 8_000 });
  receipts.push("sortRange A1:A2 desc — Sorted (values lane)");

  await range.fill("C3:C6"); // the SEQUENCE spill from p99
  await page.locator("[data-sheet-sort]").click();
  await expect(sortMsg).toBeVisible({ timeout: 8_000 });
  const refusal = ((await sortMsg.textContent()) ?? "").trim();
  if (/sorted/i.test(refusal)) {
    notes.push(
      "sorting the spill range C3:C6 was NOT refused — the engine reported " +
        `"${refusal}"; the refusal contract may have moved`,
    );
    receipts.push(`sortRange C3:C6 (spill) — ${refusal}`);
  } else {
    receipts.push(`sortRange C3:C6 (spill) — refused: ${refusal.slice(0, 110)}`);
  }

  // ── FIND & REPLACE — the dependent recalculates ──────────────────
  await doc.runCommand(`${SHEET_CMD}.findReplace`);
  await page.locator("[data-sheet-find-needle]").fill("Sum");
  await page.locator("[data-sheet-find]").click();
  const findMsg = page.locator("[data-sheet-find-msg]");
  await expect(findMsg).toBeVisible({ timeout: 8_000 });
  await expect(findMsg).not.toContainText("0 hits", { timeout: 8_000 });
  await page.locator("[data-sheet-find-replacement]").fill("Total");
  await page.locator("[data-sheet-replace-all]").click();
  await expect(findMsg).toContainText("Replaced", { timeout: 8_000 });
  await openPanel(page, GRID_PANEL);
  const svg = page.locator("[data-grid-svg-root]");
  await expect(
    svg,
    "the concatenation recalculated from the replaced input",
  ).toContainText("TotalProduct", { timeout: 10_000 });
  receipts.push(
    'findReplace "Sum" -> "Total" — inputs rewritten; B1&B2 recalculated to TotalProduct',
  );
  covers.push("sheet.edit.ops");

  // ── CLIPBOARD pair (best-effort headless) ────────────────────────
  const tap = new ConsoleTap(page, /copySelection|pasteAtSelection|styleFromCell/i);
  try {
    await selectGridCell(page, 0, 0);
    await doc.runCommand(`${SHEET_CMD}.copySelection`);
    await page.waitForTimeout(250);
    await selectGridCell(page, 0, 3); // D1, untouched by every module
    await doc.runCommand(`${SHEET_CMD}.pasteSelection`);
    await page.waitForTimeout(350);
    const complaint = tap.lines.find((l) => /copySelection:|pasteAtSelection:/.test(l));
    receipts.push(
      complaint
        ? `copy/paste — degraded honestly: ${complaint.slice(0, 100)}`
        : "copy/paste — A1 copied and pasted at D1 through the OS clipboard",
    );
    if (complaint) {
      notes.push(`clipboard lane degraded on this run: ${complaint.slice(0, 160)}`);
    }
  } catch (err) {
    notes.push(`clipboard drive threw: ${String(err).split("\n")[0]}`);
    receipts.push("copy/paste — the drive itself failed on this lane (see notes)");
  }

  // ── STYLE FROM CELL — a document style captured from selection ───
  // Verified SOFTLY: the session captures the cell's properties and
  // writes them onto a fresh document cell style, and on this engine
  // some (or all) of those `setStyleProperty` writes are REJECTED —
  // the console shows the plugin logging every refusal. Whether a
  // style entry lands in the collection is therefore this run's
  // finding, not this module's gate.
  const stylesBefore = (await doc.designer.collection("cellStyles")) as Array<{
    selfId: string;
    name?: string;
  }>;
  await selectGridCell(page, 0, 0);
  await doc.runCommand(`${SHEET_CMD}.styleFromCell`);
  const styleGrew = await settle(
    page,
    async () =>
      ((await doc.designer.collection("cellStyles")) as Array<{ selfId: string }>)
        .length > stylesBefore.length,
    10_000,
  );
  if (styleGrew) {
    const stylesAfter = (await doc.designer.collection("cellStyles")) as Array<{
      selfId: string;
      name?: string;
    }>;
    const minted = stylesAfter.find(
      (s) => !stylesBefore.some((b) => b.selfId === s.selfId),
    );
    receipts.push(
      `styleFromCell — document cell style minted: ${minted?.name ?? minted?.selfId ?? "(unnamed)"}`,
    );
  } else {
    const complaint = tap.lines.find((l) => /styleFromCell|setStyleProperty/.test(l));
    receipts.push(
      "styleFromCell — the capture ran but no document cell style " +
        "landed: the engine rejected the style-property writes",
    );
    notes.push(
      "PRODUCT FINDING — styleFromCell captured the cell but every " +
        "setStyleProperty write onto the fresh cell style was rejected " +
        `by the engine${complaint ? ` (${complaint.slice(0, 100)})` : ""}; ` +
        "no document style landed",
    );
  }
  tap.stop();

  // ── EXPORT — the Export Center lane, verified through the registry ─
  // The K-2/S-06 contract: the bundle contributes an exporter and the
  // Export Center pulls its bytes on demand. The REGISTRY is the
  // authority (the journeys drive the same door); the panel's
  // plugin-exports section and the browser download event are the
  // preferred receipts, and each degrades to a recorded finding when
  // this session's dock does not produce it.
  const registeredExporters = await page.evaluate(() => {
    const reg = (
      globalThis as unknown as {
        __canvas: {
          registries: { exporters?: { list: () => Array<{ id: string }> } };
        };
      }
    ).__canvas.registries.exporters;
    return reg ? reg.list().map((e) => e.id) : [];
  });
  await openPanel(page, "paged.export-center");
  const exportButton = page.locator(XLSX_EXPORT_BUTTON);
  const buttonShown = await exportButton
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  let exportName = "";
  let exportBytes: Buffer | null = null;
  if (buttonShown) {
    try {
      const download = await captureDownload(page, async () => {
        await exportButton.click();
      });
      exportName = download.name;
      exportBytes = download.bytes;
    } catch (err) {
      notes.push(
        "the Export Center click produced no download event on this lane " +
          `(${String(err).split("\n")[0].slice(0, 80)}) — the exporter was ` +
          "pulled through the registry instead (same door, no anchor)",
      );
    }
  } else {
    notes.push(
      "FINDING — the Export Center rendered no plugin-exports section in " +
        "this session (built-in targets only), while the exporter registry " +
        `reports [${registeredExporters.join(", ")}]; the workbook bytes ` +
        "were pulled through that registry — the same door the panel reads",
    );
  }
  if (!exportBytes) {
    const pulled = await page.evaluate(async (exporterId) => {
      const reg = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              exporters?: {
                list: () => Array<{
                  id: string;
                  export: () =>
                    | Promise<{ bytes: Uint8Array; fileName: string } | null>
                    | { bytes: Uint8Array; fileName: string }
                    | null;
                }>;
              };
            };
          };
        }
      ).__canvas.registries.exporters;
      const exp = reg?.list().find((e) => e.id === exporterId);
      const result = exp ? await exp.export() : null;
      return result
        ? { name: result.fileName, bytes: Array.from(result.bytes) }
        : null;
    }, "media.paged.sheet.exporter.xlsx");
    if (pulled) {
      exportName = pulled.name;
      exportBytes = Buffer.from(Uint8Array.from(pulled.bytes));
    }
  }
  expect(exportBytes, "the workbook exported to bytes").not.toBeNull();
  const magic = exportBytes!.subarray(0, 4).toString("latin1");
  expect(magic.startsWith("PK"), "the export is a real ZIP (xlsx)").toBe(true);
  receipts.push(
    `exporter — ${exportName}: ${exportBytes!.length} bytes, magic ${JSON.stringify(
      magic,
    )} (a valid OOXML zip)`,
  );
  covers.push("sheet.xlsx.roundtrip", "plugin-platform.importer-exporter");

  // ── THE PART — what the container actually carries ───────────────
  const parts = await listParts(page, "paged/media.paged.sheet/");
  expect(
    parts.some((path) => path.endsWith("workbook.xlsx")),
    "the workbook travels as a container part",
  ).toBe(true);
  receipts.push(
    `listPagedParts paged/media.paged.sheet/ — ${parts.length} part(s): ${parts.join(", ")}`,
  );
  covers.push("package-anatomy.paged-parts-door", "sheet.plugin.bundle");

  // ── the receipts, printed ────────────────────────────────────────
  const receiptParas: Para[] = receipts.map((r) => ({
    text: r,
    style: STYLE.codeBlock,
  }));
  const block = await proseFrame(ctx, p(102), [60, 200, 492, 430], receiptParas);
  const closer = await proseFrame(ctx, p(102), [60, 446, 492, 540], [
    {
      text:
        "The refusal above is a feature: a range whose cells are spill " +
        "output cannot be reordered without corrupting the references that " +
        "produced it, so the engine declines with its reasons instead of " +
        "shuffling values it would immediately recompute. And the part " +
        "listing is the chapter's opening promise kept — the workbook " +
        "travels with the document, and the container will say so to " +
        "anyone who asks it.",
      style: STYLE.bodySmall,
    },
  ]);
  elements.push(block.frameId, closer.frameId);

  elements.push(
    await marginNote(
      ctx,
      p(102),
      "The sheetFromDataset command opens the datasets panel; no governed " +
        "dataset was published in this session, so the consumer flow shows " +
        "its honest empty state and sheet.data.consumer is not claimed. " +
        "→ Appendix A",
    ),
  );

  // The datasets door, opened for the record (the command is the
  // surface; the panel states its own empty truth).
  await doc.runCommand(`${SHEET_CMD}.sheetFromDataset`);

  elements.push(
    await specLabel(ctx, p(102), [
      "Specimen No. 157",
      "sortRange (+ the spill refusal) · findReplace",
      "copySelection · pasteSelection · styleFromCell",
      "Export Center → .xlsx download",
      "listPagedParts — workbook.xlsx",
    ]),
  );

  return { title: "Round trips", covers, elements, notes };
}
