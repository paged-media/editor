// Journey: export a from-scratch document.
//
// Closes the production loop — a document built from nothing must be
// saveable. Export to IDML and re-parse it through the engine, proving
// the blank-document path carries a valid `source_idml` for save-back.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · export", () => {
  test("a from-scratch document round-trips through IDML export", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Put real content on the page so the export carries page items.
    const id = await designer.drawRectangle({ x0: 90, y0: 120, x1: 300, y1: 280 });
    expect(id).toBeTruthy();
    await designer.applyFill("rectangle", id, "Color/Black");

    const { byteLength, pageCount } = await designer.exportAndReload();
    expect(byteLength, "exported IDML should be non-trivial").toBeGreaterThan(500);
    expect(pageCount, "re-parsed document keeps its single page").toBe(1);
  });
});
