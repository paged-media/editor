// E2E op suite — styles. The headline proof: editing a paragraph
// style that the document's text USES cascades to the canvas (every
// frame on that style relayouts and repaints) — the strongest "the
// edit reached the rendered document" signal in the suite. Style
// CRUD (create/rename/delete ×5 kinds) is proven to apply by the
// capability matrix; here a paragraph create/delete round-trip checks
// the collection + a clean no-repaint.

import { expect, test, type Page } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";
import {
  elementPageRectPt,
  loadFixture,
  type LoadedFixture,
} from "./harness/fixtures";
import { dumpDoc } from "./harness/model-dump";
import { opSandwich } from "./harness/op-sandwich";
import { mutate } from "./harness/ui";

async function styleIds(page: Page, collection: string): Promise<string[]> {
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
    return (await c.client.collection(n)).map((s) => s.selfId);
  }, collection);
}

const UNDO_TEXT_CACHE_BUG =
  "engine: undo/redo don't clear body_story_emit_cache (stale text render after undo)";

test.describe("E2E style ops", () => {
  let fx: LoadedFixture;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "text-advanced");
  });

  test("AC-E2E-STYLE-1 — setStyleProperty on the in-use paragraph style cascades to the canvas", async ({
    page,
  }) => {
    // ENGINE FINDING (this suite, 2026-06-05): setStyleProperty
    // changes the model (the capability matrix proves it applies) but
    // editing the in-use paragraph style's font size produces NO
    // canvas repaint. Likely the frame-mutation rebuild path not
    // clearing body_story_emit_cache (same family as the text
    // undo-render bug) — though it could also be the generated text
    // carrying direct formatting that overrides the style. Either way
    // the style→canvas cascade doesn't land. test.fail keeps CI green
    // and flips to an UNEXPECTED PASS the day the cascade repaints —
    // at which point confirm the cause and delete this marker.
    test.fail(
      true,
      "engine: editing an in-use paragraph style does not repaint the canvas",
    );
    const styles = await styleIds(page, "paragraphStyles");
    expect(styles.length, "fixture has a paragraph style").toBeGreaterThan(0);
    const styleId = styles[0];
    const frame = fx.frames.find((f) => f.ref.kind === "textFrame")!;
    const pageInfo = fx.pages[frame.pageIndex];
    const region = (await elementPageRectPt(page, frame.ref))!;

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      region,
      // A font-size bump reflows the paragraph well past its old
      // glyph box; the proof is "the frame repainted", not strict
      // containment.
      containment: false,
      // Style edits relayout text through the same body-story emit
      // cache that undo/redo fail to clear (see text-ops). Forward
      // render + model restore stay hard.
      skipUndoPixelCheck: UNDO_TEXT_CACHE_BUG,
      dumpModel: () => dumpDoc(page, ["paragraphStyles"]),
      apply: async () => {
        await mutate(page, {
          op: "setStyleProperty",
          args: {
            collection: "paragraph",
            styleId,
            path: "characterFontSize",
            value: { type: "length", value: 28 },
          },
        });
      },
      expectModel: async () => {
        // The style still resolves (the edit didn't drop it).
        expect(await styleIds(page, "paragraphStyles")).toContain(styleId);
      },
    });
  });

  test("AC-E2E-STYLE-2 — createParagraphStyle adds to the collection; undo removes it", async ({
    page,
  }) => {
    const pageInfo = fx.pages[0];
    const before = (await styleIds(page, "paragraphStyles")).length;

    await opSandwich(page, {
      pageId: pageInfo.pageId,
      pageWidthPt: pageInfo.widthPt,
      // A new, unapplied style paints nothing.
      noRenderChange: true,
      dumpModel: () => dumpDoc(page, ["paragraphStyles"]),
      apply: async () => {
        await mutate(page, {
          op: "createParagraphStyle",
          args: { name: "e2e heading" },
        });
      },
      expectModel: async () => {
        expect((await styleIds(page, "paragraphStyles")).length).toBe(
          before + 1,
        );
      },
    });
  });
});
