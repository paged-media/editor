// E2E op suite — text operations. Proves story-content edits land in
// the rendered document: insertText / deleteRange change the story
// model AND repaint the frame, and undo restores both byte-for-byte.
//
// applyStyle + insertField are notImplemented stubs (capability
// matrix: harness/capabilities.ts) — tracked there, asserted
// test.fixme here so they flip loudly the day core wires them.
//
// ENGINE BUG (found by this suite, 2026-06-05): undo()/redo() of a
// text op apply the inverse + rebuild but DON'T clear the
// body_story_emit_cache / master_text_emit_cache the way the forward
// apply_mutation does — so after undo the canvas keeps the stale
// post-edit text layout for the body story (model restores; one text
// line's pixels do not). The forward op + model restore are asserted
// hard; the strict undo-render check is owned by AC-E2E-TEXT-5
// (test.fail), which flips when core clears the caches on undo/redo.
const UNDO_TEXT_CACHE_BUG =
  "engine: undo/redo don't clear body_story_emit_cache (stale text render after undo)";

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

  test("AC-E2E-TEXT-1 — insertText grows the story and repaints the frame", async ({
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
      skipUndoPixelCheck: UNDO_TEXT_CACHE_BUG,
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

  test("AC-E2E-TEXT-2 — deleteRange shrinks the story and repaints the frame", async ({
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
      skipUndoPixelCheck: UNDO_TEXT_CACHE_BUG,
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

  test("AC-E2E-TEXT-5 — undo of a text edit restores the canvas byte-identically", async ({
    page,
  }) => {
    // Owns the strict undo-render check the two sandwiches above
    // waive. test.fail keeps CI green while the cache bug is open and
    // flips to an UNEXPECTED PASS the day core clears the text emit
    // caches on undo/redo — then delete this test.fail + the
    // skipUndoPixelCheck waivers above.
    test.fail(true, UNDO_TEXT_CACHE_BUG);
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

  // Capability-matrix-gated (harness/capabilities.ts): both are
  // notImplemented stubs today. Promote to live sandwiches when the
  // matrix probe flips them to "supported".
  test.fixme("AC-E2E-TEXT-3 — applyStyle attributes a character range (engine stub)", async () => {});
  test.fixme("AC-E2E-TEXT-4 — insertField inserts a page-number field (engine stub)", async () => {});
});
