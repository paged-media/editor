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

// Journey: paged.draw SVG interchange — IMPORT (.svg → inserted paths)
// and EXPORT (selection → SVG bytes), the K-2 round-trip.
//
// The bundle registers an `.svg` importer (parse the document → lower
// each shape through the same insertPath lane the pen/pencil use) and an
// `.svg` exporter (read the selection's geometry + style → serialize an
// <svg>). This journey drives BOTH through the real host registries:
//   · IMPORT — synthesize a small SVG (two filled rects) in the page
//     context and route its bytes through `registries.importers.resolve`
//     (the File ▸ Open / drag-drop path), then assert NEW path elements
//     appeared AND the imported vector renders onto the page.
//   · EXPORT — select an imported shape and pull `registries.exporters`'
//     `export()`, asserting it produces a non-empty `<svg>` document.
//
// A negative control proves the render oracle before the import.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

const SVG_IMPORTER = "media.paged.draw.importer.svg";
const SVG_EXPORTER = "media.paged.draw.exporter.svg";

/** Route SVG bytes through the host importer registry (the File ▸ Open /
 *  drag-drop path) → the paged.draw bundle's importSvg. Returns the
 *  resolved importer id, or a reason string. */
async function importSvg(
  page: import("@playwright/test").Page,
  svg: string,
  name = "drawing.svg",
): Promise<string> {
  return page.evaluate(
    async ({ svg, name }) => {
      const bytes = new TextEncoder().encode(svg);
      const reg = (
        globalThis as unknown as {
          __canvas: {
            registries: {
              importers?: {
                resolve: (
                  fileName: string,
                  mimeType?: string,
                ) => {
                  id?: string;
                  import: (args: {
                    name: string;
                    bytes: Uint8Array;
                    mimeType?: string;
                  }) => void | Promise<void>;
                } | null;
              };
            };
          };
        }
      ).__canvas.registries.importers;
      if (!reg) return "host serves no importer registry";
      const imp = reg.resolve(name, "image/svg+xml");
      if (!imp) return "no importer resolved for .svg";
      await imp.import({ name, bytes, mimeType: "image/svg+xml" });
      return imp.id ?? "imported";
    },
    { svg, name },
  );
}

/** Pull the SVG exporter through the host exporter registry (the Export
 *  Center path). Returns the produced bytes' length + a sniff of the
 *  serialized text, or a reason. */
async function exportSvg(
  page: import("@playwright/test").Page,
): Promise<{ id: string; byteLength: number; text: string } | { reason: string }> {
  return page.evaluate(async (exporterId) => {
    const reg = (
      globalThis as unknown as {
        __canvas: {
          registries: {
            exporters?: {
              list: () => Array<{
                id: string;
                export: () => Promise<{ bytes: Uint8Array; fileName: string } | null>
                  | { bytes: Uint8Array; fileName: string }
                  | null;
              }>;
            };
          };
        };
      }
    ).__canvas.registries.exporters;
    if (!reg) return { reason: "host serves no exporter registry" };
    const exp = reg.list().find((e) => e.id === exporterId);
    if (!exp) return { reason: `exporter ${exporterId} not registered` };
    const result = await exp.export();
    if (!result) return { reason: "exporter returned null (empty selection?)" };
    return {
      id: exporterId,
      byteLength: result.bytes.length,
      text: new TextDecoder().decode(result.bytes),
    };
  }, SVG_EXPORTER);
}

test.describe("journey · paged.draw SVG interchange", () => {
  test("a designer imports an SVG then exports a selected shape back to SVG @feat:plugin-draw.svg-io @feat:plugin-platform.bundle-lifecycle @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. NEGATIVE CONTROL. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    const before = await designer.renderBytes();
    const polysBefore = await designer.count("polygon");

    // ── 1. IMPORT — a small SVG with two filled rectangles. The importer
    //    lowers each shape to a path through the insertPath lane. ──
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect x="40" y="40" width="160" height="120" fill="#1830ff"/>
  <rect x="180" y="120" width="160" height="120" fill="#ff3018"/>
</svg>`;
    const importerId = await importSvg(page, svg);
    expect(importerId, "the SVG importer resolved + ran").toBe(SVG_IMPORTER);

    // New path elements appeared (one per imported shape).
    await expect
      .poll(() => designer.count("polygon"), { timeout: 8_000 })
      .toBeGreaterThan(polysBefore);

    // ── 2. The imported vector RENDERS onto the page (filled shapes). ──
    const after = await designer.renderBytes();
    await designer.expectRenderChanged(before, after);

    // ── 3. EXPORT — select an imported path and pull the SVG exporter;
    //    it serializes a non-empty <svg> document. ──
    const polys = await page.evaluate(async () => {
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
      const r = await c.client.executeScript("paged.tree()");
      const tree = JSON.parse(r.output[0] ?? "[]") as Array<{
        id?: { kind: string; id: string } | null;
        children?: unknown[];
      }>;
      const out: Array<{ kind: string; id: string }> = [];
      const visit = (node: { id?: { kind: string; id: string } | null; children?: unknown[] }) => {
        if (node.id && node.id.kind === "polygon") out.push(node.id);
        for (const ch of (node.children ?? []) as typeof tree) visit(ch);
      };
      for (const root of tree) visit(root);
      return out;
    });
    expect(polys.length, "have at least one imported path to export").toBeGreaterThan(0);
    await designer.selectElement("polygon", polys[0].id);

    const exported = await exportSvg(page);
    expect(exported, `SVG export: ${JSON.stringify(exported)}`).not.toHaveProperty(
      "reason",
    );
    if ("byteLength" in exported) {
      expect(exported.byteLength, "the exporter produced bytes").toBeGreaterThan(0);
      expect(exported.text, "the export is an <svg> document").toContain("<svg");
    }
  });
});
