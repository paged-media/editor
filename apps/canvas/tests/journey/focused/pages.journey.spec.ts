// Journey: add pages.
//
// A document grows — the designer inserts a second page. Asserts the
// page structure changed and the document now carries two pages.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · pages", () => {
  test("inserting a page grows the document to two pages @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @level:happy", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    expect((await designer.handle()).pageCount).toBe(1);

    const pageCount = await designer.addPage();
    expect(pageCount, "document should now have two pages").toBe(2);
  });
});
