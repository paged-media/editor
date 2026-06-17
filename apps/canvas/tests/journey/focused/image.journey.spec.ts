// Journey: place an image.
//
// The full DTP "place an image" loop: draw a frame (real pointer drag),
// set its image link (PlaceImage → the Image context surfaces), and
// serve its pixels through the C-6 resource-tile provider (claim +
// submit → the renderer assembles the tiles). Asserts BOTH the Image
// inspector (Transform + Frame Fitting + Stroke) and that the image
// content renders.

import { expect, test } from "@playwright/test";

import { IMAGE_FRAME } from "../driver/context-contract";
import { Designer } from "../driver/designer";

test.describe("journey · image", () => {
  test("placing an image surfaces the Image context and renders it @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const id = await designer.drawRectangle({ x0: 90, y0: 120, x1: 350, y1: 320 });
    expect(id, "frame should be created by the drag").toBeTruthy();

    // Set the image link (→ Image context) and serve the pixels (→ render).
    expect(await designer.placeImageLink(id)).toBe(true);
    await designer.serveTiledImage(id);

    // The oracle: a placed-image frame → Image context (Frame Fitting).
    await designer.selectElement("rectangle", id);
    await designer.expectContext(IMAGE_FRAME);
    // Chrome visual: the Properties panel in its Image inspector mode
    // (Frame Fitting) — the third distinct context after Text and Frame.
    await designer.chromeCheckpoint("properties-image");

    // The image content renders on the page.
    await designer.contentCheckpoint("placed-image");
  });
});
