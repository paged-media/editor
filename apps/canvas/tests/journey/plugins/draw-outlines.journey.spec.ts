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

// Journey: paged.draw CREATE OUTLINES — Draw ▸ Type ▸ Create outlines
// (media.paged.draw.command.createOutlines).
//
// The command asks the engine for the text frame's glyph outlines
// (`requestTextOutlines`, protocol 66 — the renderer's own glyph fills,
// in page space), inserts them as ONE compound path per colour, and
// deletes the frame — one batch, one undo step. The oracle is the model:
//   · the text frame is gone and exactly one new path stands in for a
//     one-colour line of type;
//   · the path is a COMPOUND of glyph contours (one per glyph at least,
//     and the "o" keeps its counter as a contour inside it), lying inside
//     the frame the text was set in;
//   · the outlines RENDER (the page is not blank);
//   · one undo restores the frame with its story text intact.
//
// The new document's text composes in the engine's default face, which
// the outline read uses as-is: no font registration is needed for the
// glyphs to exist (a registered face would only change WHICH glyphs).

import { expect, test } from "@playwright/test";

import { treeIds } from "../../e2e/harness/viewport";
import { Designer } from "../driver/designer";

interface PathAnchorsResult {
  anchors: Array<{ anchor: [number, number] }>;
  subpathStarts: number[];
  itemTransform?: number[] | null;
}

async function pathAnchorsOf(
  page: import("@playwright/test").Page,
  ref: { kind: string; id: string },
): Promise<PathAnchorsResult | null> {
  return page.evaluate(async (r) => {
    const c = (
      globalThis as unknown as {
        __canvas: { client: { pathAnchors: (id: unknown) => Promise<PathAnchorsResult | null> } };
      }
    ).__canvas;
    return c.client.pathAnchors(r).catch(() => null);
  }, ref);
}

test.describe("journey · paged.draw create outlines", () => {
  test("a designer turns a line of type into outline paths @feat:plugin-draw.pro-path-toolset @feat:frames-paths.path.insert @feat:plugin-platform.bind-created @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // ── 0. NEGATIVE CONTROL. ──
    const blankA = await designer.renderBytes();
    const blankB = await designer.renderBytes();
    await designer.expectRenderStable(blankA, blankB);

    // ── 1. SET A LINE OF TYPE — a frame, a caret, real keystrokes. ──
    const frame = { x0: 100, y0: 200, x1: 500, y1: 280 };
    const { frameId, storyId } = await designer.addTextFrame(frame);
    expect(frameId, "made a text frame").not.toBe("");
    expect(storyId, "the frame has a story").not.toBeNull();
    await designer.placeCaret(storyId!, 0);
    await designer.typeText("Hello");
    await expect.poll(() => designer.storyChars(storyId!), { timeout: 6_000 }).toBe(5);
    await designer.expectRenderChangesFrom(blankA);

    await designer.selectElement("textFrame", frameId);
    const framesBefore = await designer.count("textFrame");
    const polysBefore = await treeIds(page, "polygon");

    // ── 2. CREATE OUTLINES — the frame goes, one compound path comes. ──
    await designer.runCommand("media.paged.draw.command.createOutlines");
    await expect
      .poll(() => designer.count("textFrame"), { timeout: 10_000 })
      .toBe(framesBefore - 1);
    await expect
      .poll(async () => (await treeIds(page, "polygon")).length, { timeout: 8_000 })
      .toBe(polysBefore.length + 1);
    const outline = (await treeIds(page, "polygon")).find(
      (p) => !polysBefore.some((b) => b.id === p.id),
    )!;
    const model = await pathAnchorsOf(page, outline);
    expect(model, "the outline path has a readable model").not.toBeNull();
    // H, e, l, l, o — five glyphs, so at least five contours, and the
    // "o" keeps its COUNTER: a contour whose box lies strictly inside
    // another's (how many contours "e" takes is the face's business).
    const boxes = model!.subpathStarts.map((start, i, starts) => {
      const run = model!.anchors.slice(start, starts[i + 1] ?? model!.anchors.length);
      const xs = run.map((a) => a.anchor[0]);
      const ys = run.map((a) => a.anchor[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
    });
    expect(boxes.length, "one contour per glyph at least").toBeGreaterThanOrEqual(5);
    const hasCounter = boxes.some((inner, i) =>
      boxes.some(
        (outer, j) =>
          i !== j &&
          inner[0] > outer[0] &&
          inner[1] > outer[1] &&
          inner[2] < outer[2] &&
          inner[3] < outer[3],
      ),
    );
    expect(hasCounter, "a counter survives as a contour inside its glyph").toBe(true);
    // The glyphs lie where the text was set (page space, inside the frame).
    for (const a of model!.anchors) {
      expect(a.anchor[0]).toBeGreaterThanOrEqual(frame.x0 - 1);
      expect(a.anchor[0]).toBeLessThanOrEqual(frame.x1 + 1);
      expect(a.anchor[1]).toBeGreaterThanOrEqual(frame.y0 - 1);
      expect(a.anchor[1]).toBeLessThanOrEqual(frame.y1 + 1);
    }
    // The outlines render: the page is not blank.
    await designer.expectRenderChangesFrom(blankA);

    // ── 3. ONE UNDO — the frame and its story come back. ──
    await designer.runCommand("paged.editor.undo");
    await expect
      .poll(() => designer.count("textFrame"), { timeout: 8_000 })
      .toBe(framesBefore);
    await expect
      .poll(async () => (await treeIds(page, "polygon")).length, { timeout: 8_000 })
      .toBe(polysBefore.length);
    await expect.poll(() => designer.storyChars(storyId!), { timeout: 6_000 }).toBe(5);
  });
});
