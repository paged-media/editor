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

// The Properties panel names what is selected. It called every page-item
// selection a frame and counted the selected ids as frames, so a group
// read "Frame · 1 frame". A group is named a group, with the objects in
// it counted, as InDesign's Properties panel names it; a selection of a
// group and a frame counts each kind.

import { expect, test, type Page } from "@playwright/test";

import { Designer } from "../journey/driver/designer";

type Ref = { kind: string; id: string };

interface CanvasGlobal {
  __canvas: {
    elementSelection: Ref[];
    client: {
      executeScript: (s: string) => Promise<{ output: string[]; error: string | null }>;
    };
  };
}

const selection = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as CanvasGlobal).__canvas.elementSelection);

async function select(page: Page, refs: Ref[]): Promise<void> {
  await page.evaluate(
    (ids) =>
      (globalThis as unknown as CanvasGlobal).__canvas.client.executeScript(
        `paged.setElementSelection(${JSON.stringify(ids)})`,
      ),
    refs.map((r) => `${r.kind}:${r.id}`),
  );
  await expect
    .poll(async () => (await selection(page)).map((r) => `${r.kind}:${r.id}`).sort())
    .toEqual(refs.map((r) => `${r.kind}:${r.id}`).sort());
}

const panel = (page: Page) => page.locator('[data-properties-panel="ready"]');

async function expectNamed(page: Page, title: string, label: string): Promise<void> {
  await expect(panel(page).locator("[data-selection-label]")).toHaveText(label);
  await expect(panel(page).getByText(title, { exact: true })).toBeVisible();
}

/** Three rectangles; the first two grouped. */
async function groupAndFrame(page: Page): Promise<{ group: Ref; frame: Ref; leaves: Ref[] }> {
  const designer = new Designer(page);
  await designer.open();
  await designer.newDocument();
  const a = await designer.drawRectangle({ x0: 100, y0: 100, x1: 200, y1: 180 });
  const b = await designer.drawRectangle({ x0: 240, y0: 100, x1: 340, y1: 180 });
  const c = await designer.drawRectangle({ x0: 100, y0: 300, x1: 200, y1: 380 });
  const leaves = [
    { kind: "rectangle", id: a },
    { kind: "rectangle", id: b },
  ];
  await select(page, leaves);
  await expectNamed(page, "Frame", "Frame · 2 frames");
  // Object ▸ Group selects the group it made.
  await designer.runCommand("paged.object.group");
  await expect.poll(async () => (await selection(page)).map((r) => r.kind)).toEqual(["group"]);
  return { group: (await selection(page))[0], frame: { kind: "rectangle", id: c }, leaves };
}

test.describe("the Properties panel names the selection", () => {
  test("AC-PROP-NAME-1 — a group is named a group and its objects are counted @feat:editor-shell.panels.properties @feat:frames-paths.groups @level:happy", async ({
    page,
  }) => {
    await groupAndFrame(page);
    await expectNamed(page, "Group", "Group · 2 objects");
  });

  test("AC-PROP-NAME-2 — a group with a frame is named by both kinds @feat:editor-shell.panels.properties @feat:frames-paths.groups @level:edge", async ({
    page,
  }) => {
    const { group, frame } = await groupAndFrame(page);
    await select(page, [group, frame]);
    await expectNamed(page, "Objects", "Objects · 1 group, 1 frame");
    await select(page, [frame]);
    await expectNamed(page, "Frame", "Frame · 1 frame");
  });
});
