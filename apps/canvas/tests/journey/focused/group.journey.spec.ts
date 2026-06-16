// Journey: group objects.
//
// Draw two shapes (real pointer drags) and group them (Object ▸ Group).
// Asserts a group element appears in the scene tree.
//
// (Previously fixme'd: the engine-synthesised blank doc kept an empty
// `frames_in_order` z-table, so the group op rejected the members. Fixed
// in core — paged-mutate now materialises the table from the kind vecs
// before grouping. See group_ops.rs
// `create_group_on_empty_frames_in_order_materialises_and_succeeds`.)

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · group", () => {
  test("grouping two shapes creates a group in the scene tree", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const a = await designer.drawRectangle({ x0: 70, y0: 90, x1: 240, y1: 230 });
    const b = await designer.drawRectangle({ x0: 300, y0: 90, x1: 470, y1: 230 });
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();

    const groupsBefore = await designer.count("group");
    const applied = await designer.createGroup([
      { kind: "rectangle", id: a },
      { kind: "rectangle", id: b },
    ]);
    expect(applied, "createGroup should apply").toBe(true);
    await expect
      .poll(() => designer.count("group"), { timeout: 6000 })
      .toBe(groupsBefore + 1);
  });
});
