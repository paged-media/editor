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

  test("AC-E2E-TEXT-3 — applyStyle attributes a paragraph-style range (wire-accepted, undo round-trips)", async ({
    page,
  }) => {
    // applyStyle takes a NAMED style ref + scope (v28 shape); range
    // character attributes go through setElementProperty / the splitters.
    //
    // HONEST SEAM (not a full op-sandwich): applyStyle is attribute-only
    // and changes NO character count, and the generated `text` fixture
    // doesn't deterministically expose a paragraph style whose VISUAL
    // properties contrast with the one the body paragraph already carries
    // — so a render-diff sandwich produces zero changed pixels (the swap
    // is visually identical). Building a guaranteed-contrasting style
    // would reach into the paragraph-styles surface (another agent's
    // ground). What the v35 wire DOES now guarantee (empirically, via the
    // capability matrix probe — harness/capabilities.ts marks applyStyle
    // "supported") is that the op APPLIES and undo restores; that is what
    // this test pins: the mutation is accepted (mutationApplied, not
    // mutationFailed), the story survives intact, and undo round-trips.
    // The render-diff proof stays the matrix's job until a contrasting
    // style is wired into the fixture.
    const story = fx.firstStory!;
    expect(story, "text fixture has a story").toBeTruthy();
    const styleId = await lastCollectionId(page, "paragraphStyles");
    expect(styleId, "fixture has at least one paragraph style").toBeTruthy();
    const before = await storyChars(page, story.selfId);

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
    // The v35 wire accepts the op (vs. the pre-v35 notImplemented reject).
    expect(reply.kind, "applyStyle accepted by the engine").toBe(
      "mutationApplied",
    );
    // Attribute-only: the story keeps its length.
    expect(await storyChars(page, story.selfId)).toBe(before);

    // Undo round-trips at the model level (char count stable across the
    // undo — applyStyle's inverse restores the prior style attribution).
    const undo = (await page.evaluate(async () => {
      const c = (
        globalThis as unknown as {
          __canvas: { client: { undo: () => Promise<{ kind: string }> } };
        }
      ).__canvas;
      return c.client.undo();
    })) as { kind: string };
    expect(undo.kind, "undo of applyStyle accepted").toBe("undoApplied");
    expect(await storyChars(page, story.selfId)).toBe(before);
  });

  test("AC-E2E-TEXT-4 — insertField inserts a page-number field and repaints", async ({
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

/** Last (most-recently-defined) id in a style/swatch collection — the
 *  applyStyle test needs a real paragraph-style ref to attribute. */
async function lastCollectionId(
  page: import("@playwright/test").Page,
  name: string,
): Promise<string | null> {
  return page.evaluate(async (n) => {
    const c = (
      globalThis as unknown as {
        __canvas: {
          client: {
            collection: (n: string) => Promise<Array<{ selfId: string }>>;
          };
        };
      }
    ).__canvas;
    const items = await c.client.collection(n);
    return items[items.length - 1]?.selfId ?? null;
  }, name);
}
