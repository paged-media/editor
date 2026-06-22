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

// E2E op suite — page structure. Pages are structural: insert/delete
// change the page SET (so the same-dimensions pixel sandwich doesn't
// fit) and resize changes a page's dimensions. These bespoke tests
// prove the op via pageStructureChanged + the page-size vector, prove
// no collateral via a byte-identical control page, and prove undo
// restores the page set + the control render.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, snapshotPagePng } from "../fidelity/canvas-driver";
import { loadFixture, type LoadedFixture } from "./harness/fixtures";
import { mutate } from "./harness/ui";

interface MutReply {
  payload?: {
    pageIds?: string[];
    pageSizesPt?: [number, number][];
    pageStructureChanged?: boolean;
    createdId?: unknown;
  };
}

async function snap(
  page: Page,
  pageId: string,
  pageWidthPt: number,
  widthPx = 360,
): Promise<Buffer> {
  const dpi = (widthPx * 72) / pageWidthPt;
  return Buffer.from(await snapshotPagePng(page, pageId, widthPx, dpi));
}

async function undo(page: Page): Promise<MutReply> {
  return page.evaluate(async () => {
    return (await (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<MutReply> } };
      }
    ).__canvas.client.undo()) as MutReply;
  });
}

test.describe("E2E page ops", () => {
  let fx: LoadedFixture;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "text");
  });

  // ENGINE BUG (found 2026-06-05, FIXED in core 2026-06-06): the
  // body-story emit cache survived undo with absolute page indices
  // that a mid-set insert shifts — the splice then panicked
  // (`index out of bounds: the len is N but the index is N`,
  // paged-renderer pipeline) and `mutate()` never resolved. Core now
  // clears the caches on undo/redo, keys the body-story signature on
  // the chain's page indices, and bounds-guards the splice (engine
  // guard: paged-canvas tests/emit_cache_undo.rs). PAGE-1 keeps the
  // model assertion; AC-E2E-PAGE-4 owns the mid-set render
  // integration that used to panic.
  test("AC-E2E-PAGE-1 — insertPage grows the page set; undo restores the count (model) @feat:layout-model.spreads-pages @level:happy", async ({
    page,
  }) => {
    const reply = (await mutate(page, {
      op: "insertPage",
      args: { afterPageId: null, masterId: null },
    })) as MutReply;

    expect(reply.payload?.pageStructureChanged, "pageStructureChanged").toBe(
      true,
    );
    expect(reply.payload?.pageSizesPt?.length, "page count grew by one").toBe(
      fx.pageCount + 1,
    );
    // A new page id appears in the dirty set (one not present at load).
    const known = new Set(fx.pages.map((p) => p.pageId));
    const fresh = (reply.payload?.pageIds ?? []).find((id) => !known.has(id));
    expect(fresh, "a new page id appears in the dirty set").toBeTruthy();

    const undoReply = await undo(page);
    expect(
      undoReply.payload?.pageSizesPt?.length,
      "undo restored the original page count",
    ).toBe(fx.pageCount);
  });

  test("AC-E2E-PAGE-2 — deletePage shrinks the page set; undo restores it byte-identically @feat:layout-model.spreads-pages @level:happy", async ({
    page,
  }) => {
    const control = fx.pages[0];
    const victim = fx.pages[fx.pageCount - 1];
    const controlBaseline = await snap(page, control.pageId, control.widthPt);

    const reply = (await mutate(page, {
      op: "deletePage",
      args: { pageId: victim.pageId },
    })) as MutReply;

    expect(reply.payload?.pageStructureChanged, "pageStructureChanged").toBe(
      true,
    );
    expect(reply.payload?.pageSizesPt?.length, "page count shrank by one").toBe(
      fx.pageCount - 1,
    );

    await undo(page);
    expect(
      (await snap(page, control.pageId, control.widthPt)).equals(
        controlBaseline,
      ),
      "control page not restored after undo of deletePage",
    ).toBe(true);
  });

  test("AC-E2E-PAGE-4 — insertPage in the middle keeps the document renderable @feat:layout-model.spreads-pages @level:happy", async ({
    page,
  }) => {
    // The case that used to panic the worker: rasterise first (so a
    // pipeline + populated emit caches exist), then insert AFTER an
    // existing page so the trailing pages shift, then prove the
    // shifted trailing page still renders its content and undo
    // restores it byte-identically.
    const control = fx.pages[0];
    const trailing = fx.pages[fx.pageCount - 1];
    const controlBaseline = await snap(page, control.pageId, control.widthPt);
    const trailingBaseline = await snap(
      page,
      trailing.pageId,
      trailing.widthPt,
    );

    const reply = (await mutate(page, {
      op: "insertPage",
      args: { afterPageId: control.pageId, masterId: null },
    })) as MutReply;

    expect(reply.payload?.pageStructureChanged, "pageStructureChanged").toBe(
      true,
    );
    expect(reply.payload?.pageSizesPt?.length, "page count grew by one").toBe(
      fx.pageCount + 1,
    );

    // The shifted trailing page still renders its own content — a
    // stale cache splice would corrupt it (or panic the worker).
    expect(
      (await snap(page, trailing.pageId, trailing.widthPt)).equals(
        trailingBaseline,
      ),
      "trailing page content survived the index shift",
    ).toBe(true);

    const undoReply = await undo(page);
    expect(
      undoReply.payload?.pageSizesPt?.length,
      "undo restored the original page count",
    ).toBe(fx.pageCount);
    expect(
      (await snap(page, control.pageId, control.widthPt)).equals(
        controlBaseline,
      ),
      "control page restored byte-identically after undo",
    ).toBe(true);
    expect(
      (await snap(page, trailing.pageId, trailing.widthPt)).equals(
        trailingBaseline,
      ),
      "trailing page restored byte-identically after undo",
    ).toBe(true);
  });

  test("AC-E2E-PAGE-3 — resizePage changes a page's dimensions; undo restores them", async ({
    page,
  }) => {
    const target = fx.pages[0];
    const control = fx.pages[1];
    const controlBaseline = await snap(page, control.pageId, control.widthPt);
    const targetBaseline = await snap(page, target.pageId, target.widthPt);
    const newBounds: [number, number, number, number] = [
      0,
      0,
      target.heightPt + 80,
      target.widthPt + 120,
    ];

    const reply = (await mutate(page, {
      op: "resizePage",
      args: { pageId: target.pageId, bounds: newBounds },
    })) as MutReply;

    const sizes = reply.payload?.pageSizesPt;
    expect(sizes, "resize reply carries the page-size vector").toBeTruthy();
    // Page 0's width grew (within 1pt of the requested bounds width).
    expect(Math.abs(sizes![0][0] - (target.widthPt + 120))).toBeLessThanOrEqual(
      1,
    );
    // Resizing one page must not repaint another.
    expect(
      (await snap(page, control.pageId, control.widthPt)).equals(
        controlBaseline,
      ),
      "control page repainted by resizePage",
    ).toBe(true);

    // Undo returns the page to its load dimensions: the post-undo
    // snapshot recovers the original size, so it byte-matches the
    // baseline (a size-still-changed page would mismatch dimensions).
    await undo(page);
    expect(
      (await snap(page, target.pageId, target.widthPt)).equals(targetBaseline),
      "page size not restored byte-identically by undo of resizePage",
    ).toBe(true);
  });
});
