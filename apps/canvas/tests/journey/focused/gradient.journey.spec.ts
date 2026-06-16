// Journey: build and apply a gradient.
//
// Two brand swatches → a linear gradient between them → applied as a
// frame fill, with a visual checkpoint proving the gradient rendered.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · gradient", () => {
  test("create a linear gradient and fill a shape with it", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const red = await designer.createSwatch("Red", [220, 30, 30]);
    const blue = await designer.createSwatch("Blue", [30, 60, 220]);
    const grad = await designer.createGradient("Sunset", [red, blue]);
    expect(grad, "gradient should have an id").toBeTruthy();

    const id = await designer.drawRectangle({ x0: 90, y0: 120, x1: 460, y1: 320 });
    await designer.selectElement("rectangle", id);
    await designer.applyFill("rectangle", id, grad);

    await designer.contentCheckpoint("gradient-fill");
  });
});
