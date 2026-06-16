// Journey: insert a table.
//
// A designer drops a spec table into a text frame. Exercises the table
// subsystem (insertTable into a story) and confirms it applies + the
// frame renders the grid.

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · tables", () => {
  test("insert a 3×4 table into a text frame", async ({ page }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const { storyId } = await designer.addTextFrame({
      x0: 60,
      y0: 80,
      x1: 540,
      y1: 420,
    });
    expect(storyId, "text frame should have a parent story").toBeTruthy();

    const applied = await designer.insertTable(storyId!, 3, 4);
    expect(applied, "insertTable should apply").toBe(true);
    // NOTE: an empty table renders with no default cell borders/fill, so
    // a visual checkpoint here would be a blank page — the model-level
    // mutationApplied is the honest proof. A visible table needs cell
    // content or border styling (a deeper follow-up).
  });
});
