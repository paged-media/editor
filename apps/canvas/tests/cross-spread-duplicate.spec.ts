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

// Track K — cross-spread Alt-duplicate acceptance.
//
// AC-K-1  Drag-duplicate within the same spread behaves identically
//         to Phase H.4 — no regression.
// AC-K-2  Drag crossing into a different spread: the duplicate
//         appears on the destination spread; original stays on the
//         source spread unchanged.
// AC-K-4  Single Cmd-Z removes the duplicate regardless of spread.
//
// AC-K-3 (preview live) isn't asserted explicitly because today's
// gesture-preview already moves the frame to the world pointer
// position before commit — there's no separate "ghost on
// destination spread" affordance to assert against. If a follow-up
// adds a literal ghost, extend this spec.
//
// Verification strategy: each test computes the duplicate's
// expected synthetic id (`${source_id}_dup_${suffix}_0`) where
// `suffix` is the wasm-process duplicate counter. The counter
// persists across model loads (static AtomicU64), so successive
// tests in the same worker bump it; we track the expected counter
// per-test via a beforeEach probe. Then `elementGeometry` looks up
// the duplicate's `pageId` — same as source's = AC-K-1, different
// = AC-K-2.
//
// Fixture: `corpus/generated/layout.idml` (6 single-page spreads;
// the last two carry non-identity spread ItemTransforms, so their
// pages occupy distinct world-space rects — see the FIXTURE note).

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";

import { openCanvas, loadIdml } from "./fidelity/canvas-driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..");

// License-clear generated fixture (runs in lean CI). Most generated
// fixtures use identity spread transforms (every spread overlaps at
// world (0,0)), which would make cross-spread routing untestable
// through the gesture spine's world-pointer reconstruction — but
// `layout.idml`'s two spread-transform variant spreads have real
// translation origins, giving them distinct world rects:
//
//   spreads 1–4  identity        → pages at world x 0..595.276,
//                                  y 0..841.89 (overlapping)
//   spread 5     rotate-15       → origin (238.1104, 336.756);
//                                  page world rect x 238.11..833.39,
//                                  y 336.76..1178.65 (the spine's
//                                  containment test uses only the
//                                  spread's translation origin)
//   spread 6     scale-1p25      → origin (178.5828, 252.567)
//
// A world pointer at y > 841.89 escapes every identity spread; if it
// also lands inside spread 5's rect, `resolve_destination_spread`
// (first match in document order) routes there deterministically.
const FIXTURE = `${REPO_ROOT}/corpus/generated/layout.idml`;

// World-space target for the cross-spread drags: below the identity
// spreads' shared page rect (y > 841.89) and inside the rotate-15
// spread's world rect. Deltas are derived per-test from the picked
// frame's measured centre, so the pointer lands here exactly.
const CROSS_SPREAD_WORLD_TARGET: [number, number] = [450, 950];

type ElementId =
  | { kind: "textFrame"; id: string }
  | { kind: "rectangle"; id: string }
  | { kind: "oval"; id: string }
  | { kind: "polygon"; id: string }
  | { kind: "graphicLine"; id: string }
  | { kind: "group"; id: string };

interface ElementGeometryItem {
  id: ElementId;
  pageId: string;
  bounds: [number, number, number, number];
  itemTransform: [number, number, number, number, number, number] | null;
}

interface CanvasGlobal {
  client: {
    send: (msg: unknown) => Promise<unknown>;
    beginGesture: (
      nodes: ElementId[],
      gesture: unknown,
      anchor?: unknown,
    ) => Promise<number>;
    updateGesture: (
      h: number,
      d: [number, number],
      mods: { shift: boolean; alt: boolean },
    ) => Promise<unknown>;
    commitGesture: (
      h: number,
    ) => Promise<{ appliedSeq: number; pageIds: string[] }>;
    elementGeometry: (ids: ElementId[]) => Promise<ElementGeometryItem[]>;
    undo: () => Promise<unknown>;
  };
}

/** Find an un-rotated frame on the named page by probing a grid of
 *  interior points. Returns the element id, source pageId, and
 *  page-local bounds. */
async function pickFrame(
  page: Page,
  pageId: string,
  w: number,
  h: number,
): Promise<{
  id: ElementId;
  pageId: string;
  bounds: [number, number, number, number];
}> {
  return page.evaluate(
    async ({ pageId, w, h }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      for (let r = 0.2; r < 1.0; r += 0.15) {
        for (let cc = 0.2; cc < 1.0; cc += 0.15) {
          const reply = (await c.client.send({
            kind: "hitTest",
            payload: { pageId, docPoint: [w * cc, h * r], filter: "any" },
          })) as {
            payload: {
              element: ElementId | null;
              frameBounds: { top: number; left: number; bottom: number; right: number } | null;
              itemTransform: number[] | null;
            };
          };
          const el = reply.payload.element;
          const fb = reply.payload.frameBounds;
          const tr = reply.payload.itemTransform;
          if (!el || !fb) continue;
          if (tr && (Math.abs(tr[0] - 1) > 1e-3 || Math.abs(tr[3] - 1) > 1e-3))
            continue;
          if (tr && (Math.abs(tr[1]) > 1e-3 || Math.abs(tr[2]) > 1e-3))
            continue;
          return {
            id: el,
            pageId,
            bounds: [fb.top, fb.left, fb.bottom, fb.right] as [
              number,
              number,
              number,
              number,
            ],
          };
        }
      }
      throw new Error(`no un-rotated frame on page ${pageId}`);
    },
    { pageId, w, h },
  );
}

/** Probe the next duplicate suffix by performing a throwaway
 *  Alt-translate-cancel sequence on a known frame. The wasm-side
 *  duplicate counter increments per emitted clone op; this lets
 *  the spec predict the upcoming dup id without parsing the
 *  worker's reply log. */
// (Not actually used — `duplicate_suffix` increments on COMMIT,
// not on op-construction. Instead each test reads the duplicate
// id by enumerating elementGeometry across a candidate range.)

/** After a commit, walk a known set of candidate dup ids (one per
 *  expected suffix) and return the first one whose elementGeometry
 *  resolves. The wasm `duplicate_suffix()` static counter is
 *  monotonic but not test-isolated, so this scan covers reuse. */
async function findDuplicateForSource(
  page: Page,
  srcId: ElementId,
): Promise<ElementGeometryItem | null> {
  return page.evaluate(
    async ({ srcId }) => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      for (let suffix = 0; suffix < 32; suffix++) {
        const candidate = `${srcId.id}_dup_${suffix}_0`;
        const geom = await c.client.elementGeometry([
          { kind: srcId.kind, id: candidate } as ElementId,
        ]);
        if (geom.length > 0) return geom[0];
      }
      return null;
    },
    { srcId },
  );
}

test.describe("Track K — cross-spread Alt-duplicate", () => {
  let pageAId = "";
  let pageBId = "";
  let pageAW = 0;
  let pageAH = 0;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const loaded = await loadIdml(page, FIXTURE);
    expect(loaded.pages.length).toBeGreaterThanOrEqual(2);
    pageAId = loaded.pages[0].pageId;
    pageBId = loaded.pages[1].pageId;
    pageAW = loaded.pages[0].widthPt;
    pageAH = loaded.pages[0].heightPt;
  });

  test("AC-K-1 — same-spread Alt-translate: duplicate lands on source page @feat:editor-tools.move.duplicate-drag @level:happy", async ({
    page,
  }) => {
    const src = await pickFrame(page, pageAId, pageAW, pageAH);

    // Tiny delta — well inside the source page so no cross-spread
    // routing fires.
    const delta: [number, number] = [12, 18];
    await page.evaluate(
      async ({ id, delta }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture([id], { kind: "translate" });
        await c.client.updateGesture(h, delta, { shift: false, alt: true });
        await c.client.commitGesture(h);
      },
      { id: src.id, delta },
    );

    const dup = await findDuplicateForSource(page, src.id);
    expect(dup, "duplicate should exist").not.toBeNull();
    // Same page as the source: same-spread routing preserved.
    expect(dup!.pageId).toBe(src.pageId);
    // Source still present.
    const srcGeom = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.elementGeometry([id]);
      },
      { id: src.id },
    );
    expect(srcGeom.length).toBe(1);
    expect(srcGeom[0].pageId).toBe(src.pageId);
  });

  test("AC-K-2 — cross-spread Alt-translate: duplicate dispatches with destination spread resolved @feat:editor-tools.move.duplicate-drag @level:happy", async ({
    page,
  }) => {
    // End-to-end coverage of cross-spread routing is split between
    // here and the Rust unit tests in paged-mutate's lib.rs:
    //   - `clone_translate_with_destination_routes_to_dest_with_corrected_delta`
    //     proves the apply layer inserts into the named spread with
    //     the corrected effective delta.
    //   - `cross_spread_clone_undo_removes_from_dest`
    //     proves the inverse removes from the same destination spread.
    // This test exercises the GESTURE-SPINE half: when the Alt-drag
    // carries the world pointer into a different spread, the
    // commit emits a `CloneTranslate` whose `destination_spread_id`
    // is `Some(...)` rather than `None`. We confirm via captured
    // worker console logs — the spine emits a
    // `[K-debug] dest spread origin = ...` line when it resolved a
    // destination. The pageId assigned by the renderer post-rebuild
    // is intentionally not asserted: in real InDesign exports the
    // renderer routes by frame-vs-page geometry, which can drift
    // from spread membership when the duplicate's bounds land
    // outside the destination page's pure-page rect.
    let sawDestResolve = false;
    page.on("console", (m) => {
      const t = m.text();
      if (t.includes("[K-debug] dest spread origin")) {
        sawDestResolve = true;
      }
    });
    const src = await pickFrame(page, pageAId, pageAW, pageAH);

    // The source spread is identity, so world pointer = anchor
    // (the frame's centre, page-local == spread-local here) +
    // delta. Derive the delta that lands the pointer exactly on
    // CROSS_SPREAD_WORLD_TARGET — below every identity spread's
    // page rect and inside the rotate-15 spread's world rect, so
    // the spine routes the clone to that spread.
    const anchorPoint: [number, number] = [
      (src.bounds[1] + src.bounds[3]) / 2,
      (src.bounds[0] + src.bounds[2]) / 2,
    ];
    const delta: [number, number] = [
      CROSS_SPREAD_WORLD_TARGET[0] - anchorPoint[0],
      CROSS_SPREAD_WORLD_TARGET[1] - anchorPoint[1],
    ];
    await page.evaluate(
      async ({ id, delta, pageAId, anchorPoint }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [id],
          { kind: "translate" },
          // Anchor at the source's centre (page-local). Required
          // for the gesture spine's world-pointer reconstruction
          // in `resolve_destination_spread` — without an anchor it
          // can't compute the world pointer, falls back to None,
          // and the apply takes the source-spread (no-op cross)
          // path.
          { pageId: pageAId, pointInPage: anchorPoint },
        );
        await c.client.updateGesture(h, delta, { shift: false, alt: true });
        await c.client.commitGesture(h);
      },
      { id: src.id, delta, pageAId, anchorPoint },
    );

    const dup = await findDuplicateForSource(page, src.id);
    expect(dup, "duplicate should exist").not.toBeNull();
    // Gesture spine resolved a destination spread (i.e. cross-
    // spread routing fired, not the source-spread fallback). The
    // debug log was emitted between the test's beginGesture and
    // commitGesture, so it's visible by the time elementGeometry
    // returns.
    expect(
      sawDestResolve,
      "gesture spine should have resolved a destination spread for this delta",
    ).toBe(true);
    // Strict pageId routing: the duplicate's pageId reports a page
    // of the DESTINATION spread, not the source page. Prior to the
    // spread-scoped lookup in `element_geometry`, the dup's centroid
    // (in spread-B-local coords) could alias spread A's pages and
    // surface the source pageId — making this assertion impossible
    // to pin. (The earlier K.3 spec asserted only the dispatch-side
    // debug log; the spread-scoped routing fix lets us tighten.)
    expect(dup!.pageId).not.toBe(src.pageId);
    // Source unchanged on its original page.
    const srcGeom = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.elementGeometry([id]);
      },
      { id: src.id },
    );
    expect(srcGeom.length).toBe(1);
    expect(srcGeom[0].pageId).toBe(src.pageId);
  });

  test("AC-K-4 — single Cmd-Z removes the duplicate (cross-spread) @feat:editor-tools.move.duplicate-drag @level:happy", async ({
    page,
  }) => {
    const src = await pickFrame(page, pageAId, pageAW, pageAH);

    const anchorPoint: [number, number] = [
      (src.bounds[1] + src.bounds[3]) / 2,
      (src.bounds[0] + src.bounds[2]) / 2,
    ];
    // Same cross-spread targeting as AC-K-2 — the pointer lands on
    // the rotate-15 spread's page (see AC-K-2's rationale).
    const delta: [number, number] = [
      CROSS_SPREAD_WORLD_TARGET[0] - anchorPoint[0],
      CROSS_SPREAD_WORLD_TARGET[1] - anchorPoint[1],
    ];
    await page.evaluate(
      async ({ id, delta, pageAId, anchorPoint }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        const h = await c.client.beginGesture(
          [id],
          { kind: "translate" },
          { pageId: pageAId, pointInPage: anchorPoint },
        );
        await c.client.updateGesture(h, delta, { shift: false, alt: true });
        await c.client.commitGesture(h);
      },
      { id: src.id, delta, pageAId, anchorPoint },
    );

    const before = await findDuplicateForSource(page, src.id);
    expect(before, "duplicate exists before undo").not.toBeNull();

    await page.evaluate(async () => {
      const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
      await c.client.undo();
    });

    const after = await findDuplicateForSource(page, src.id);
    expect(after, "duplicate gone after undo").toBeNull();
    // Source still on page A.
    const srcGeom = await page.evaluate(
      async ({ id }) => {
        const c = (globalThis as unknown as { __canvas: CanvasGlobal }).__canvas;
        return c.client.elementGeometry([id]);
      },
      { id: src.id },
    );
    expect(srcGeom.length).toBe(1);
    expect(srcGeom[0].pageId).toBe(src.pageId);
  });
});
