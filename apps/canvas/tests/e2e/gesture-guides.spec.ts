// E2E gesture suite — guide creation / drag (gestures.md GD-01…03).
//
// W2.8 implements the InDesign ruler-guide gesture: drag a guide out
// of a ruler (GD-01), reposition a placed guide or drag it back onto
// a ruler to delete it (GD-02), and Escape mid-drag to cancel (GD-03).
// The wiring under test:
//
//   ruler strip pointer-down (data-h-ruler / data-v-ruler)
//     → GuideDragController (window pointer tracking, camera invert)
//     → ONE insertGuide / moveGuide / deleteGuide Mutation on release
//     → optimistic guide overlay (data-guide-overlay / -preview lines)
//
// READ SURFACE (W3.A2 — gap closed). The engine ops are capability-
// verified supported (capabilities.ts: insertGuide/moveGuide/
// deleteGuide, protocol v28), and capability-matrix.spec.ts proves each
// applies + undoes at the channel level. As of W3.A2 the engine ALSO
// surfaces a live, id-keyed READ of guides: `collection("spreads")`
// carries each spread's `<Guide>` set (`SpreadSummary.guides`),
// refreshed on every request. The GuideDragController re-queries that
// collection on load and on every Operation push (mutationApplied /
// undoApplied / redoApplied) to rebuild its overlay mirror from engine
// truth. These specs assert the GESTURE through the rendered overlay
// lines (the optimistic line appears after `mutationApplied`, so a
// visible line is proof the mutation landed) AND — for the two legs
// below — through the live spreads collection (engine truth) + the
// undo-driven overlay re-sync the collection re-query now enables.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { loadViaReactPath, screenPoint } from "./harness/viewport";

/** Count rendered guide overlay lines (the optimistic mirror's
 *  paint). `data-guide-overlay` tags the visible placed-guide line;
 *  the wider transparent `data-guide-hit` sibling is excluded. */
async function guideLineCount(
  page: Page,
  orientation?: "horizontal" | "vertical",
): Promise<number> {
  const sel = orientation
    ? `[data-guide-overlay="${orientation}"]`
    : "[data-guide-overlay]";
  return page.locator(sel).count();
}

/** Count the live drag preview lines (0 when idle, 1 mid-drag over a
 *  page). */
async function previewCount(page: Page): Promise<number> {
  return page.locator("[data-guide-preview]").count();
}

/** Total live guide count across all spreads, read from the engine via
 *  `collection("spreads")` (`SpreadSummary.guides`) — engine truth,
 *  independent of the overlay mirror. */
async function engineGuideCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (
              n: string,
            ) => Promise<Array<{ guides?: unknown[] }>>;
          };
        };
      }
    ).__canvas;
    const spreads = await c.client.collection("spreads");
    return spreads.reduce((n, s) => n + (s.guides?.length ?? 0), 0);
  });
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas;
    await c.client.undo();
  });
}

/** Bounding-box centre of a ruler strip, in client px. */
async function rulerPoint(
  page: Page,
  which: "h" | "v",
): Promise<{ x: number; y: number }> {
  const box = await page
    .locator(which === "h" ? "[data-h-ruler]" : "[data-v-ruler]")
    .boundingBox();
  if (!box) throw new Error(`ruler ${which} not found`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("gestures.md GD-01 — drag a guide out of a ruler", () => {
  test("AC-GD-01-H: horizontal guide from the top ruler follows the cursor and places on release", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    const before = await guideLineCount(page, "horizontal");

    // Drop point: 40% down page 0, in the page body.
    const drop = await screenPoint(page, p0.widthPt * 0.5, p0.heightPt * 0.4);
    const ruler = await rulerPoint(page, "h");

    // Pointer-down on the ruler starts the create drag; move into the
    // page → a preview line tracks the cursor; release → insertGuide.
    await page.mouse.move(ruler.x, ruler.y);
    await page.mouse.down();
    // Intermediate move so the controller publishes a preview.
    await page.mouse.move((ruler.x + drop.x) / 2, (ruler.y + drop.y) / 2, {
      steps: 4,
    });
    await page.mouse.move(drop.x, drop.y, { steps: 6 });
    // GD-01: the preview line follows the cursor over the page.
    await expect.poll(() => previewCount(page)).toBe(1);
    await page.mouse.up();

    // Release placed exactly one horizontal guide (the optimistic line
    // appears only after the insertGuide's mutationApplied).
    await expect
      .poll(() => guideLineCount(page, "horizontal"), { timeout: 5_000 })
      .toBe(before + 1);
    // Preview cleared after release.
    expect(await previewCount(page)).toBe(0);
  });

  test("AC-GD-01-V: vertical guide from the left ruler", async ({ page }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    const before = await guideLineCount(page, "vertical");
    const drop = await screenPoint(page, p0.widthPt * 0.3, p0.heightPt * 0.5);
    const ruler = await rulerPoint(page, "v");

    await page.mouse.move(ruler.x, ruler.y);
    await page.mouse.down();
    await page.mouse.move(drop.x, drop.y, { steps: 8 });
    await expect.poll(() => previewCount(page)).toBe(1);
    await page.mouse.up();

    await expect
      .poll(() => guideLineCount(page, "vertical"), { timeout: 5_000 })
      .toBe(before + 1);
  });

  test("AC-GD-01-CANCEL: releasing back over the ruler places nothing", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    const before = await guideLineCount(page, "horizontal");
    const overPage = await screenPoint(page, p0.widthPt * 0.5, p0.heightPt * 0.4);
    const ruler = await rulerPoint(page, "h");

    await page.mouse.move(ruler.x, ruler.y);
    await page.mouse.down();
    // Drag onto the page (preview shows) …
    await page.mouse.move(overPage.x, overPage.y, { steps: 6 });
    await expect.poll(() => previewCount(page)).toBe(1);
    // … then back onto the ruler and release → cancel (no insert).
    await page.mouse.move(ruler.x, ruler.y, { steps: 6 });
    await page.mouse.up();

    // No new guide, and the preview is gone.
    await expect.poll(() => previewCount(page)).toBe(0);
    expect(await guideLineCount(page, "horizontal")).toBe(before);
  });
});

test.describe("gestures.md GD-02 — reposition / delete a placed guide", () => {
  test("AC-GD-02-MOVE: dragging a placed guide repositions it (one guide, new position)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    // Create a horizontal guide at 30% down the page.
    const ruler = await rulerPoint(page, "h");
    const place = await screenPoint(page, p0.widthPt * 0.5, p0.heightPt * 0.3);
    await page.mouse.move(ruler.x, ruler.y);
    await page.mouse.down();
    await page.mouse.move(place.x, place.y, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(() => guideLineCount(page, "horizontal"), { timeout: 5_000 })
      .toBe(1);

    // Grab it on its hit line and drag down to 60%.
    const grab = await screenPoint(page, p0.widthPt * 0.5, p0.heightPt * 0.3);
    const target = await screenPoint(page, p0.widthPt * 0.5, p0.heightPt * 0.6);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await expect.poll(() => previewCount(page)).toBe(1);
    await page.mouse.up();

    // Still exactly one guide (a move, not a second create); the line
    // now sits at the new y. The overlay SVG is camera-transformed, so
    // the line's `y1` attribute is in document-space pt; page 0 sits at
    // the document origin, so doc-y == page-local y. The drag targeted
    // 60% down the page (snapped to whole pt on release).
    await expect.poll(() => previewCount(page)).toBe(0);
    expect(await guideLineCount(page, "horizontal")).toBe(1);
    // POLL the placed line's y — the optimistic mirror repositions only
    // after the moveGuide `mutationApplied` lands (a round-trip to the
    // worker), which can arrive a frame or two after the preview clears.
    // Reading `y1` once races that update and samples the pre-move value.
    const want = Math.round(p0.heightPt * 0.6);
    await expect
      .poll(
        async () =>
          Number(
            await page
              .locator('[data-guide-overlay="horizontal"]')
              .first()
              .getAttribute("y1"),
          ),
        { timeout: 5_000 },
      )
      .toBeCloseTo(want, 0);
  });

  test("AC-GD-02-DELETE: dragging a placed guide back onto a ruler deletes it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    // Create a vertical guide.
    const vruler = await rulerPoint(page, "v");
    const place = await screenPoint(page, p0.widthPt * 0.4, p0.heightPt * 0.5);
    await page.mouse.move(vruler.x, vruler.y);
    await page.mouse.down();
    await page.mouse.move(place.x, place.y, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(() => guideLineCount(page, "vertical"), { timeout: 5_000 })
      .toBe(1);

    // Grab it and drag back onto the left ruler → deleteGuide.
    await page.mouse.move(place.x, place.y);
    await page.mouse.down();
    await page.mouse.move(vruler.x, vruler.y, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(() => guideLineCount(page, "vertical"), { timeout: 5_000 })
      .toBe(0);
  });
});

test.describe("gestures.md GD-03 — Escape mid-drag", () => {
  test("AC-GD-03-CREATE: Escape during a create cancels (no guide placed)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    const before = await guideLineCount(page);
    const ruler = await rulerPoint(page, "h");
    const overPage = await screenPoint(page, p0.widthPt * 0.5, p0.heightPt * 0.5);

    await page.mouse.move(ruler.x, ruler.y);
    await page.mouse.down();
    await page.mouse.move(overPage.x, overPage.y, { steps: 6 });
    await expect.poll(() => previewCount(page)).toBe(1);
    // Escape cancels the in-flight create.
    await page.keyboard.press("Escape");
    await expect.poll(() => previewCount(page)).toBe(0);
    // Release the (now inert) pointer; still no guide.
    await page.mouse.up();
    expect(await guideLineCount(page)).toBe(before);
  });

  test("AC-GD-03-MOVE: Escape during a move restores the original position", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    // Place a horizontal guide at 30%.
    const ruler = await rulerPoint(page, "h");
    const place = await screenPoint(page, p0.widthPt * 0.5, p0.heightPt * 0.3);
    await page.mouse.move(ruler.x, ruler.y);
    await page.mouse.down();
    await page.mouse.move(place.x, place.y, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(() => guideLineCount(page, "horizontal"), { timeout: 5_000 })
      .toBe(1);
    const originalY = Number(
      await page
        .locator('[data-guide-overlay="horizontal"]')
        .first()
        .getAttribute("y1"),
    );

    // Begin a move, drag away, then Escape → the original line is back
    // at its starting y (the controller never mutated, so the mirror
    // entry is untouched).
    const away = await screenPoint(page, p0.widthPt * 0.5, p0.heightPt * 0.7);
    await page.mouse.move(place.x, place.y);
    await page.mouse.down();
    await page.mouse.move(away.x, away.y, { steps: 8 });
    await expect.poll(() => previewCount(page)).toBe(1);
    await page.keyboard.press("Escape");
    await page.mouse.up();

    await expect.poll(() => previewCount(page)).toBe(0);
    expect(await guideLineCount(page, "horizontal")).toBe(1);
    const restoredY = Number(
      await page
        .locator('[data-guide-overlay="horizontal"]')
        .first()
        .getAttribute("y1"),
    );
    expect(restoredY).toBeCloseTo(originalY, 1);
  });
});

// ── W3.A2 — formerly-deferred legs, now live on the spreads read ────

test.describe("gestures.md GD-01 — undo + engine-truth read", () => {
  test("AC-GD-01-UNDO: Ctrl+Z removes the placed guide from the OVERLAY (INV-4)", async ({
    page,
  }) => {
    // The insertGuide is undoable on the channel; W3.A2 wires the
    // OVERLAY re-sync — the GuideDragController re-queries
    // `collection("spreads")` on undoApplied, so the optimistic line is
    // removed after Ctrl+Z. This leg was test.fixme'd against the old
    // read-surface gap (no live guide read); it now flips green.
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    const before = await guideLineCount(page, "horizontal");
    const drop = await screenPoint(page, p0.widthPt * 0.5, p0.heightPt * 0.4);
    const ruler = await rulerPoint(page, "h");

    await page.mouse.move(ruler.x, ruler.y);
    await page.mouse.down();
    await page.mouse.move(drop.x, drop.y, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(() => guideLineCount(page, "horizontal"), { timeout: 5_000 })
      .toBe(before + 1);

    // Undo → the overlay re-syncs from the spreads collection: the line
    // count returns to baseline.
    await undo(page);
    await expect
      .poll(() => guideLineCount(page, "horizontal"), { timeout: 5_000 })
      .toBe(before);
  });

  test("AC-GD-01-ENGINE: the placed guide is engine truth (collection(\"spreads\").guides) and undo removes it", async ({
    page,
  }) => {
    // The cross-boundary truth (the engine actually persisted the
    // guide) is now readable IN-SESSION via `collection("spreads")`
    // (`SpreadSummary.guides`), no document reload needed. This leg was
    // test.fixme'd against the missing live read; it now flips green.
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "geometry");
    const p0 = fx.pages[0];

    const before = await engineGuideCount(page);
    const drop = await screenPoint(page, p0.widthPt * 0.5, p0.heightPt * 0.45);
    const ruler = await rulerPoint(page, "h");

    await page.mouse.move(ruler.x, ruler.y);
    await page.mouse.down();
    await page.mouse.move(drop.x, drop.y, { steps: 6 });
    await page.mouse.up();

    // Engine truth: the spreads collection now reports one more guide.
    await expect
      .poll(() => engineGuideCount(page), { timeout: 5_000 })
      .toBe(before + 1);

    // Undo removes it from the engine model too.
    await undo(page);
    await expect
      .poll(() => engineGuideCount(page), { timeout: 5_000 })
      .toBe(before);
  });
});
