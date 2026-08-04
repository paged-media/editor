/*
 * This file is part of paged (https://paged.media), the commercial editor
 * for the paged IDML engine.
 *
 * paged is free software: you may redistribute it and/or modify it under the
 * terms of the GNU Affero General Public License, version 3, as published by
 * the Free Software Foundation, OR under the Paged Media Enterprise License
 * (PMEL), a commercial license available from And The Next GmbH. Full
 * copyright and license information is available in LICENSE.md, distributed
 * with this source code.
 *
 * paged is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the licenses for details.
 *
 *  @copyright  Copyright (c) And The Next GmbH
 *  @license    AGPL-3.0-only OR Paged Media Enterprise License (PMEL)
 */

// Journey: group objects.
//
// Draw two shapes (real pointer drags), select them, and group them
// through the REAL Object ▸ Group command — then ungroup through
// Object ▸ Ungroup. Asserts a group element appears in (and leaves)
// the scene tree.
//
// The command is `paged.object.group`, a HOST command: this journey
// runs with no dependence on the vector plugin. It used to drive the
// raw `createGroup` mutation because the only Group COMMAND in the
// product lived in paged.draw — the gap that put the `paged.object.*`
// layer in the editor.
//
// (Previously fixme'd: the engine-synthesised blank doc kept an empty
// `frames_in_order` z-table, so the group op rejected the members. Fixed
// in core — paged-mutate now materialises the table from the kind vecs
// before grouping. See group_ops.rs
// `create_group_on_empty_frames_in_order_materialises_and_succeeds`.)

import { expect, test } from "@playwright/test";

import { Designer } from "../driver/designer";

test.describe("journey · group", () => {
  test("grouping two shapes creates a group in the scene tree @feat:editor-shell.context-toolbars @feat:editor-shell.panels.properties @feat:editor-shell.menus @feat:frames-paths.frame.insert @feat:frames-paths.groups @level:happy", async ({
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
    await designer.selectElements([
      { kind: "rectangle", id: a },
      { kind: "rectangle", id: b },
    ]);
    await expect.poll(() => designer.elementSelection()).toHaveLength(2);

    // Object ▸ Group — the menu verb, not the raw op.
    await designer.runCommand("paged.object.group");
    await expect
      .poll(() => designer.count("group"), { timeout: 6000 })
      .toBe(groupsBefore + 1);
    // The minted group is what the user now has selected, so the next
    // verb (move, Arrange, Ungroup) addresses it.
    const selected = await designer.elementSelection();
    expect(selected).toHaveLength(1);
    expect(selected[0].kind).toBe("group");

    // Object ▸ Ungroup — the exact inverse, back to two loose shapes.
    await designer.runCommand("paged.object.ungroup");
    await expect
      .poll(() => designer.count("group"), { timeout: 6000 })
      .toBe(groupsBefore);
    expect(
      (await designer.elementSelection()).map((s) => s.id).sort(),
    ).toEqual([a, b].sort());
  });
});
