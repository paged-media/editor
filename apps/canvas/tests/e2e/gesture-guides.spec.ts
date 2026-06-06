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
// READ SURFACE + WIRE GAP. The engine ops are capability-verified
// supported (capabilities.ts: insertGuide/moveGuide/deleteGuide,
// protocol v28), and capability-matrix.spec.ts already proves each
// applies + undoes at the channel level. What the engine does NOT
// surface is an in-session, id-keyed READ of guides:
// `DocumentHandle.rulerGuides` is a load-time snapshot (no guide id,
// no re-query after a mutation). So the controller keeps a CLIENT-SIDE
// optimistic mirror synced by its own mutations, and these specs
// assert the GESTURE through that mirror's rendered overlay lines —
// the only in-session read surface. The optimistic line only appears
// AFTER the mutation's `mutationApplied`, so a visible overlay line is
// also proof the engine mutation landed.
//
// Two legs are test.fixme'd against that same gap: undo/redo overlay
// re-sync (the controller has no live guide read to rebuild the mirror
// from on undoApplied), and the channel-level "undo restores the
// document" assertion (owned by capability-matrix.spec.ts). The
// gesture-plan-deferred.spec.ts E2E-06 stub stays until the sweep
// flips it; this file is the real GD-01…03 implementation it points
// at.

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
    const y = Number(
      await page
        .locator('[data-guide-overlay="horizontal"]')
        .first()
        .getAttribute("y1"),
    );
    expect(y).toBeCloseTo(Math.round(p0.heightPt * 0.6), 0);
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

// ── Deferred legs — blocked on the read-surface wire gap ────────────

test.fixme(
  "GD-01 undo — Ctrl+Z removes the placed guide from the OVERLAY (INV-4)",
  async () => {
    // The insertGuide IS undoable on the channel (capability-matrix
    // proves it). What is NOT wired is the OVERLAY re-syncing on undo:
    // the GuideDragController keeps an optimistic client mirror and has
    // no live, id-keyed guide READ to rebuild it from on `undoApplied`
    // / `redoApplied` (DocumentHandle.rulerGuides is load-time only).
    // So after Ctrl+Z the engine guide is gone but the overlay line
    // lingers. Wire this leg when core surfaces a live guides
    // collection (or a guides-changed notification) the controller can
    // resubscribe to — then the mirror follows undo/redo and this
    // assertion (overlay line count returns to `before`) flips green.
  },
);

test.fixme(
  "GD-01 channel round-trip — reload the MUTATED document re-reads the guide (engine truth)",
  async () => {
    // The cross-boundary truth (the engine actually persisted the
    // guide) is read by RELOADING the mutated document so loadDocument
    // re-reads DocumentHandle.rulerGuides. The canvas app has no
    // in-session document serialize/reload path (only a fresh
    // loadDocument that discards session mutations), so this engine-
    // truth assertion can't run here yet; capability-matrix.spec.ts
    // covers the channel apply+undo in the meantime. Wire this once a
    // session-preserving reload (or a live guides read) exists.
  },
);
