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

// Journey: one web source FLOWS through three frames, and the flow
// RE-BREAKS when a frame is resized.
//
//   1. insert a web frame holding an article of numbered words, mint two
//      more frames, select [source, second, third] and "Thread web flow
//      into frames" — the chain is saved on the source's label;
//   2. the canvas follows without a render command (auto render on the
//      label change): every frame holds part of the article, in order, and
//      the three frames together hold EVERY word exactly once;
//   3. halve the source frame's height — the flow re-breaks: the first
//      frame holds fewer words, later frames more, and the text is still
//      conserved (no word lost, none duplicated).
//
// The numbered words make conservation exact: the concatenation of the
// frames' scene text, in chain order, must equal the source's word list.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../driver/designer";
import {
  THREAD,
  boundsOf,
  insertWebFrameWith,
  invoke,
  mutate,
  sceneText,
  select,
  tapSceneLayers,
  webSource,
  words,
  type ElementRef,
} from "./web-kit";

const WORDS = Array.from({ length: 150 }, (_, i) => `w${String(i + 1).padStart(3, "0")}`);
const HTML = [0, 50, 100]
  .map((start) => `<p>${WORDS.slice(start, start + 50).join(" ")}</p>`)
  .join("\n");
const CSS = "p { margin: 0 0 8px; font: 14px/20px Inter, sans-serif; color: #101820; }";

async function insertFrame(page: Page, pageId: string, bounds: number[]): Promise<ElementRef> {
  const reply = await mutate(page, { op: "insertFrame", args: { pageId, bounds } });
  expect(reply.kind).toBe("mutationApplied");
  return reply.payload!.createdId!;
}

/** Each frame's words, in chain order. */
async function distribution(page: Page, chain: ElementRef[]): Promise<string[][]> {
  const out: string[][] = [];
  for (const f of chain) out.push(words(await sceneText(page, f.id)));
  return out;
}

test.describe("journey · paged.web flow re-breaks on resize", () => {
  test("a web flow threaded through three frames re-breaks when a frame is resized, conserving the text @feat:plugin-web.flow-threading @feat:plugin-web.auto-render @feat:plugin-web.engine-rendering @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();
    await tapSceneLayers(page);

    const { pageIds } = await designer.handle();
    const source = await insertWebFrameWith(page, HTML, CSS);
    const b = await boundsOf(page, source);
    const h = b[2] - b[0];
    const w = b[3] - b[1];
    const second = await insertFrame(page, pageIds[0]!, [b[2] + 20, b[1], b[2] + 20 + h, b[3]]);
    const third = await insertFrame(page, pageIds[0]!, [b[0], b[3] + 20, b[2], b[3] + 20 + w]);
    const chain = [source, second, third];

    // ── 1. Thread: the chain is saved on the source's label. ──
    await select(page, chain);
    await invoke(page, THREAD);
    await expect
      .poll(async () => (await webSource(page, source))?.flow?.recipients.map((r) => r.id), {
        timeout: 10_000,
      })
      .toEqual([second.id, third.id]);

    // ── 2. Rendered across all three, every word exactly once. ──
    let before: string[][] = [];
    await expect
      .poll(
        async () => {
          before = await distribution(page, chain);
          return before.flat();
        },
        { timeout: 20_000, message: "the three frames hold the article, in order" },
      )
      .toEqual(WORDS);
    for (const [i, part] of before.entries()) {
      expect(part.length, `frame ${i + 1} holds part of the flow`).toBeGreaterThan(0);
    }
    const pixels = await designer.renderBytes();

    // ── 3. Halve the source frame: the flow re-breaks, text conserved. ──
    const resized = await mutate(page, {
      op: "resizeFrame",
      args: { frameId: source.id, bounds: [b[0], b[1], b[0] + h / 2, b[3]] },
    });
    expect(resized.kind).toBe("mutationApplied");
    let after: string[][] = [];
    await expect
      .poll(
        async () => {
          after = await distribution(page, chain);
          return after[0]!.length < before[0]!.length && after.flat().join(" ") === WORDS.join(" ");
        },
        { timeout: 20_000, message: "the flow re-broke after the resize, conserving the text" },
      )
      .toBe(true);
    expect(after.flat(), "every word once, in order").toEqual(WORDS);
    expect(after[1]![0], "the second frame now starts earlier in the article").not.toBe(
      before[1]![0],
    );
    test.info().annotations.push({
      type: "flow",
      description: `words per frame ${before.map((p) => p.length).join("/")} → ${after
        .map((p) => p.length)
        .join("/")}`,
    });
    await designer.expectRenderChangesFrom(pixels);
  });
});
