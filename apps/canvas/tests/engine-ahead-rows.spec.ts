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

// Rows laid out AHEAD of the engine: a paragraph's line setting (Auto
// leading, Single word justification, Last line indent, Balance ragged
// lines) and a character's No break, on the text selection and on the
// paragraph / character style (core ADR 153, after engine 0.71.11).
//
// Each field is `hideUnreported`: it renders only when the target's
// schema has the row AND the running engine reads the path. So each
// test asks the ENGINE first (`RequestGet`):
//
//   · no such path → the panel must not offer the row at all;
//   · the engine reads it → the row must be there, set through the UI,
//     read back from the engine, one undo. If the engine reads the path
//     but the row stays hidden, the object model's schema lacks it: the
//     SDK's vendored catalog needs a re-sync (or the editor seam a row).

import { expect, test, type Locator, type Page } from "@playwright/test";

import { loadIdml, openCanvas, openPanel } from "./fidelity/canvas-driver";
import { generatedFixture, loadFixture } from "./e2e/harness/fixtures";
import { mutate, setCaret } from "./e2e/harness/ui";
import { fieldOf, undoOnce } from "./e2e/harness/objects";
import { engineGet, engineHasPath } from "./e2e/harness/engine";

async function commitNumber(field: Locator, value: number) {
  const input = field.locator("input").first();
  await input.click();
  await input.fill(String(value));
  await input.press("Enter");
}

interface AheadRow {
  path: string;
  /** Which paragraph / character surface lays it out. */
  family: "paragraph" | "character";
  set: (field: Locator) => Promise<unknown>;
  expected: unknown;
}

/** The panels' `@feat` tags per family (spelled out, so the tag
 *  vocabulary guard reads them). */
const TAGS = {
  paragraph: { text: "@feat:editor-shell.panels.paragraph", style: "@feat:editor-shell.panels.paragraph-styles" },
  character: { text: "@feat:editor-shell.panels.character", style: "@feat:editor-shell.panels.character-styles" },
} as const;

const ROWS: AheadRow[] = [
  { path: "paragraphAutoLeading", family: "paragraph", set: (f) => commitNumber(f, 135), expected: 135 },
  {
    path: "paragraphSingleWordJustification",
    family: "paragraph",
    set: (f) => f.locator("select").selectOption("LeftAlign"),
    expected: "LeftAlign",
  },
  { path: "paragraphLastLineIndent", family: "paragraph", set: (f) => commitNumber(f, 12), expected: 12 },
  {
    path: "paragraphBalanceRaggedLines",
    family: "paragraph",
    set: (f) => f.locator("select").selectOption("FullyBalanced"),
    expected: "FullyBalanced",
  },
  { path: "characterNoBreak", family: "character", set: (f) => f.locator('[role="switch"]').click(), expected: true },
];

/** A field every target of the family always shows: once it carries its
 *  schema type, the schema the gated row would come from has loaded. */
const SIBLING = { paragraph: "paragraphHyphenation", character: "characterLigatures" } as const;

async function hiddenOrRoundTrip(page: Page, scope: Locator, address: string, row: AheadRow) {
  await expect(fieldOf(scope, SIBLING[row.family])).toHaveAttribute("data-value-type", /.+/);
  const field = fieldOf(scope, row.path);
  if (!(await engineHasPath(page, address, row.path))) {
    test.info().annotations.push({ type: "engine", description: `the running engine has no ${row.path}: the row is hidden` });
    await expect(field).toHaveCount(0);
    return;
  }
  await expect(
    field,
    `the running engine reads ${row.path}, so the panel must offer it (the object model's schema lacks the row?)`,
  ).toBeVisible();
  const before = await engineGet(page, address, row.path);
  await row.set(field);
  await expect.poll(() => engineGet(page, address, row.path)).toEqual(row.expected);
  await undoOnce(page);
  await expect.poll(() => engineGet(page, address, row.path)).toEqual(before);
}

test.describe("Rows ahead of the engine: a paragraph's line setting, a character's No break", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await openCanvas(page);
  });

  for (const row of ROWS) {
    const panelId = row.family === "paragraph" ? "paged.paragraph" : "paged.character";
    test(`AHEAD-text-${row.path} — the ${row.family} panel offers ${row.path} exactly when the running engine reads it; then UI → engine, one undo ${TAGS[row.family].text} @feat:round-tripping.undo-redo @level:edge`, async ({
      page,
    }) => {
      const fx = await loadFixture(page, "text");
      const story = fx.firstStory!;
      expect(story, "the text fixture has a story").not.toBeNull();
      const end = Math.min(10, story.characterCount);
      await setCaret(page, story.selfId, 0, end);
      await openPanel(page, panelId);
      const scope = page.locator(`[data-${row.family}-panel="ready"]`);
      await expect(scope).toBeVisible();
      await hiddenOrRoundTrip(page, scope, `storyRange:${story.selfId}@0..${end}`, row);
    });

    test(`AHEAD-style-${row.path} — ${row.family} Style Options offer ${row.path} exactly when the running engine reads it; then UI → engine, one undo @feat:styles.set-style-property ${TAGS[row.family].style} @feat:round-tripping.undo-redo @level:edge`, async ({
      page,
    }) => {
      await loadIdml(page, generatedFixture("styles-cascade"));
      if (row.family === "character") {
        await mutate(page, { op: "createCharacterStyle", args: { name: "Ahead" } });
      }
      await openPanel(page, "paged.style-options");
      const panel = page.locator('[data-style-options-panel="ready"]');
      await expect(panel).toBeVisible();
      await panel.locator(`[data-cockpit-action="style-family-${row.family}"]`).click();
      await expect(panel).toHaveAttribute("data-style-family", row.family);
      await panel
        .locator("[data-style-options-select]")
        .selectOption(row.family === "paragraph" ? "ParagraphStyle/Body" : { label: "Ahead" });
      await expect(panel).toHaveAttribute("data-style-target", new RegExp(`^style:${row.family}/`));
      const address = (await panel.getAttribute("data-style-target"))!;
      await hiddenOrRoundTrip(page, panel, address, row);
    });
  }
});
