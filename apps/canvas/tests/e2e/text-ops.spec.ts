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

// E2E op suite — text operations. Proves story-content edits land in
// the rendered document: insertText / deleteRange change the story
// model AND repaint the frame, and undo restores both byte-for-byte.
//
// applyStyle + insertField are notImplemented stubs (capability
// matrix: harness/capabilities.ts) — tracked there, asserted
// test.fixme here so they flip loudly the day core wires them.
//
// ENGINE BUG (found 2026-06-05, FIXED in core 2026-06-06, protocol
// v27): undo()/redo() didn't clear body_story_emit_cache /
// master_text_emit_cache the way the forward apply paths do, so undo
// kept the stale post-edit text layout. Core now clears both caches
// on undo/redo (guarded engine-side by paged-canvas
// tests/emit_cache_undo.rs); the strict undo-render checks below
// assert it end-to-end.

import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type LoadedFixture,
} from "./harness/fixtures";
import { opSandwich } from "./harness/op-sandwich";
import { mutate } from "./harness/ui";

/** First story's character count via the stories() listing. */
async function storyChars(page: import("@playwright/test").Page, id: string) {
  return page.evaluate(async (storyId) => {
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
      characterCount: number;
    }>;
    return stories.find((s) => s.selfId === storyId)?.characterCount ?? -1;
  }, id);
}

test.describe("E2E text ops", () => {
  let fx: LoadedFixture;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "text");
  });

  test("AC-E2E-TEXT-1 — insertText grows the story and repaints the frame @feat:stories-text.text.delete @feat:stories-text.text.insert @level:happy", async ({
    page,
  }) => {
    expect(fx.firstStory, "text fixture has a story").toBeTruthy();
    const story = fx.firstStory!;
    const frame = fx.frames.find((f) => f.ref.kind === "textFrame")!;
    const pageInfo = fx.pages[frame.pageIndex];
    const region = (await elementPageRectPt(page, frame.ref))!;
    const before = await storyChars(page, story.selfId);

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      // Text reflow can nudge glyphs to the frame edge; the key
      // proof is "changed inside", not strict containment.
      containment: false,
      apply: async () => {
        // No stable typing UI yet (Type tool pending) — the story
        // edit rides the wire, exactly as the glyphs panel / script
        // host commit it. The render + model + undo sandwich is the
        // proof it reached the canvas.
        await mutate(page, {
          op: "insertText",
          args: { storyId: story.selfId, offset: 0, text: "Zzz " },
        });
      },
      expectModel: async () => {
        expect(await storyChars(page, story.selfId)).toBe(before + 4);
      },
      expectRestored: async () => {
        expect(await storyChars(page, story.selfId)).toBe(before);
      },
    });
  });

  test("AC-E2E-TEXT-2 — deleteRange shrinks the story and repaints the frame @feat:stories-text.text.delete @feat:stories-text.text.insert @level:happy", async ({
    page,
  }) => {
    const story = fx.firstStory!;
    const frame = fx.frames.find((f) => f.ref.kind === "textFrame")!;
    const pageInfo = fx.pages[frame.pageIndex];
    const region = (await elementPageRectPt(page, frame.ref))!;
    const before = await storyChars(page, story.selfId);

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      apply: async () => {
        await mutate(page, {
          op: "deleteRange",
          args: { storyId: story.selfId, start: 0, end: 5 },
        });
      },
      expectModel: async () => {
        expect(await storyChars(page, story.selfId)).toBe(before - 5);
      },
      expectRestored: async () => {
        expect(await storyChars(page, story.selfId)).toBe(before);
      },
    });
  });

  test("AC-E2E-TEXT-5 — undo of a text edit restores the canvas byte-identically @feat:stories-text.text.delete @feat:stories-text.text.insert @level:happy", async ({
    page,
  }) => {
    // Owns the strict undo-render check (the byte-identical pixel
    // assertion inside the sandwich). Was a test.fail until core
    // cleared the text emit caches on undo/redo (2026-06-06).
    const story = fx.firstStory!;
    const frame = fx.frames.find((f) => f.ref.kind === "textFrame")!;
    const pageInfo = fx.pages[frame.pageIndex];
    const region = (await elementPageRectPt(page, frame.ref))!;

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      apply: async () => {
        await mutate(page, {
          op: "insertText",
          args: { storyId: story.selfId, offset: 0, text: "Zzz " },
        });
      },
      expectModel: async () => {
        expect(await storyChars(page, story.selfId)).toBeGreaterThan(0);
      },
    });
  });

  // W2.9 — both ops were notImplemented stubs at the original W2.11 pass;
  // the v35 wasm bump flipped them to "supported" in the empirical
  // capability matrix (harness/capabilities.ts: applyStyle + insertField),
  // so the fixmes below are promoted to live op-sandwiches. The matrix
  // probe (capability-matrix.spec.ts) owns the support classification;
  // these assert the user-visible domain effect (render + model + undo).

  test("AC-E2E-TEXT-3 — applyStyle attributes a contrasting paragraph style and REPAINTS the run @feat:stories-text.text.delete @feat:stories-text.text.insert @level:happy", async ({
    page,
  }) => {
    // W2.1 — the `text` fixture ships a deliberately-contrasting named
    // paragraph style "Emphasis Display" (28pt / RGB cyan / centred vs
    // the 12pt black left default — see the paged-gen `text` sample).
    // Resolve it BY NAME: this spec once took the LAST collection entry,
    // and when core ac30eb9 appended a visually-no-op NestedDemo style to
    // the regenerated fixture, "last" silently became a zero-pixel apply
    // and the repaint assertion went red for two months while the engine
    // was innocent (audit 17082026). Applying the named style produces a
    // real render delta: the mutation lands, the story length is
    // unchanged (attribute-only), the frame REPAINTS, and undo restores
    // the model + pixels byte-identically.
    const story = fx.firstStory!;
    expect(story, "text fixture has a story").toBeTruthy();
    const styleId = await collectionIdByName(
      page,
      "paragraphStyles",
      "Emphasis Display",
    );
    expect(styleId, "fixture ships the Emphasis Display style").toBeTruthy();
    const frame = fx.frames.find((f) => f.ref.kind === "textFrame")!;
    const pageInfo = fx.pages[frame.pageIndex];
    const region = (await elementPageRectPt(page, frame.ref))!;
    const before = await storyChars(page, story.selfId);

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      // The restyle resizes glyphs (12pt → 28pt) and re-centres them, so
      // the line reflows inside the frame — relax containment.
      containment: false,
      apply: async () => {
        const reply = (await mutate(page, {
          op: "applyStyle",
          args: {
            storyId: story.selfId,
            start: 0,
            end: 1,
            style: styleId,
            scope: "paragraph",
          },
        })) as { kind: string };
        expect(reply.kind, "applyStyle accepted by the engine").toBe(
          "mutationApplied",
        );
      },
      expectModel: async () => {
        // Attribute-only: the story keeps its length.
        expect(await storyChars(page, story.selfId)).toBe(before);
      },
      expectRestored: async () => {
        expect(await storyChars(page, story.selfId)).toBe(before);
      },
    });
  });

  test("AC-E2E-TEXT-4 — insertField inserts a page-number field and repaints @feat:stories-text.text.delete @feat:stories-text.text.insert @level:happy", async ({
    page,
  }) => {
    // A page-number field is one character in the story stream; inserting
    // it grows the count by 1 and undo restores it (the field char round-
    // trips like any other glyph).
    const story = fx.firstStory!;
    expect(story, "text fixture has a story").toBeTruthy();
    const frame = fx.frames.find((f) => f.ref.kind === "textFrame")!;
    const pageInfo = fx.pages[frame.pageIndex];
    const region = (await elementPageRectPt(page, frame.ref))!;
    const before = await storyChars(page, story.selfId);

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      containment: false,
      apply: async () => {
        await mutate(page, {
          op: "insertField",
          args: { storyId: story.selfId, offset: 0, field: "pageNumber" },
        });
      },
      expectModel: async () => {
        // The field occupies one character slot in the story stream.
        expect(await storyChars(page, story.selfId)).toBe(before + 1);
      },
      expectRestored: async () => {
        expect(await storyChars(page, story.selfId)).toBe(before);
      },
    });
  });
});

/** Resolve a style/swatch collection entry BY NAME. Positional lookups
 *  ("the last entry") couple the spec to fixture regeneration order —
 *  the exact drift that broke AC-E2E-TEXT-3 (audit 17082026). */
async function collectionIdByName(
  page: import("@playwright/test").Page,
  collection: string,
  styleName: string,
): Promise<string | null> {
  return page.evaluate(
    async ({ n, wanted }) => {
      const c = (
        globalThis as unknown as {
          __canvas: {
            client: {
              collection: (
                n: string,
              ) => Promise<Array<{ selfId: string; name?: string }>>;
            };
          };
        }
      ).__canvas;
      const items = await c.client.collection(n);
      return (
        items.find((i) => i.name === wanted)?.selfId ??
        // Fall back to a selfId substring match — some collections carry
        // the display name only inside the IDML self id.
        items.find((i) => i.selfId.includes(wanted.replace(/\s+/g, "")))
          ?.selfId ??
        null
      );
    },
    { n: collection, wanted: styleName },
  );
}
