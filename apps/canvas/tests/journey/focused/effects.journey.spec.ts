// Journey: apply an effect.
//
// Exercises the Effects panel domain — draw + fill a shape, then add a
// drop shadow — with a visual checkpoint proving the effect rendered.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · effects", () => {
  test("apply a drop shadow to a filled shape @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @level:happy", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const id = await designer.drawRectangle({ x0: 140, y0: 160, x1: 360, y1: 340 });
    expect(id).toBeTruthy();
    await designer.applyFill("rectangle", id, "Color/Black");
    await designer.applyDropShadow("rectangle", id, 12);

    await designer.contentCheckpoint("drop-shadow");
  });
});
