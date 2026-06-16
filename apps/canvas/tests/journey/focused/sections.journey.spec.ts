// Journey: page numbering sections.
//
// A multi-page document gets a numbering section — the way a designer
// starts "Part 1" numbering partway through a publication. Exercises the
// sections subsystem (insertSection at a page) and the page collection.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · sections", () => {
  test("start a numbering section on the second page", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    // Grow to two pages, then read the page list fresh from the engine.
    await designer.addPage();
    const pages = await designer.collection("pages");
    expect(pages.length).toBe(2);

    const sectionsBefore = (await designer.collection("sections")).length;
    const applied = await designer.insertSection(pages[1].selfId, {
      prefix: "Part-",
      startAt: 1,
    });
    expect(applied, "insertSection should apply").toBe(true);

    await expect
      .poll(async () => (await designer.collection("sections")).length, {
        timeout: 6000,
      })
      .toBeGreaterThan(sectionsBefore);
  });
});
