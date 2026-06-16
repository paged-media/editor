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

test.describe("E2E style ops", () => {
  let fx: LoadedFixture;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    fx = await loadFixture(page, "text-advanced");
  });

  test("AC-E2E-STYLE-1 — setStyleProperty on the in-use paragraph style cascades to the canvas @feat:styles.character.crud @feat:styles.object.crud @feat:styles.paragraph.crud @feat:styles.set-style-property @level:happy", async ({
    page,
  }) => {
    // ENGINE FINDING (2026-06-05) RESOLVED (2026-06-06): the engine's
    // style→text cascade repaints correctly (core regression guard:
    // paged-canvas tests/emit_cache_undo.rs
    // set_style_property_repaints_styled_text) — the no-repaint this
    // suite saw was the FIXTURE: the generated text-advanced story
    // carries direct PointSize="12" on its CharacterStyleRange, which
    // sits above the paragraph style in the cascade, so a style
    // font-size edit legitimately changes nothing visible. The test
    // now edits paragraphJustification — a property the fixture's
    // direct formatting does NOT override — so the cascade repaint is
    // actually exercised end-to-end.
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
      // Re-justified lines shift glyphs inside the frame box; the
      // proof is "the frame repainted", not strict containment.
      containment: false,
      dumpModel: () => dumpDoc(page, ["paragraphStyles"]),
      apply: async () => {
        await mutate(page, {
          op: "setStyleProperty",
          args: {
            collection: "paragraph",
            styleId,
            path: "paragraphJustification",
            value: { type: "text", value: "CenterAlign" },
          },
        });
      },
      expectModel: async () => {
        // The style still resolves (the edit didn't drop it).
        expect(await styleIds(page, "paragraphStyles")).toContain(styleId);
      },
    });
  });

  test("AC-E2E-STYLE-2 — createParagraphStyle adds to the collection; undo removes it @feat:styles.character.crud @feat:styles.object.crud @feat:styles.paragraph.crud @feat:styles.set-style-property @level:happy", async ({
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
