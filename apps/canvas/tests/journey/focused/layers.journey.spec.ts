// Journey: layer management.
//
// Exercises the Layers panel domain — add a layer, then toggle its
// visibility — the way a designer organises artwork. Asserts the layer
// model reflects each operation.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · layers", () => {
  test("add a layer and toggle its visibility @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:layers.ops @feat:editor-shell.panels.layers @level:happy", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const before = (await designer.layers()).length;
    const layerId = await designer.addLayer("Artwork");
    expect(layerId, "new layer should have an id").toBeTruthy();
    expect((await designer.layers()).length).toBe(before + 1);

    // Hide it…
    await designer.setLayerVisible(layerId, false);
    await expect
      .poll(async () =>
        (await designer.layers()).find((l) => l.selfId === layerId)?.visible,
      )
      .toBe(false);

    // …and show it again.
    await designer.setLayerVisible(layerId, true);
    await expect
      .poll(async () =>
        (await designer.layers()).find((l) => l.selfId === layerId)?.visible,
      )
      .toBe(true);
  });
});
