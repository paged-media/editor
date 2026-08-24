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

// E2E gesture suite — text-frame threading (gestures.md TH-01…04 /
// VR-08 / E2E-05).
//
// W2.9 implements the InDesign threading gesture on the selection
// chrome: a selected text frame shows an IN-port (top-left) and
// OUT-port (bottom-right); clicking the out-port loads the threading
// cursor; the next click links an existing empty text frame (TH-01) or
// draws+links a new frame on empty canvas (TH-02); Esc clears the
// loaded cursor (TH-03); an overset frame's out-port shows the red "+"
// badge. The wiring under test:
//
//   selection chrome out-port pointerdown (data-thread-port="out")
//     → ThreadingContext loaded cursor (data-thread-state="loaded")
//     → ThreadingController window pointerdown (capture)
//       → linkFrames  (drop on an existing empty text frame)        TH-01
//       → insertTextFrame + linkFrames  (drop on empty canvas)      TH-02
//     → Escape → clearCursor, ZERO mutation                         TH-03
//
// READ SURFACE + WIRE GAP (mirrors W2.8's guides). The engine ops
// linkFrames / unlinkFrames / insertTextFrame are capability-verified
// supported (capability-matrix.spec.ts proves each applies + undoes at
// the channel level, protocol v28). What the engine does NOT surface
// is an in-session, id-keyed READ of a frame's thread chain:
// `nextTextFrame` / `previousTextFrame` are absent from the
// `PropertyPath` enum and `elementProperties` carries no chain entry.
// So the PORTS' glyphs come from the controller's CLIENT-SIDE
// optimistic link mirror (links made this session), and these specs
// assert the GESTURE two ways:
//
//   1. CHANNEL TRUTH — the underlying mutation landed: `mutate()`
//      resolves `mutationApplied` (it never throws; a rejected op comes
//      back as `mutationFailed`). For TH-02 the frame count
//      (`paged.tree()` textFrame walk) grows by exactly one. This is
//      the engine talking, not the mirror.
//   2. UI STATE — the optimistic mirror's rendered port glyph
//      (`data-thread-state` on `[data-thread-port]`), which only flips
//      AFTER the mutation's `mutationApplied`, so a "chained" glyph is
//      also proof the engine mutation landed.
//
// W3.A2 — chain state is now ENGINE TRUTH, not a session mirror. The
// ThreadingController reads `nextTextFrame` / `previousTextFrame` off
// the SELECTED frame(s) via `elementProperties` on every Operation
// push, so the port glyphs reflect the real chain: load-time chains
// render correctly, and undo / unlink re-sync the ports directly from
// the engine (no manual mirror update). TH-01 now also asserts the
// in-port flips back to "empty" after an unlinkFrames — engine-truth
// round-trip, not a mirror rewrite.
//
// OVERSET is also live-readable (`StorySummary.overset` via
// `paged.stories()`), so the badge is engine-truth. Aftercare-D: TH-04's
// badge leg loads the `text-overset` fixture (overset at load time),
// finds an overset frame via a frame→story centre hit-test, selects it,
// and asserts the out-port paints the red "+"
// (`data-thread-state="overset"`).
//
// The gesture-plan-deferred.spec.ts E2E-05 stub stays until the sweep
// flips it; this file is the real TH-01…04 implementation it points at.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { selectElements } from "./harness/ui";
import { loadViaReactPath, screenPoint, treeCount } from "./harness/viewport";
import type { ElementRef } from "./harness/fixtures";

/** Apply one mutation through the worker; resolve the reply kind +
 *  created id. `mutate()` resolves the envelope on BOTH paths (it
 *  never throws), so classify by the reply kind. */
async function mutate(
  page: Page,
  m: unknown,
): Promise<{ kind: string; createdId: string | null }> {
  return page.evaluate(async (mm) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            mutate: (x: unknown) => Promise<{
              kind: string;
              payload?: { createdId?: { id?: string } | null };
            }>;
          };
        };
      }
    ).__canvas;
    const reply = await c.client.mutate(mm);
    const created = reply.payload?.createdId;
    return {
      kind: reply.kind,
      createdId: created?.id ?? null,
    };
  }, m);
}

/** Insert a fresh EMPTY text frame on page 0; resolve its id. The
 *  link `to` MUST be an empty text frame (v28 linkFrames precondition);
 *  the generated fixtures' frames all carry content, so the link
 *  target is always one we create. */
async function insertEmptyTextFrame(
  page: Page,
  pageId: string,
  bounds: [number, number, number, number],
): Promise<string | null> {
  const r = await mutate(page, {
    op: "insertTextFrame",
    args: { pageId, bounds },
  });
  return r.kind === "mutationApplied" ? r.createdId : null;
}

/** The `data-thread-state` of one port on the current selection's
 *  chrome ("empty" | "chained" | "loaded" | "overset"), or null when
 *  the port isn't rendered. */
async function portState(
  page: Page,
  which: "in" | "out",
): Promise<string | null> {
  const loc = page.locator(`[data-thread-port="${which}"]`);
  if ((await loc.count()) === 0) return null;
  return loc.first().getAttribute("data-thread-state");
}

/** Centre of a port in client px (for a real pointer click). */
async function portPoint(
  page: Page,
  which: "in" | "out",
): Promise<{ x: number; y: number }> {
  const box = await page
    .locator(`[data-thread-port="${which}"]`)
    .first()
    .boundingBox();
  if (!box) throw new Error(`thread port ${which} not found`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("gestures.md TH — text-frame threading ports", () => {
  test("TH-PORTS: a selected text frame shows in/out ports; a rectangle does not @feat:editor-tools.text.threading-ports @feat:layout-model.text-frame-chain @level:happy", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "text");
    expect(fx.firstTextFrame).not.toBeNull();

    await selectElements(page, [fx.firstTextFrame as ElementRef]);
    // Both ports render on a text-frame selection, idle (empty) state.
    await expect.poll(() => portState(page, "out")).toBe("empty");
    expect(await portState(page, "in")).toBe("empty");

    // A non-text selection (rectangle) renders NO threading ports.
    const geo = await loadViaReactPath(page, "geometry");
    if (geo.firstRectangle) {
      await selectElements(page, [geo.firstRectangle]);
      await expect.poll(() => portState(page, "out")).toBeNull();
    }
  });

  test("TH-01: out-port click loads the cursor; clicking an empty text frame links them; undo unlinks @feat:editor-tools.text.threading-ports @feat:layout-model.text-frame-chain @level:edge", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "text");
    const p0 = fx.pages[0];
    const source = fx.firstTextFrame as ElementRef;
    expect(source).not.toBeNull();

    // A scratch EMPTY text frame is the only valid link target.
    const targetId = await insertEmptyTextFrame(page, p0.pageId, [
      p0.heightPt * 0.55,
      p0.widthPt * 0.2,
      p0.heightPt * 0.55 + 140,
      p0.widthPt * 0.2 + 200,
    ]);
    expect(targetId).not.toBeNull();

    // Select the source frame → out-port appears, idle.
    await selectElements(page, [source]);
    await expect.poll(() => portState(page, "out")).toBe("empty");

    // Click the out-port → loaded cursor (the source's out-port flips
    // to the loaded highlight).
    const outPt = await portPoint(page, "out");
    await page.mouse.click(outPt.x, outPt.y);
    await expect.poll(() => portState(page, "out")).toBe("loaded");

    // Click the empty target frame's centre → linkFrames. The drop is
    // resolved by the controller's window pointerdown (capture phase),
    // which hit-tests the target and dispatches linkFrames.
    const targetCentre = await screenPoint(
      page,
      p0.widthPt * 0.2 + 100,
      p0.heightPt * 0.55 + 70,
    );
    await page.mouse.click(targetCentre.x, targetCentre.y);

    // CHANNEL + UI: the link landed. Re-selecting the target shows its
    // in-port "chained" from ENGINE TRUTH (the target's
    // `previousTextFrame` is now the source's id). The loaded cursor
    // cleared on the drop. The SOURCE's out-port likewise reads
    // "chained" (its `nextTextFrame` is the target).
    await selectElements(page, [{ kind: "textFrame", id: targetId as string }]);
    await expect.poll(() => portState(page, "in")).toBe("chained");
    await selectElements(page, [source]);
    await expect.poll(() => portState(page, "out")).toBe("chained");

    // INV-4: break the chain. `unlinkFrames(frame)` clears the frame's
    // OUTGOING link, so unlinking the SOURCE breaks src→target. W3.A2 —
    // the controller re-reads the chain off `elementProperties` on the
    // mutationApplied push, so the source's out-port flips back to
    // "empty" from ENGINE TRUTH (not a mirror rewrite). With the source
    // still selected, poll the port back to empty after the unlink.
    const unlinked = await mutate(page, {
      op: "unlinkFrames",
      args: { frame: source.id },
    });
    expect(unlinked.kind).toBe("mutationApplied");
    await expect.poll(() => portState(page, "out")).toBe("empty");
  });

  test("TH-02: out-port click then click on empty canvas draws a new frame and links into it (2 ops) @feat:editor-tools.text.threading-ports @feat:layout-model.text-frame-chain @level:edge", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "text");
    const p0 = fx.pages[0];
    const source = fx.firstTextFrame as ElementRef;
    expect(source).not.toBeNull();

    const beforeFrames = await treeCount(page, "textFrame");

    await selectElements(page, [source]);
    await expect.poll(() => portState(page, "out")).toBe("empty");

    // Load the cursor from the out-port.
    const outPt = await portPoint(page, "out");
    await page.mouse.click(outPt.x, outPt.y);
    await expect.poll(() => portState(page, "out")).toBe("loaded");

    // Click empty canvas low on the page → insertTextFrame (a new frame
    // centred on the drop) + linkFrames. Two sequential mutations (the
    // new frame's id isn't known until the insert applies, so this is
    // NOT one batch — see the controller header).
    const empty = await screenPoint(page, p0.widthPt * 0.5, p0.heightPt * 0.82);
    await page.mouse.click(empty.x, empty.y);

    // Exactly one new text frame exists (the draw-and-link's insert).
    await expect
      .poll(() => treeCount(page, "textFrame"), { timeout: 8_000 })
      .toBe(beforeFrames + 1);

    // The source frame now "has a next frame" — its out-port flips to
    // the chained glyph (mirror, set only after both mutations landed).
    await selectElements(page, [source]);
    await expect.poll(() => portState(page, "out")).toBe("chained");
  });

  test("TH-03: out-port click then Esc clears the loaded cursor with no mutation @feat:editor-tools.text.threading-ports @feat:layout-model.text-frame-chain @level:gesture", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "text");
    const source = fx.firstTextFrame as ElementRef;
    expect(source).not.toBeNull();

    const beforeFrames = await treeCount(page, "textFrame");

    await selectElements(page, [source]);
    await expect.poll(() => portState(page, "out")).toBe("empty");

    // Load the cursor, then Escape.
    const outPt = await portPoint(page, "out");
    await page.mouse.click(outPt.x, outPt.y);
    await expect.poll(() => portState(page, "out")).toBe("loaded");
    await page.keyboard.press("Escape");

    // The loaded highlight cleared back to idle, and NOTHING mutated
    // (no new frame, no link — the source out-port is empty again).
    await expect.poll(() => portState(page, "out")).toBe("empty");
    expect(await treeCount(page, "textFrame")).toBe(beforeFrames);
  });

  test("TH-05: a loaded thread SHOWS the mode with a cursor @feat:editor-tools.text.threading-ports @level:edge", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "text");
    const source = fx.firstTextFrame as ElementRef;
    await selectElements(page, [source]);
    await expect.poll(() => portState(page, "out")).toBe("empty");

    const rootCursor = () =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue("cursor"),
      );
    const idle = await rootCursor();

    // While loaded, the controller's window listeners run in CAPTURE
    // phase and stopPropagation the next pointerdown ANYWHERE on screen,
    // including over a panel — the app is modal and the user's next
    // click is already spoken for. The only feedback used to be the
    // source out-port turning magenta, an 18px square the pointing hand
    // is usually covering.
    const outPt = await portPoint(page, "out");
    await page.mouse.click(outPt.x, outPt.y);
    await expect.poll(() => portState(page, "out")).toBe("loaded");
    await expect.poll(rootCursor, { timeout: 5_000 }).toBe("copy");

    // And it must not outlive the mode: an Escape that left the whole
    // app showing a copy cursor would be worse than the bug it fixes.
    await page.keyboard.press("Escape");
    await expect.poll(() => portState(page, "out")).toBe("empty");
    await expect.poll(rootCursor, { timeout: 5_000 }).toBe(idle);
  });
});

test.describe("gestures.md TH-04 — overset badge", () => {
  // Aftercare-D: the `text-overset` fixture ships overset frames at LOAD
  // time (no induced edit needed). Page 1 is a single short frame
  // overset by its body story; page 2 is a threaded A→B chain that
  // oversets past frame B. Inter is seeded by the React loader so the
  // overset diagnostic fires deterministically. The controller marks the
  // selected frame's id in `oversetFrames` (derived from
  // `StorySummary.overset` via a centre hit-test), so selecting an
  // overset frame paints the red "+" overset badge on its out-port.
  test("an overset frame's out-port shows the red + overset badge", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
    const fx = await loadViaReactPath(page, "text-overset");
    expect(fx.frames.length).toBeGreaterThan(0);

    // The set of overset story ids (engine truth via the live script
    // surface the controller reads).
    const oversetStoryIds = await page.evaluate(async () => {
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
      const r = await c.client.executeScript("paged.stories()");
      const stories = JSON.parse(r.output[0] ?? "[]") as Array<{
        selfId: string;
        overset?: boolean;
      }>;
      return stories.filter((s) => s.overset).map((s) => s.selfId);
    });
    expect(
      oversetStoryIds.length,
      "text-overset ships at least one overset story",
    ).toBeGreaterThan(0);

    // Find a text frame whose parent story is overset — a centre
    // hit-test resolves frame→story the same way the controller does.
    const oversetFrame = await page.evaluate(
      async ({ frames, pages, oversetStoryIds }) => {
        const c = (
          globalThis as unknown as {
            __canvas: {
              client: {
                elementGeometry: (ids: unknown[]) => Promise<
                  Array<{
                    pageId: string;
                    bounds: [number, number, number, number];
                    itemTransform?:
                      | [number, number, number, number, number, number]
                      | null;
                  }>
                >;
                send: (m: unknown) => Promise<{
                  kind: string;
                  payload?: { storyId?: string | null };
                }>;
              };
            };
          }
        ).__canvas;
        for (const f of frames) {
          if (f.ref.kind !== "textFrame") continue;
          const geo = (await c.client.elementGeometry([f.ref]))[0];
          if (!geo) continue;
          const [top, left, bottom, right] = geo.bounds;
          const [a, b, cc, d, tx, ty] = geo.itemTransform ?? [1, 0, 0, 1, 0, 0];
          const cx0 = (left + right) / 2;
          const cy0 = (top + bottom) / 2;
          const cx = a * cx0 + cc * cy0 + tx;
          const cy = b * cx0 + d * cy0 + ty;
          const page = pages.find((p) => p.pageId === geo.pageId);
          if (!page) continue;
          const hit = await c.client.send({
            kind: "hitTest",
            payload: {
              pageId: geo.pageId,
              docPoint: [cx, cy],
              filter: "text",
            },
          });
          const sid = hit.payload?.storyId ?? null;
          if (sid && oversetStoryIds.includes(sid)) {
            return f.ref;
          }
        }
        return null;
      },
      { frames: fx.frames, pages: fx.pages, oversetStoryIds },
    );
    expect(oversetFrame, "an overset text frame to select").not.toBeNull();

    // Select the overset frame → its out-port paints the overset badge.
    await selectElements(page, [oversetFrame as ElementRef]);
    await expect
      .poll(() => portState(page, "out"), { timeout: 8_000 })
      .toBe("overset");
  });
});
