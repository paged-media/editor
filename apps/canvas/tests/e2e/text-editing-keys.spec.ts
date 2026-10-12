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

// The keys a writer reaches for inside a text frame, driven through the
// real window keyboard handler (`useTextEditing`) and the real viewport
// pointer path, with every assertion read back from the engine.
//
// Each test here pins a defect that recording the product films on
// 2026-10-12 caught:
//
//   ED-1  Escape did not end text editing: the next key typed into the text.
//   ED-2  No text paste: Cmd+V with a caret did nothing (nor copy / cut).
//   ED-18 The first key after End was lost: "for" + End + " A" → "forA".

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../journey/driver/designer";
import { screenPoint } from "./harness/viewport";

interface Sel {
  storyId: string;
  start: number;
  end: number;
}

type CanvasGlobal = {
  __canvas: {
    contentSelection: Sel | null;
    elementSelection: Array<{ kind: string; id: string }>;
    activeTool: string;
    client: {
      send: (m: unknown) => Promise<{
        kind: string;
        payload: {
          content?: {
            paragraphs: Array<{ runs: Array<{ text: string }> }>;
          } | null;
        };
      }>;
      caretGeometry: (s: Sel) => Promise<{
        xPt: number;
        topPt: number;
        heightPt: number;
      } | null>;
      camera: { read: () => { scale: number; tx: number; ty: number } };
      setElementSelection: (ids: unknown[], mode: string) => Promise<unknown[]>;
      undo: () => Promise<unknown>;
    };
    registries: {
      commands: { invoke: (id: string) => Promise<unknown> };
      menus: { list: () => Array<{ path: string; command: string }> };
    };
  };
};

/** The story's text, paragraphs joined with "\n" (the engine's own
 *  inter-paragraph boundary), read from the engine — not the mirror. */
async function storyText(page: Page, storyId: string): Promise<string | null> {
  return page.evaluate(async (sid) => {
    const c = (globalThis as unknown as CanvasGlobal).__canvas.client;
    const r = await c.send({
      kind: "requestStoryContent",
      payload: { storyId: sid },
    });
    const content = r.payload.content;
    if (!content) return null;
    return content.paragraphs
      .map((p) => p.runs.map((run) => run.text).join(""))
      .join("\n");
  }, storyId);
}

const contentSelection = (page: Page) =>
  page.evaluate(
    () => (globalThis as unknown as CanvasGlobal).__canvas.contentSelection,
  );

const elementSelection = (page: Page) =>
  page.evaluate(
    () => (globalThis as unknown as CanvasGlobal).__canvas.elementSelection,
  );

/** A blank document holding one text frame with `text` in its story. */
async function docWithText(
  page: Page,
  text: string,
): Promise<{ d: Designer; frameId: string; storyId: string }> {
  const d = new Designer(page);
  await d.open();
  await d.newDocument();
  const { frameId, storyId } = await d.addTextFrame({
    x0: 72,
    y0: 72,
    x1: 360,
    y1: 220,
  });
  expect(storyId, "the new frame's story").toBeTruthy();
  await page.evaluate(
    async ({ sid, t }) => {
      const c = (globalThis as unknown as {
        __canvas: { client: { mutate: (m: unknown) => Promise<unknown> } };
      }).__canvas.client;
      await c.mutate({
        op: "insertText",
        args: { storyId: sid, offset: 0, text: t },
      });
    },
    { sid: storyId!, t: text },
  );
  await expect.poll(() => storyText(page, storyId!)).toBe(text);
  return { d, frameId, storyId: storyId! };
}

/** Click into the story with the Type tool at `offset` — the real
 *  pointer path that places a caret — and wait for the caret. */
async function clickCaret(
  page: Page,
  d: Designer,
  storyId: string,
  offset: number,
): Promise<void> {
  await d.activate("type");
  const geo = await page.evaluate(
    async ({ sid, off }) =>
      (globalThis as unknown as CanvasGlobal).__canvas.client.caretGeometry({
        storyId: sid,
        start: off,
        end: off,
      }),
    { sid: storyId, off: offset },
  );
  expect(geo, "caret geometry").toBeTruthy();
  const pt = await screenPoint(page, geo!.xPt + 0.5, geo!.topPt + geo!.heightPt / 2);
  await page.mouse.click(pt.x, pt.y);
  await expect
    .poll(async () => (await contentSelection(page))?.storyId ?? null)
    .toBe(storyId);
  // Keystrokes must reach the window handler, not a focused panel input.
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body) el.blur?.();
  });
}

test.describe("text editing keys (film defects)", () => {
  test("ED-18 — keys typed right after End land after the line end (the first space survives) @feat:editor-tools.text.caret-typing @feat:stories-text.caret-selection @level:edge", async ({
    page,
  }) => {
    const { d, storyId } = await docWithText(page, "for");
    await clickCaret(page, d, storyId, 0);

    // End round-trips to the engine for the line's extent; the next keys
    // arrive while that answer is still in flight. They must wait for it
    // rather than land at the old caret and then have the late answer
    // drag the caret back over them.
    await page.keyboard.press("End");
    await page.keyboard.type(" A");

    await expect.poll(() => storyText(page, storyId)).toBe("for A");
    const sel = await contentSelection(page);
    expect(sel?.start).toBe(5);
    expect(sel?.end).toBe(5);
  });

  test("ED-1 — Escape ends text editing: the frame is selected, the Selection tool is active, and V types nothing @feat:editor-tools.text.caret-typing @feat:editor-shell.keyboard-shortcuts @level:edge", async ({
    page,
  }) => {
    const { d, frameId, storyId } = await docWithText(page, "Headline");
    await clickCaret(page, d, storyId, 4);

    await page.keyboard.press("Escape");

    // Out of the text: no caret, the frame that held it selected, and the
    // Selection tool in hand (InDesign's Escape from the Type tool).
    await expect.poll(() => contentSelection(page)).toBeNull();
    await expect
      .poll(async () => (await elementSelection(page)).map((e) => e.id))
      .toEqual([frameId]);
    await expect(
      page.locator('[data-tool-slot="select"][data-active="true"]'),
    ).toBeVisible();

    // The key that used to be typed into the headline.
    await page.keyboard.press("v");
    await page.waitForTimeout(300);
    expect(await storyText(page, storyId)).toBe("Headline");
  });

  test("ED-2 — Cmd+V pastes plain text at the caret as one undoable insert; Cmd+C / Cmd+X copy and cut the range @feat:stories-text.text.insert @feat:stories-text.text.delete @feat:editor-tools.text.caret-typing @level:happy", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const { d, storyId } = await docWithText(page, "Hello world");
    await clickCaret(page, d, storyId, 5);
    await page.keyboard.press("End");
    await expect.poll(async () => (await contentSelection(page))?.start).toBe(11);

    // Two lines in, two paragraphs out; CRLF from another app is one break.
    await page.evaluate(() =>
      navigator.clipboard.writeText(", again\r\nSecond paragraph"),
    );
    await page.keyboard.press("ControlOrMeta+V");
    await expect
      .poll(() => storyText(page, storyId))
      .toBe("Hello world, again\nSecond paragraph");
    // The caret follows the pasted text.
    const after = await contentSelection(page);
    expect(after?.start).toBe(after?.end);
    expect(after?.start).toBe("Hello world, again\nSecond paragraph".length);

    // One undo step takes the whole paste back.
    await page.keyboard.press("ControlOrMeta+Z");
    await expect.poll(() => storyText(page, storyId)).toBe("Hello world");

    // Copy a range, then cut it.
    await page.evaluate(
      ({ sid }) => {
        const c = (globalThis as unknown as {
          __canvas: { setContentSelection: (s: unknown) => void };
        }).__canvas;
        c.setContentSelection({ storyId: sid, start: 0, end: 5 });
      },
      { sid: storyId },
    );
    await expect.poll(async () => (await contentSelection(page))?.end).toBe(5);
    await page.keyboard.press("ControlOrMeta+C");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("Hello");
    expect(await storyText(page, storyId)).toBe("Hello world");

    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.keyboard.press("ControlOrMeta+X");
    await expect.poll(() => storyText(page, storyId)).toBe(" world");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("Hello");
    const cut = await contentSelection(page);
    expect(cut?.start).toBe(0);
    expect(cut?.end).toBe(0);
  });
});
