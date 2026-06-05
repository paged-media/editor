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

  // ENGINE BUG (found by this suite, 2026-06-05): once a render
  // pipeline exists (i.e. any page was rasterised), insertPage panics
  // the renderer during its post-mutation rebuild —
  // `index out of bounds: the len is N but the index is N` at
  // paged-renderer/src/pipeline/mod.rs:1890; the per-page pipeline
  // vector isn't grown on insert, so `mutate()` never resolves. The
  // capability matrix classifies insertPage "supported" because it
  // never snapshots first. PAGE-1 therefore asserts the MODEL effect
  // WITHOUT a snapshot (no pipeline → no panic); the render
  // integration is owned by AC-E2E-PAGE-4 (fixme) until core grows
  // the pipeline vector on page insert. deletePage/resizePage don't
  // grow the vector and render fine (PAGE-2 / PAGE-3).
  test("AC-E2E-PAGE-1 — insertPage grows the page set; undo restores the count (model)", async ({
    page,
  }) => {
    // afterPageId:null appends — the form the capability matrix proves
    // replies. Inserting in the MIDDLE (after a specific page) trips
    // the renderer pipeline-grow panic (AC-E2E-PAGE-4) because the
    // rebuild has to re-render a shifted trailing page past the stale
    // vector length.
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

  test("AC-E2E-PAGE-2 — deletePage shrinks the page set; undo restores it byte-identically", async ({
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

  // ENGINE BUG (found by this suite, 2026-06-05): inserting a page in
  // the MIDDLE of the set (afterPageId = an existing page) panics the
  // renderer once a pipeline exists — `index out of bounds: the len
  // is N but the index is N` at paged-renderer/src/pipeline/mod.rs:1890.
  // The rebuild re-renders the shifted trailing page past the stale
  // per-page pipeline vector, which isn't grown on insert; mutate()
  // then never resolves. Appending (afterPageId:null, PAGE-1) is fine.
  // fixme (not a live trigger — the panic poisons the worker AND hangs
  // the call); promote to a render sandwich once core grows the vector.
  test.fixme("AC-E2E-PAGE-4 — insertPage in the middle keeps the document renderable", async () => {});

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
