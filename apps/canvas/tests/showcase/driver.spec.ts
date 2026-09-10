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

// `ShowcaseDoc`'s own tests.
//
// Sixteen page modules are written against this driver, so a wrong
// argument name in one of its wrappers would surface as sixteen
// confusing page failures rather than one clear driver failure. These
// pin the primitives against a real editor and a known fixture: the
// text one, because it ships stories, styles and swatches.
//
// The lookups are the part worth testing hardest. They resolve BY NAME
// and throw on a miss, which is the rule that keeps a drifted base
// fixture from silently producing a wrong-looking document — so the
// throw is asserted, not just the hit.

import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import { ShowcaseDoc } from "./driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = pathResolve(__dirname, "..", "..", "..", "..");
const FIXTURE = `${REPO_ROOT}/corpus/idml/generated/text.idml`;

test.describe("ShowcaseDoc", () => {
  test.setTimeout(120_000);

  test("authors a whole gesture in ONE batch @feat:stories-text.text.insert @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const doc = new ShowcaseDoc(page);
    await doc.load(FIXTURE);
    const pageId = await doc.pageId(0);
    const bounds: [number, number, number, number] = [60, 340, 400, 440];
    const text = "Deferred probe.";

    // Deferred mode: the same authoring code, queued. Inside the body
    // a mint answers with a C-15 handle — an id everywhere the driver
    // takes one — and the engine resolves it inside the batch.
    const { frame, storyId } = await doc.defer(async () => {
      const frame = await doc.textFrame(pageId, bounds);
      expect(frame.startsWith("$h:")).toBe(true);
      const storyId = await doc.storyOf(pageId, bounds);
      expect(storyId).toBe(frame);
      await doc.insertText(storyId, text);
      return { frame, storyId };
    });

    // Flushed: the handles now name real elements, and the document
    // holds exactly what the un-batched lane would have written.
    const realFrame = doc.resolve(frame);
    expect(realFrame.startsWith("$h:")).toBe(false);
    // A frame handle in a STORY position resolves to the story the
    // insert minted — the engine's own rule, mirrored here.
    const realStory = doc.resolveStory(storyId);
    expect(realStory).not.toBe(realFrame);
    expect(await doc.storyChars(storyId)).toBeGreaterThanOrEqual(text.length);
    // Addressable afterwards — the id survives the batch it was born in.
    await doc.select("textFrame", realFrame);
  });

  test("a chain linked inside one batch carries ONE story, and storyIds resolves a handle @feat:layout-model.text-frame-chain @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    const doc = new ShowcaseDoc(page);
    await doc.load(FIXTURE);
    const pageId = await doc.pageId(0);
    // Four short frames below the fixture's own frame (which ends at
    // y 546), each one line tall, so the pour below overflows through
    // every link.
    const boxes: Array<[number, number, number, number]> = [
      [60, 560, 400, 584],
      [60, 590, 400, 614],
      [60, 620, 400, 644],
      [60, 650, 400, 674],
    ];
    const text = "Threaded probe. ".repeat(60);

    // Queued: four handles. The first link flushes the mints (`from` /
    // `to` are not positions the driver rewrites), then the three links
    // ride ONE batch and the pour another — the story chapter's exact
    // shape, which batched authoring reported as a chain whose last
    // frame carried a story of its own.
    const { frames, storyA } = await doc.defer(async () => {
      const frames: string[] = [];
      for (const b of boxes) frames.push(await doc.textFrame(pageId, b));
      for (let i = 0; i + 1 < frames.length; i += 1) {
        await doc.linkFrames(frames[i], frames[i + 1]);
      }
      const storyA = await doc.storyOf(pageId, boxes[0]);
      await doc.insertText(storyA, text);
      return { frames, storyA };
    });

    // A handle compared against an ENGINE-reported list can never
    // match; `storyIds` is the story-position read a module compares
    // with, and a real id passes through it unchanged.
    const [realStory] = await doc.storyIds(storyA);
    expect(realStory.startsWith("$h:")).toBe(false);
    expect(realStory).toBe(doc.resolveStory(frames[0]));
    expect(realStory).not.toBe(doc.resolve(frames[0]));
    expect(await doc.storyIds(realStory)).toEqual([realStory]);
    expect(await doc.storyChars(realStory)).toBeGreaterThanOrEqual(text.length);

    // Every frame of the chain answers with the ONE story. A link's
    // target carries the SOURCE's story, not the one its own insert
    // minted — which the mint record still names, and which is why
    // `linkFrames` drops the target's box from the record and lets the
    // hit test answer.
    for (const [i, b] of boxes.entries()) {
      if (i > 0) expect(doc.resolveStory(frames[i])).not.toBe(realStory);
      expect(await doc.storyOf(pageId, b), `frame ${i} of the chain`).toBe(realStory);
    }
  });

  test("loads, enumerates pages, and authors a styled frame @feat:stories-text.text.insert @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const doc = new ShowcaseDoc(page);

    const count = await doc.load(FIXTURE);
    expect(count).toBeGreaterThan(0);

    const pages = await doc.pages();
    expect(pages.length).toBe(count);
    expect(pages[0].sizePt[0]).toBeGreaterThan(0);
    const pageId = await doc.pageId(0);
    expect(pageId).toBe(pages[0].selfId);

    // Author a frame, recover its story through the hit test, pour
    // text, and read the length back. This is the exact sequence every
    // page module opens with.
    // (x0, y0, x1, y1) — the helpers convert to wire order themselves.
    const bounds: [number, number, number, number] = [60, 500, 400, 600];
    const frame = await doc.textFrame(pageId, bounds);
    expect(frame).toBeTruthy();

    const storyId = await doc.storyOf(pageId, bounds);
    expect(storyId).toBeTruthy();

    const text = "Showcase driver probe.";
    await doc.insertText(storyId, text);
    expect(await doc.storyChars(storyId)).toBeGreaterThanOrEqual(text.length);

    // A style applied by NAME, resolved from the document's own list.
    const styles = (await doc.designer.collection("paragraphStyles")) as Array<{
      selfId: string;
      name?: string;
    }>;
    const named = styles.find((s) => s.name);
    expect(named, "the fixture ships at least one named style").toBeTruthy();
    const styleId = await doc.paragraphStyle(named!.name!);
    expect(styleId).toBe(named!.selfId);
    await doc.applyStyle(storyId, 0, text.length, styleId, "paragraph");
  });

  test("a missing name throws instead of taking an index @feat:stories-text.text.insert @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    const doc = new ShowcaseDoc(page);
    await doc.load(FIXTURE);
    // The rule the whole showcase rests on. If this ever starts
    // returning something, a drifted base fixture would produce a
    // wrong-looking document in silence instead of failing here.
    await expect(doc.paragraphStyle("No Such Style Exists")).rejects.toThrow(
      /no entry named/,
    );
  });

  test("a refused mutation throws with the engine's reason @feat:round-tripping.undo-redo @level:edge", async ({
    page,
  }) => {
    await openCanvas(page);
    const doc = new ShowcaseDoc(page);
    await doc.load(FIXTURE);
    // `client.mutate` RESOLVES on refusal — it does not reject — so a
    // driver that forwarded the promise would swallow every engine
    // error. Addressing a story that does not exist is the cheapest
    // way to prove the wrapper checks the reply kind.
    await expect(doc.insertText("Story/does-not-exist", "x")).rejects.toThrow(
      /refused/,
    );
  });

  test("exports a container and an IDML @feat:package-anatomy.paged-container @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const doc = new ShowcaseDoc(page);
    await doc.load(FIXTURE);
    const paged = await doc.exportPaged();
    expect(paged.subarray(0, 2).toString("latin1")).toBe("PK");
    const idml = await doc.exportIdml();
    expect(idml.subarray(0, 2).toString("latin1")).toBe("PK");
    // The container is the superset — same document, more parts.
    expect(paged.length).toBeGreaterThan(0);
  });

  test("renders a page and sees a change @feat:the-renderer.pipeline @level:happy", async ({
    page,
  }) => {
    await openCanvas(page);
    const doc = new ShowcaseDoc(page);
    await doc.load(FIXTURE);
    const before = await doc.renderPage(0, 612);
    expect(before.length).toBeGreaterThan(0);
    const pageId = await doc.pageId(0);
    const rect = await doc.rectangle(pageId, [40, 40, 300, 200]);
    expect(rect).toBeTruthy();
    await doc.expectRenderChanged(0, before);
  });
});
