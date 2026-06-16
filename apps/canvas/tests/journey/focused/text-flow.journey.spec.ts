// Journey: text editing context.
//
// The DTP heart of the oracle — when a caret lands in a text frame, the
// editor must present the Text context (Character + Paragraph), the way
// InDesign does. Hybrid: the frame is channel-seeded (setup); the caret
// + typing are driven through the real content-selection + keyboard
// path (the step under test).

import { expect, test } from "@playwright/test";

import { TEXT_CARET_EDITING } from "../driver/context-contract";
import { Designer } from "../driver/designer";

test.describe("journey · text flow", () => {
  test("a caret in a text frame surfaces the Text context; typing inserts @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @level:gesture", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const { storyId } = await designer.addTextFrame({
      x0: 80,
      y0: 80,
      x1: 320,
      y1: 200,
    });
    expect(storyId, "new text frame should have a parent story").toBeTruthy();

    // Real input: place the caret, then assert the context-sensitive UI
    // responded the way a DTP user expects.
    await designer.placeCaret(storyId!, 0);
    await designer.expectContext(TEXT_CARET_EDITING);
    // Chrome visual: the Properties panel in its Text inspector mode
    // (Character + Paragraph) — the context-sensitive UX, locked.
    await designer.chromeCheckpoint("properties-text");

    // And the real keyboard path inserts into the story.
    const before = await designer.storyChars(storyId!);
    await designer.typeText("Hello world");
    await expect
      .poll(() => designer.storyChars(storyId!), { timeout: 6000 })
      .toBeGreaterThan(before);
  });
});
