// E2E gesture suite — modifier semantics, from the gesture test plan
// (thoughts/docs/paged/tests/gestures.md): TR-01 (Shift dominant-axis
// translate, axis can flip mid-drag), INV-5/GSM-08 (constraints are a
// pure function of the CURRENT sample's modifiers — a released Shift
// drops the constraint on the same gesture), TR-02+TR-03 combined
// (Shift+Alt = proportional from centre — the single-modifier arms
// live in tests/resize.spec.ts), TR-07 (shear; Shift snaps the shear
// ANGLE to 15°), SNAP-07/plan-2 §8.4 (disableSnap bypasses the snap
// pass — no indicator lines, raw delta).
//
// Every non-snap test passes disableSnap so assertions are analytic;
// the legacy gesture specs tolerate multi-pt snap nudges instead.

import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type ElementRef,
  type LoadedFixture,
} from "./harness/fixtures";
import {
  beginGesture,
  bounds,
  commitGesture,
  itemTransform,
  runGesture,
  undo,
  updateGesture,
} from "./harness/gesture";

const RAW = { shift: false, alt: false, disableSnap: true };
const SHIFT = { shift: true, alt: false, disableSnap: true };

test.describe("Gesture modifier semantics", () => {
  let fx: LoadedFixture;
  let ref: ElementRef;
  let pageIndex: number;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "geometry");
    const target = fx.frames.find((f) => f.ref.kind === "rectangle")!;
    expect(target, "geometry fixture has a rectangle").toBeTruthy();
    ref = target.ref;
    pageIndex = target.pageIndex;
  });

  test("AC-E2E-GEST-MOD-1 — TR-01: Shift locks translate to the dominant axis", async ({
    page,
  }) => {
    const start = (await elementPageRectPt(page, ref))!;
    await runGesture(page, [ref], { kind: "translate" }, [
      { delta: [60, 8], mods: SHIFT },
    ]);
    const after = (await elementPageRectPt(page, ref))!;
    expect(after.left - start.left, "dominant x carried").toBeCloseTo(60, 1);
    expect(after.top - start.top, "off-axis y suppressed").toBeCloseTo(0, 1);
    await undo(page);
  });

  test("AC-E2E-GEST-MOD-2 — TR-01: the dominant axis flips mid-drag", async ({
    page,
  }) => {
    const start = (await elementPageRectPt(page, ref))!;
    // First sample is x-dominant, the second y-dominant. The
    // constraint is re-resolved per update from the CURRENT delta —
    // the commit must land on the y axis.
    await runGesture(page, [ref], { kind: "translate" }, [
      { delta: [60, 8], mods: SHIFT },
      { delta: [8, 60], mods: SHIFT },
    ]);
    const after = (await elementPageRectPt(page, ref))!;
    expect(after.left - start.left, "x suppressed after flip").toBeCloseTo(0, 1);
    expect(after.top - start.top, "y carried after flip").toBeCloseTo(60, 1);
    await undo(page);
  });

  test("AC-E2E-GEST-MOD-3 — INV-5/GSM-08: releasing Shift mid-gesture drops the constraint on that sample", async ({
    page,
  }) => {
    const start = (await elementPageRectPt(page, ref))!;
    await runGesture(page, [ref], { kind: "translate" }, [
      { delta: [50, 40], mods: SHIFT },
      { delta: [50, 40], mods: RAW }, // same pointer position, Shift released
    ]);
    const after = (await elementPageRectPt(page, ref))!;
    expect(after.left - start.left, "x unconstrained").toBeCloseTo(50, 1);
    expect(
      after.top - start.top,
      "INV-5: y restored the moment Shift lifted — no latched constraint",
    ).toBeCloseTo(40, 1);
    await undo(page);
  });

  test("AC-E2E-GEST-MOD-4 — TR-02+TR-03: Shift+Alt resize is proportional about the centre", async ({
    page,
  }) => {
    const before = await bounds(page, ref);
    const w0 = before[3] - before[1];
    const h0 = before[2] - before[0];
    const cx0 = (before[1] + before[3]) / 2;
    const cy0 = (before[0] + before[2]) / 2;

    await runGesture(page, [ref], { kind: "resize", handle: "southEast" }, [
      { delta: [40, 10], mods: { shift: true, alt: true, disableSnap: true } },
    ]);

    const after = await bounds(page, ref);
    const w1 = after[3] - after[1];
    const h1 = after[2] - after[0];
    expect((after[1] + after[3]) / 2, "centre x invariant").toBeCloseTo(cx0, 2);
    expect((after[0] + after[2]) / 2, "centre y invariant").toBeCloseTo(cy0, 2);
    expect(w1 / h1, "aspect locked to the begin bounds").toBeCloseTo(w0 / h0, 3);
    expect(w1, "the drag actually grew the frame").toBeGreaterThan(w0);
    await undo(page);
  });

  test("AC-E2E-GEST-MOD-5 — TR-07: Shift snaps the shear angle to 15° steps", async ({
    page,
  }) => {
    const pageRect = (await elementPageRectPt(page, ref))!;
    const cx = (pageRect.left + pageRect.right) / 2;
    const cy = (pageRect.top + pageRect.bottom) / 2;
    const before = await itemTransform(page, ref);

    // Anchor 80 pt above the centroid (vertical lever ≠ 0); a 30 pt
    // x-drag gives raw k = 30/−80 → −20.6°, snapping to −15°. The
    // geometry rect's transform is a pure translate, so the shear
    // composes as [1, 0, k, 1] — read k from the c slot.
    await runGesture(
      page,
      [ref],
      { kind: "shear" },
      [{ delta: [30, 0], mods: SHIFT }],
      {
        anchor: {
          pageId: fx.pages[pageIndex].pageId,
          pointInPage: [cx, cy - 80],
        },
      },
    );

    const t = await itemTransform(page, ref);
    expect(t, "shear committed a transform").not.toBeNull();
    expect(t![0], "a untouched").toBeCloseTo(before?.[0] ?? 1, 3);
    expect(t![1], "b untouched").toBeCloseTo(before?.[1] ?? 0, 3);
    expect(t![3], "d untouched").toBeCloseTo(before?.[3] ?? 1, 3);
    const k = t![2] - (before?.[2] ?? 0);
    const angleDeg = (Math.atan(k) * 180) / Math.PI;
    expect(Math.abs(k), "shear actually applied").toBeGreaterThan(0.01);
    const nearest15 = Math.round(angleDeg / 15) * 15;
    expect(angleDeg, "shear angle snapped to a 15° step").toBeCloseTo(
      nearest15,
      1,
    );
    await undo(page);
  });

  test("AC-E2E-GEST-MOD-6 — SNAP-07/§8.4: disableSnap bypasses the snap pass; without it the edge snaps and indicates", async ({
    page,
  }) => {
    const start = (await elementPageRectPt(page, ref))!;
    // Aim the left edge 2 pt short of the page-left edge — inside the
    // 4 pt (camera scale 1) snap tolerance, same staging as the SAB
    // snap spec.
    const dx = -(start.left - 2);

    // Arm A — snap enabled: the update reply carries an x snap line
    // and the committed edge lands EXACTLY on 0.
    const h1 = await beginGesture(page, [ref], { kind: "translate" });
    const r1 = await updateGesture(page, h1, [dx, 0], {
      shift: false,
      alt: false,
    });
    expect(
      r1.snapLines.some((l) => l.axis === "x"),
      "snap pass surfaced an x indicator",
    ).toBe(true);
    await commitGesture(page, h1);
    const snapped = (await elementPageRectPt(page, ref))!;
    expect(snapped.left, "edge snapped onto the page edge").toBeCloseTo(0, 2);
    await undo(page);

    // Arm B — disableSnap: no indicators, raw delta survives (2 pt
    // short of the edge).
    const h2 = await beginGesture(page, [ref], { kind: "translate" });
    const r2 = await updateGesture(page, h2, [dx, 0], {
      shift: false,
      alt: false,
      disableSnap: true,
    });
    expect(r2.snapLines.length, "disableSnap: no indicators").toBe(0);
    await commitGesture(page, h2);
    const raw = (await elementPageRectPt(page, ref))!;
    expect(raw.left, "raw delta — 2 pt short of the edge").toBeCloseTo(2, 1);
    await undo(page);
  });

  test("AC-E2E-GEST-MOD-7 — modifier objects never leak between sessions (fresh begin is unconstrained)", async ({
    page,
  }) => {
    // A Shift-constrained session followed by a plain one: the second
    // gesture must not inherit the first's constraint state (the
    // plan's "no state carried over incorrectly" clause of GSM-08).
    const start = (await elementPageRectPt(page, ref))!;
    await runGesture(page, [ref], { kind: "translate" }, [
      { delta: [60, 8], mods: SHIFT },
    ]);
    await runGesture(page, [ref], { kind: "translate" }, [
      { delta: [10, 25], mods: RAW },
    ]);
    const after = (await elementPageRectPt(page, ref))!;
    expect(after.left - start.left).toBeCloseTo(60 + 10, 1);
    expect(after.top - start.top, "second session unconstrained").toBeCloseTo(
      0 + 25,
      1,
    );
    await undo(page, 2);
  });
});
