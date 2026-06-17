// E2E gesture suite — the BUILT-IN Polygon tool (W2.6), driven through
// the REAL viewport: pick the Polygon from the "shape" slot flyout,
// (optionally) set sides / star inset through the double-click
// tool-options popover (T8), drag on the canvas, release. Proves the
// chain
//   pointer events → packages/tools polygon handler → ONE insertPath
//   (corner anchors, closed) → selection → undo
// end-to-end. Sibling of gesture-pen.spec.ts / gesture-ellipse.spec.ts;
// the plan IDs are gestures.md DR-01 (drag creation) and DR-02 (Shift →
// square bounds). The N-gon/star vertex math lives in the handler; this
// suite pins the committed anchor count + closed flag + corner shape.
//
// Every draw is an op-sandwich: draw → assert the committed model →
// undo → it's gone. Escape mid-drag mutates NOTHING (INV-1).

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  dragMouse,
  loadViaReactPath,
  screenPoint,
  treeCount,
  treeIds,
} from "./harness/viewport";

type ElementRef = { kind: string; id: string };

type PathAnchorTriple = {
  anchor: [number, number];
  left: [number, number];
  right: [number, number];
};

interface PathAnchorsResult {
  pageId: string;
  anchors: PathAnchorTriple[];
  subpathStarts: number[];
  subpathOpen?: boolean[];
}

/** Pick the Polygon from the "shape" slot's flyout (right-click opens
 *  it; Polygon is a hidden member behind the Rectangle default). */
async function activatePolygon(page: Page): Promise<void> {
  await page.locator('[data-tool-slot="shape"]').click({ button: "right" });
  await page
    .locator('[data-tool-flyout="shape"] [data-tool="paged.tool.polygon"]')
    .click();
  await expect(
    page.locator(
      '[data-tool-slot="shape"][data-active="true"][data-tool="paged.tool.polygon"]',
    ),
  ).toBeVisible();
}

/** Set a Polygon tool-option (sides / starInset) through the real
 *  double-click options popover (T8). Polygon must already be the slot
 *  face so `face.options` exists. */
async function setPolygonOption(
  page: Page,
  key: "sides" | "starInset",
  value: number,
): Promise<void> {
  const popover = page.locator('[data-tool-options="paged.tool.polygon"]');
  await page.locator('[data-tool-slot="shape"]').dblclick();
  const input = popover.locator(`[data-tool-option="${key}"]`);
  await expect(input).toBeVisible();
  await input.fill(String(value));
  // Commit the change (React onChange fires on input; blur for safety).
  await input.blur();
  // DISMISS the popover. The T8 popover renders a full-screen click-away
  // overlay (ToolRail.tsx, zIndex 50, inset 0) that closes it on click —
  // and that overlay sits OVER the canvas, so a subsequent drag would
  // land on the overlay (closing the popover) instead of starting the
  // gesture. Click the off-canvas top-left corner to dismiss it (Escape
  // is not wired), then confirm it's gone before drawing.
  await page.mouse.click(5, 5);
  await expect(popover).toBeHidden();
}

/** Drag the Polygon between two page-0-local pt points; resolve the
 *  fresh `polygon` element it commits. Optional Shift held across the
 *  whole drag (square bounds). */
async function drawPolygon(
  page: Page,
  fromPt: [number, number],
  toPt: [number, number],
  mod?: "Shift",
): Promise<ElementRef> {
  const before = await treeIds(page, "polygon");
  const seen = new Set(before.map((r) => r.id));
  const from = await screenPoint(page, fromPt[0], fromPt[1]);
  const to = await screenPoint(page, toPt[0], toPt[1]);
  if (mod) await page.keyboard.down(mod);
  await dragMouse(page, from, to);
  if (mod) await page.keyboard.up(mod);
  await expect
    .poll(() => treeCount(page, "polygon"), { timeout: 5_000 })
    .toBe(before.length + 1);
  const after = await treeIds(page, "polygon");
  const fresh = after.find((r) => !seen.has(r.id));
  expect(fresh, "the drag landed a new polygon").toBeTruthy();
  return fresh!;
}

async function pathAnchorsOf(
  page: Page,
  ref: ElementRef,
): Promise<PathAnchorsResult | null> {
  return page.evaluate(async (r) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            pathAnchors: (id: unknown) => Promise<PathAnchorsResult | null>;
          };
        };
      }
    ).__canvas;
    return c.client.pathAnchors(r).catch(() => null);
  }, ref);
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (
      globalThis as unknown as {
        __canvas: { client: { undo: () => Promise<unknown> } };
      }
    ).__canvas.client.undo();
  });
}

/** Greatest distance between any anchor and the bounds centroid — the
 *  outer radius. Used to assert a star's inner ring is shorter. */
function radii(snap: PathAnchorsResult): { cx: number; cy: number; rs: number[] } {
  const xs = snap.anchors.map((a) => a.anchor[0]);
  const ys = snap.anchors.map((a) => a.anchor[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rs = snap.anchors.map((a) => Math.hypot(a.anchor[0] - cx, a.anchor[1] - cy));
  return { cx, cy, rs };
}

test.describe("gestures.md DR-01/DR-02 — built-in Polygon tool", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadViaReactPath(page, "geometry");
  });

  test("DR-01 — default polygon drag commits ONE closed path with corner anchors; undo removes it @feat:editor-tools.draw.rectangle @feat:frames-paths.shape-tools @level:gesture", async ({
    page,
  }) => {
    const before = await treeCount(page, "polygon");
    await activatePolygon(page);
    const ref = await drawPolygon(page, [120, 120], [260, 220]);

    await expect
      .poll(() => treeCount(page, "polygon"), { timeout: 5_000 })
      .toBe(before + 1);

    const snap = (await pathAnchorsOf(page, ref))!;
    // Default polygon = hexagon (6 sides), no star → 6 anchors, closed.
    expect(snap.anchors, "default hexagon → 6 anchors").toHaveLength(6);
    expect(snap.subpathOpen?.[0] ?? false, "closed path").toBe(false);
    // Every vertex is a corner — handles collapsed onto the point.
    for (const a of snap.anchors) {
      expect(
        Math.hypot(a.left[0] - a.anchor[0], a.left[1] - a.anchor[1]),
      ).toBeLessThan(1e-3);
      expect(
        Math.hypot(a.right[0] - a.anchor[0], a.right[1] - a.anchor[1]),
      ).toBeLessThan(1e-3);
    }

    await undo(page);
    await expect.poll(() => treeCount(page, "polygon")).toBe(before);
  });

  test("DR-01 — sides option drives the vertex count (5 sides → 5 anchors) @feat:editor-tools.draw.rectangle @feat:frames-paths.shape-tools @level:happy", async ({
    page,
  }) => {
    const before = await treeCount(page, "polygon");
    await activatePolygon(page);
    await setPolygonOption(page, "sides", 5);
    const ref = await drawPolygon(page, [120, 120], [260, 220]);

    const snap = (await pathAnchorsOf(page, ref))!;
    expect(snap.anchors, "5 sides → 5 anchors").toHaveLength(5);
    expect(snap.subpathOpen?.[0] ?? false, "closed path").toBe(false);

    await undo(page);
    await expect.poll(() => treeCount(page, "polygon")).toBe(before);
  });

  test("DR-01 — star inset alternates outer/inner radii (2N anchors) @feat:editor-tools.draw.rectangle @feat:frames-paths.shape-tools @level:happy", async ({
    page,
  }) => {
    const before = await treeCount(page, "polygon");
    await activatePolygon(page);
    await setPolygonOption(page, "sides", 5);
    await setPolygonOption(page, "starInset", 50);
    const ref = await drawPolygon(page, [120, 120], [260, 220]);

    const snap = (await pathAnchorsOf(page, ref))!;
    // A 5-point star = 2·5 = 10 alternating vertices.
    expect(snap.anchors, "star → 2N anchors").toHaveLength(10);
    expect(snap.subpathOpen?.[0] ?? false, "closed path").toBe(false);

    // The inner ring (odd indices) sits at ~half the outer radius.
    const { rs } = radii(snap);
    const outer = rs.filter((_, i) => i % 2 === 0);
    const inner = rs.filter((_, i) => i % 2 === 1);
    const avgOuter = outer.reduce((s, r) => s + r, 0) / outer.length;
    const avgInner = inner.reduce((s, r) => s + r, 0) / inner.length;
    expect(avgInner, "inner radius is shorter than outer").toBeLessThan(
      avgOuter,
    );
    // 50% inset → inner ≈ 0.5 × outer (loose tolerance for the
    // ellipse-inscribed, non-uniform-radius bounds).
    expect(avgInner / avgOuter).toBeGreaterThan(0.3);
    expect(avgInner / avgOuter).toBeLessThan(0.7);

    await undo(page);
    await expect.poll(() => treeCount(page, "polygon")).toBe(before);
  });

  test("DR-02 — Shift constrains the polygon bounds to a square @feat:editor-tools.draw.rectangle @feat:frames-paths.shape-tools @level:happy", async ({
    page,
  }) => {
    const before = await treeCount(page, "polygon");
    await activatePolygon(page);
    await setPolygonOption(page, "sides", 4);
    // 140×100 drag, Shift → square bounds (140×140), so the vertex AABB
    // is square too.
    const ref = await drawPolygon(page, [120, 120], [260, 220], "Shift");
    const snap = (await pathAnchorsOf(page, ref))!;
    const xs = snap.anchors.map((a) => a.anchor[0]);
    const ys = snap.anchors.map((a) => a.anchor[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    expect(
      Math.abs(w - h),
      "DR-02: Shift squared the polygon's bounds",
    ).toBeLessThan(1.5);

    await undo(page);
    await expect.poll(() => treeCount(page, "polygon")).toBe(before);
  });

  test("DR-01/INV-1 — Escape mid-drag creates nothing @feat:editor-tools.draw.rectangle @feat:frames-paths.shape-tools @level:gesture", async ({ page }) => {
    const before = await treeCount(page, "polygon");
    await activatePolygon(page);
    const start = await screenPoint(page, 120, 120);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 80, start.y + 60, { steps: 5 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(
      await treeCount(page, "polygon"),
      "Escape committed zero mutation",
    ).toBe(before);
  });
});
