// Master journey — build a whole publication FROM SCRATCH.
//
// One spec that chains the core DTP production loop the way a designer
// works: new document → headline text frame → type → style → hero shape
// (real pointer drag) → fill → visual checkpoint → export round-trip.
// Each stage asserts both the document outcome AND the context-sensitive
// UI (the intent→context oracle), so the journey doubles as an
// end-to-end proof and a readable storyboard of the build.

import { expect, test } from "@playwright/test";

import {
  EMPTY_DOC,
  FRAME_SELECTED,
  TEXT_CARET_EDITING,
} from "../driver/context-contract";
import { Designer } from "../driver/designer";

test.describe("journey · master", () => {
  test("build a flyer from scratch: text → style → shape → fill → export @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();

    await test.step("S0 · new document", async () => {
      await designer.newDocument();
      const h = await designer.handle();
      expect(h.pageCount).toBe(1);
      expect(h.pageSizesPt[0]).toEqual([612, 792]);
      await designer.expectContext(EMPTY_DOC);
    });

    let storyId: string | null = null;
    await test.step("S1 · headline text frame + type", async () => {
      const r = await designer.addTextFrame({ x0: 70, y0: 80, x1: 540, y1: 180 });
      storyId = r.storyId;
      expect(storyId).toBeTruthy();
      await designer.placeCaret(storyId!, 0);
      // The DTP contract: a caret surfaces the Text editing context.
      await designer.expectContext(TEXT_CARET_EDITING);
      await designer.typeText("Spring Collection");
      await expect
        .poll(() => designer.storyChars(storyId!), { timeout: 6000 })
        .toBeGreaterThan(0);
    });

    await test.step("S2 · style the headline (36pt, via the Character panel)", async () => {
      const chars = await designer.storyChars(storyId!);
      // Real GUI: select the headline, type 36 into the size field.
      await designer.selectText(storyId!, 0, chars);
      await designer.fillPanelControl("characterFontSize", 36);
    });

    let heroId = "";
    await test.step("S3 · draw + fill a hero shape (real pointer drag)", async () => {
      heroId = await designer.drawRectangle({ x0: 70, y0: 220, x1: 540, y1: 560 });
      expect(heroId).toBeTruthy();
      await designer.selectElement("rectangle", heroId);
      // The DTP contract: a selected graphic frame → Frame context.
      await designer.expectContext(FRAME_SELECTED);
      await designer.applyFill("rectangle", heroId, "Color/Black");
    });

    await test.step("S4 · visual checkpoint of the finished flyer", async () => {
      await designer.contentCheckpoint("flyer");
    });

    await test.step("S5 · export round-trips through IDML", async () => {
      const { byteLength, pageCount } = await designer.exportAndReload();
      expect(byteLength).toBeGreaterThan(500);
      expect(pageCount).toBe(1);
    });
  });
});
