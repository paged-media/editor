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

// ADR 323 (Wave 6) — the TEXT panels on the object model, end to end on
// the real engine: Character, Paragraph, Bullets & numbering, Paragraph
// styles (style apply). A content selection (a story range) is the
// target; for each panel a write through its own control → the value read
// back through `host.objects` on the `storyRange:` address → ONE undo
// restores it. "Bind to data…" is opened on Character ▸ Size (schema
// field) and on Bullets ▸ Glyph (a bespoke field in an ObjectFieldFrame).

import { expect, test, type Page } from "@playwright/test";

import { openCanvas, openPanel } from "./fidelity/canvas-driver";
import { loadFixture } from "./e2e/harness/fixtures";
import { setCaret } from "./e2e/harness/ui";
import { bindDryRun, fieldOf, objGet, objQuery, undoOnce } from "./e2e/harness/objects";

async function commit(page: Page, input: ReturnType<Page["locator"]>, value: string) {
  await input.click();
  await input.fill(value);
  await input.press("Enter");
}

test.describe("ADR 323 — text panels write through host.objects", () => {
  let range: string;

  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
    const fx = await loadFixture(page, "text");
    const story = fx.stories.find((s) => s.characterCount >= 3);
    expect(story).toBeTruthy();
    await setCaret(page, story!.selfId, 0, 3);
    // The canonical address of that range, as the registry spells it.
    const hits = await objQuery(page, "story");
    expect(hits.length).toBeGreaterThan(0);
    range = `storyRange:${story!.selfId}@0..3`;
    expect(typeof (await objGet(page, range, "characterFontSize"))).not.toBe("string");
  });

  test("OM-TEXT-1 — Character ▸ Size (schema field): set → host.objects → one undo; Bind to data… @feat:editor-shell.panels.character @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openPanel(page, "paged.character");
    const field = fieldOf(page.locator('[data-character-panel="ready"]'), "characterFontSize");
    await expect(field).toHaveAttribute("data-value-type", "length");
    await expect(field).toHaveAttribute("data-binding-source", "core");
    const before = await objGet(page, range, "characterFontSize");
    const next = before === 23 ? 25 : 23;
    await commit(page, field.locator("input").first(), String(next));
    await expect.poll(() => objGet(page, range, "characterFontSize")).toBe(next);
    await undoOnce(page);
    await expect.poll(() => objGet(page, range, "characterFontSize")).toEqual(before);
    await bindDryRun(page, field, "characterFontSize");
  });

  test("OM-TEXT-2 — Paragraph ▸ Space before (schema field): set → host.objects → one undo @feat:editor-shell.panels.paragraph @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openPanel(page, "paged.paragraph");
    const field = fieldOf(page.locator('[data-paragraph-panel="ready"]'), "paragraphSpaceBefore");
    await expect(field).toHaveAttribute("data-value-type", "length");
    const before = await objGet(page, range, "paragraphSpaceBefore");
    const next = before === 9 ? 11 : 9;
    await commit(page, field.locator("input").first(), String(next));
    await expect.poll(() => objGet(page, range, "paragraphSpaceBefore")).toBe(next);
    await undoOnce(page);
    await expect.poll(() => objGet(page, range, "paragraphSpaceBefore")).toEqual(before);
  });

  test("OM-TEXT-3 — Bullets ▸ Glyph (bespoke field): set → host.objects → one undo; Bind to data… @feat:editor-shell.panels.bullets-numbering @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openPanel(page, "paged.bullets-numbering");
    const field = fieldOf(page, "paragraphBulletCharacter");
    await expect(field).toHaveAttribute("data-value-type", "text");
    const before = await objGet(page, range, "paragraphBulletCharacter");
    const next = before === "*" ? "+" : "*";
    await commit(page, field.locator('[data-bullets-field="bullet-character"]'), next);
    await expect.poll(() => objGet(page, range, "paragraphBulletCharacter")).toBe(next);
    await undoOnce(page);
    await expect.poll(() => objGet(page, range, "paragraphBulletCharacter")).toEqual(before);
    await bindDryRun(page, field, "paragraphBulletCharacter");
  });

  test("OM-TEXT-4 — Paragraph styles ▸ apply (applied-style ref field): set → host.objects → one undo @feat:editor-shell.panels.paragraph-styles @feat:scripting.property-readwrite @feat:round-tripping.undo-redo @level:happy", async ({
    page,
  }) => {
    await openPanel(page, "paged.paragraph-styles");
    const field = fieldOf(page, "appliedParagraphStyle");
    await expect(field).toHaveAttribute("data-value-type", "ref");
    const before = await objGet(page, range, "appliedParagraphStyle");
    const items = field.locator("[data-apply-item]");
    await expect(items.first()).toBeVisible();
    const ids = await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-apply-item")));
    const target = ids.find((id) => id && id !== before);
    expect(target, `a style other than ${String(before)}`).toBeTruthy();
    await field.locator(`[data-apply-item="${target}"]`).click();
    await expect.poll(() => objGet(page, range, "appliedParagraphStyle")).toBe(target);
    await undoOnce(page);
    await expect.poll(() => objGet(page, range, "appliedParagraphStyle")).toEqual(before);
  });
});
