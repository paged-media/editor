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

// Journey: the style sheets.
//
// A designer building a reusable look creates each kind of style (paragraph,
// character, object, cell, table) and turns a paragraph into a bullet list.
// Creating a style grows its collection; the bullet edit lands on the
// selected story range. Collect-failures isolates each kind.

import { expect, test } from "@playwright/test";

import { mutate } from "../../e2e/harness/ui";
import { Designer } from "../driver/designer";

const collectionCount = (page: import("@playwright/test").Page, name: string) =>
  page.evaluate(
    (n) =>
      (
        globalThis as unknown as {
          __canvas: { client: { collection: (c: string) => Promise<unknown[]> } };
        }
      ).__canvas.client.collection(n).then((rows) => rows.length),
    name,
  );

test.describe("journey · styles CRUD", () => {
  test("create every style kind + a bullet list @feat:styles.paragraph.crud @feat:styles.character.crud @feat:styles.object.crud @feat:styles.cell.crud @feat:styles.table.crud @feat:styles.bullets-numbering @level:happy", async ({
    page,
  }) => {
    const designer = new Designer(page);
    await designer.open();
    await designer.newDocument();

    const fail: string[] = [];

    // Each style kind: create one, assert its collection grew by one.
    const kinds: Array<[string, string, string]> = [
      ["styles.paragraph.crud", "createParagraphStyle", "paragraphStyles"],
      ["styles.character.crud", "createCharacterStyle", "characterStyles"],
      ["styles.object.crud", "createObjectStyle", "objectStyles"],
      ["styles.cell.crud", "createCellStyle", "cellStyles"],
      ["styles.table.crud", "createTableStyle", "tableStyles"],
    ];
    for (const [feat, op, coll] of kinds) {
      try {
        const before = await collectionCount(page, coll);
        const r = (await mutate(page, {
          op,
          args: { name: `journey ${coll}` },
        })) as { kind?: string };
        const after = await collectionCount(page, coll);
        if (r.kind !== "mutationApplied" || after !== before + 1) fail.push(feat);
      } catch (e) {
        fail.push(`${feat} (${String(e).slice(0, 50)})`);
      }
    }

    // BULLETS — turn a typed paragraph into a bullet list on its range.
    try {
      const { storyId } = await designer.addTextFrame({ x0: 70, y0: 90, x1: 460, y1: 200 });
      await designer.placeCaret(storyId!, 0);
      const para = "First item";
      await designer.typeText(para);
      await expect
        .poll(() => designer.storyChars(storyId!), { timeout: 6000 })
        .toBeGreaterThanOrEqual(para.length);
      await designer.selectText(storyId!, 0, para.length);
      const range = {
        kind: "storyRange",
        id: { story_id: storyId, start: 0, end: para.length },
      };
      const r1 = (await mutate(page, {
        op: "setElementProperty",
        args: { elementId: range, path: "paragraphListType", value: { type: "text", value: "BulletList" } },
      })) as { kind?: string };
      const r2 = (await mutate(page, {
        op: "setElementProperty",
        args: { elementId: range, path: "paragraphBulletCharacter", value: { type: "text", value: "•" } },
      })) as { kind?: string };
      if (r1.kind !== "mutationApplied" || r2.kind !== "mutationApplied")
        fail.push("styles.bullets-numbering");
    } catch (e) {
      fail.push(`styles.bullets-numbering (${String(e).slice(0, 50)})`);
    }

    expect(fail, `style aspects that did not apply: ${fail.join(" | ")}`).toEqual([]);
  });
});
