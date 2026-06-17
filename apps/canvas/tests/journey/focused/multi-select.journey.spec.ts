// Journey: multi-selection context.
//
// Draw two shapes (real pointer drags) and select both — the Align /
// Distribute situation. The oracle confirms the combined Frame context
// (Transform + Stroke on the group box), the way InDesign shows it.

import { expect, test } from "@playwright/test";

import { MULTI_SELECT } from "../driver/context-contract";
import { Designer } from "../driver/designer";

test.describe("journey · multi-select", () => {
  test("selecting two shapes surfaces the combined Frame context @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:frames-paths.frame.insert @feat:editor-tools.select.click-marquee @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const a = await designer.drawRectangle({ x0: 70, y0: 90, x1: 240, y1: 230 });
    const b = await designer.drawRectangle({ x0: 300, y0: 90, x1: 470, y1: 230 });
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();

    await designer.selectElements([
      { kind: "rectangle", id: a },
      { kind: "rectangle", id: b },
    ]);
    await designer.expectContext(MULTI_SELECT);
  });
});
