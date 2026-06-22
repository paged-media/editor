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

// E2E — Save As IDML (W3.B2-editor).
//
// `client.exportIdml()` serialises the loaded document back to an
// `.idml` package (the worker re-emits the parsed designmap + stories
// + resources as a ZIP). This spec asserts the bytes are a real IDML
// package (non-empty + the `PK` zip magic) and ROUND-TRIPS them:
// re-loading the exported bytes through `loadDocument` yields the same
// document stats (page count + page sizes) as the original — proof the
// export is a faithful, re-parseable package, not just plausible bytes.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { loadFixture } from "./harness/fixtures";

interface DocStats {
  pageCount: number;
  pageSizesPt: [number, number][];
}

/** Export the loaded doc to IDML bytes via `client.exportIdml()`. */
async function exportIdmlBytes(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { exportIdml: () => Promise<Uint8Array> } };
      }
    ).__canvas;
    const bytes = await c.client.exportIdml();
    return Array.from(bytes);
  });
}

/** Re-load the given IDML bytes through `loadDocument`; return the
 *  resulting doc stats (page count + sizes). */
async function loadBytesStats(page: Page, bytes: number[]): Promise<DocStats> {
  return page.evaluate(async (b) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            loadDocument: (
              bytes: Uint8Array,
            ) => Promise<{ pageCount: number; pageSizesPt: [number, number][] }>;
          };
        };
      }
    ).__canvas;
    const handle = await c.client.loadDocument(new Uint8Array(b));
    return {
      pageCount: handle.pageCount,
      pageSizesPt: handle.pageSizesPt,
    };
  }, bytes);
}

test.describe("W3.B2 — Save As IDML", () => {
  test("AC-IDML-EXPORT: exportIdml returns a non-empty PK-zip package @feat:round-tripping.idml-reserialization @level:edge", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    await loadFixture(page, "tables");

    const bytes = await exportIdmlBytes(page);
    expect(bytes.length, "exported IDML bytes are non-empty").toBeGreaterThan(0);
    // ZIP local-file-header magic: 0x50 0x4B 0x03 0x04 ("PK\x03\x04").
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });

  test("AC-IDML-ROUNDTRIP: re-loading the exported bytes yields the same doc stats @feat:round-tripping.idml-reserialization @level:happy", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadFixture(page, "tables");
    const before: DocStats = {
      pageCount: fx.pageCount,
      pageSizesPt: fx.pages.map((p) => [p.widthPt, p.heightPt]),
    };

    const bytes = await exportIdmlBytes(page);
    const after = await loadBytesStats(page, bytes);

    // Round-trip: the re-parsed package matches the original's page
    // count + per-page dimensions.
    expect(after.pageCount).toBe(before.pageCount);
    expect(after.pageSizesPt.length).toBe(before.pageSizesPt.length);
    for (let i = 0; i < before.pageSizesPt.length; i++) {
      expect(after.pageSizesPt[i][0]).toBeCloseTo(before.pageSizesPt[i][0], 1);
      expect(after.pageSizesPt[i][1]).toBeCloseTo(before.pageSizesPt[i][1], 1);
    }
  });
});
