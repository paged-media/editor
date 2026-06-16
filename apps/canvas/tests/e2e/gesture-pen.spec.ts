// E2E gesture suite — the BUILT-IN Pen tool (W2.5), driven through the
// REAL viewport exactly as a user would: activate the "pen" slot from
// the rail, click / click-drag on the canvas, commit with Enter or by
// closing on the first anchor, cancel with Escape. Proves the chain
//   pointer events → packages/tools pen handler → ONE insertPath →
//   selection → undo
// end-to-end. This is the editor-native counterpart to the paged.draw
// BUNDLE pen suite (draw-plugin.spec.ts AC-DRAW-*): same modifier
// matrix and geometry helpers (@paged-media/draw-geometry), but the
// authoring loop lives in the editor's own tool catalog rather than the
// plugin. The plan IDs are gestures.md DR-08…DR-11 (§4.6 E2E-03).
//
// Every commit is an op-sandwich: draw → assert the committed model
// (anchor count / open flag / handle shape) → undo → the path is gone.
// Escape and a degenerate run are asserted to mutate NOTHING (INV-1).

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { loadViaReactPath, screenPoint } from "./harness/viewport";

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

/** Count scene-tree nodes of one kind (a committed path is a
 *  `polygon`, the engine's open/closed path element). */
async function countKind(page: Page, kind: string): Promise<number> {
  return page.evaluate(async (k) => {
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
      id?: { kind: string } | null;
      children?: unknown[];
    }>;
    let n = 0;
    const visit = (node: {
      id?: { kind: string } | null;
      children?: unknown[];
    }) => {
      if (node.id && node.id.kind === k) n += 1;
      for (const ch of (node.children ?? []) as typeof tree) visit(ch);
    };
    for (const root of tree) visit(root);
    return n;
  }, kind);
}

/** The current single selection — how the suite addresses the path the
 *  pen just committed (mutateAndSelect selects the created element). */
async function selectedElement(page: Page): Promise<ElementRef | null> {
  return page.evaluate(async () => {
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
    const r = await c.client.executeScript("paged.selection()");
    const ids = JSON.parse(r.output[0] ?? "[]") as ElementRef[];
    return ids.length === 1 ? ids[0] : null;
  });
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

/** Activate the built-in Pen via the rail's "pen" slot. The built-in
 *  `paged.tool.pen` is the slot's group default (seeded before the draw
 *  bundle loads), so the face IS the editor-native pen. */
async function activatePen(page: Page): Promise<void> {
  await page.locator('[data-tool-slot="pen"]').click();
  await expect(
    page.locator('[data-tool-slot="pen"][data-active="true"]'),
  ).toBeVisible();
}

/** A click (down → up, no travel) at a page-0-local pt coordinate. */
async function clickPt(page: Page, ptX: number, ptY: number): Promise<void> {
  const s = await screenPoint(page, ptX, ptY);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.up();
  await page.waitForTimeout(30);
}

/** A click-drag (down at `from`, pull to `to`) — pulls smooth handles
 *  out of the anchor placed at `from`. Coordinates are page-0-local pt. */
async function dragPt(
  page: Page,
  from: [number, number],
  to: [number, number],
  opts: { alt?: boolean } = {},
): Promise<void> {
  const a = await screenPoint(page, from[0], from[1]);
  const b = await screenPoint(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  if (opts.alt) await page.keyboard.down("Alt");
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.waitForTimeout(30);
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up("Alt");
  await page.waitForTimeout(30);
}

test.describe("gestures.md DR-08…DR-11 — built-in Pen tool (E2E-03)", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    await loadViaReactPath(page, "geometry");
  });

  test("DR-08 — click×3 + Enter commits ONE open 3-corner path; undo removes it @feat:editor-tools.draw.pen @level:gesture", async ({
    page,
  }) => {
    const before = await countKind(page, "polygon");
    await activatePen(page);
    await clickPt(page, 120, 120);
    await clickPt(page, 220, 120);
    await clickPt(page, 170, 200);
    await page.keyboard.press("Enter");

    // ONE element appeared (the run is a single insertPath / undo step).
    await expect
      .poll(() => countKind(page, "polygon"), { timeout: 5_000 })
      .toBe(before + 1);
    const ref = (await selectedElement(page))!;
    expect(ref, "the committed path is selected").toBeTruthy();

    const snap = (await pathAnchorsOf(page, ref))!;
    expect(snap.anchors, "three clicks → three anchors").toHaveLength(3);
    expect(snap.subpathOpen?.[0] ?? false, "open path").toBe(true);
    // Clicks are corner anchors — both handles collapsed onto the point.
    for (const a of snap.anchors) {
      expect(
        Math.hypot(a.left[0] - a.anchor[0], a.left[1] - a.anchor[1]),
      ).toBeLessThan(1e-3);
      expect(
        Math.hypot(a.right[0] - a.anchor[0], a.right[1] - a.anchor[1]),
      ).toBeLessThan(1e-3);
    }

    // op-sandwich: one undo erases the whole path.
    await undo(page);
    await expect.poll(() => countKind(page, "polygon")).toBe(before);
  });

  test("DR-08 — click-drag pulls a smooth anchor with mirrored handles @feat:editor-tools.draw.pen @level:gesture", async ({
    page,
  }) => {
    const before = await countKind(page, "polygon");
    await activatePen(page);
    // Corner first, then a drag whose pull defines the smooth handle.
    await clickPt(page, 120, 160);
    await dragPt(page, [220, 160], [260, 160]);
    await page.keyboard.press("Enter");

    await expect
      .poll(() => countKind(page, "polygon"), { timeout: 5_000 })
      .toBe(before + 1);
    const ref = (await selectedElement(page))!;
    const snap = (await pathAnchorsOf(page, ref))!;
    expect(snap.anchors).toHaveLength(2);
    const smooth = snap.anchors[1];
    const out = Math.hypot(
      smooth.right[0] - smooth.anchor[0],
      smooth.right[1] - smooth.anchor[1],
    );
    const inn = Math.hypot(
      smooth.left[0] - smooth.anchor[0],
      smooth.left[1] - smooth.anchor[1],
    );
    expect(out, "the drag pulled an outgoing handle").toBeGreaterThan(5);
    expect(Math.abs(out - inn), "incoming mirrors outgoing").toBeLessThan(1);

    await undo(page);
    await expect.poll(() => countKind(page, "polygon")).toBe(before);
  });

  test("DR-09 — Alt during the drag breaks handle symmetry @feat:editor-tools.draw.pen @level:gesture", async ({
    page,
  }) => {
    const before = await countKind(page, "polygon");
    await activatePen(page);
    await clickPt(page, 120, 220);
    // Down at the second anchor, pull right WITHOUT Alt first (mirror
    // forms), then continue down-right WITH Alt held: the leading
    // (outgoing) handle keeps following, the trailing (incoming) one
    // freezes where it last mirrored.
    const a = await screenPoint(page, 220, 220);
    const mid = await screenPoint(page, 260, 220);
    const end = await screenPoint(page, 260, 260);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.waitForTimeout(30);
    await page.mouse.move(mid.x, mid.y, { steps: 4 });
    await page.keyboard.down("Alt");
    await page.mouse.move(end.x, end.y, { steps: 4 });
    await page.waitForTimeout(30);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await page.keyboard.press("Enter");

    await expect
      .poll(() => countKind(page, "polygon"), { timeout: 5_000 })
      .toBe(before + 1);
    const ref = (await selectedElement(page))!;
    const snap = (await pathAnchorsOf(page, ref))!;
    const smooth = snap.anchors[1];
    const out: [number, number] = [
      smooth.right[0] - smooth.anchor[0],
      smooth.right[1] - smooth.anchor[1],
    ];
    const inn: [number, number] = [
      smooth.left[0] - smooth.anchor[0],
      smooth.left[1] - smooth.anchor[1],
    ];
    // Broken pair: the two handles are NOT antiparallel (a mirrored
    // pair would have cross ≈ 0 and opposite signs). The frozen
    // incoming handle points along the pre-Alt direction (+x), the
    // outgoing along the post-Alt direction (+y-ish).
    const cross = out[0] * inn[1] - out[1] * inn[0];
    expect(
      Math.abs(cross),
      "DR-09: handles are no longer collinear (symmetry broken)",
    ).toBeGreaterThan(1);

    await undo(page);
    await expect.poll(() => countKind(page, "polygon")).toBe(before);
  });

  test("DR-10 — clicking the first anchor closes the path @feat:editor-tools.draw.pen @level:happy", async ({
    page,
  }) => {
    const before = await countKind(page, "polygon");
    await activatePen(page);
    await clickPt(page, 120, 120);
    await clickPt(page, 220, 120);
    await clickPt(page, 170, 200);
    // Close: click the first anchor again (inside the 6px tolerance).
    await clickPt(page, 120, 120);

    await expect
      .poll(() => countKind(page, "polygon"), { timeout: 5_000 })
      .toBe(before + 1);
    const ref = (await selectedElement(page))!;
    const snap = (await pathAnchorsOf(page, ref))!;
    // The closing click commits — it does NOT add a fourth anchor.
    expect(snap.anchors).toHaveLength(3);
    expect(snap.subpathOpen?.[0] ?? false, "closed path").toBe(false);

    await undo(page);
    await expect.poll(() => countKind(page, "polygon")).toBe(before);
  });

  test("DR-11 — Escape mid-path aborts: nothing is created (INV-1) @feat:editor-tools.draw.pen @level:happy", async ({
    page,
  }) => {
    const before = await countKind(page, "polygon");
    await activatePen(page);
    await clickPt(page, 120, 120);
    await clickPt(page, 220, 120);
    await page.keyboard.press("Escape");

    await page.waitForTimeout(400);
    expect(
      await countKind(page, "polygon"),
      "Escape committed zero mutation",
    ).toBe(before);

    // And the tool is reusable afterwards — a fresh Enter-committed
    // path lands cleanly (the cancelled run left no residue).
    await clickPt(page, 140, 260);
    await clickPt(page, 240, 260);
    await page.keyboard.press("Enter");
    await expect
      .poll(() => countKind(page, "polygon"), { timeout: 5_000 })
      .toBe(before + 1);
    await undo(page);
    await expect.poll(() => countKind(page, "polygon")).toBe(before);
  });

  test("DR-03/GSM-03 — a single click then Enter never commits an empty path @feat:editor-tools.draw.pen @level:edge", async ({
    page,
  }) => {
    const before = await countKind(page, "polygon");
    await activatePen(page);
    await clickPt(page, 160, 160);
    await page.keyboard.press("Enter"); // degenerate: < 2 anchors

    await page.waitForTimeout(400);
    expect(
      await countKind(page, "polygon"),
      "a one-anchor run is dropped, not committed",
    ).toBe(before);
  });
});
