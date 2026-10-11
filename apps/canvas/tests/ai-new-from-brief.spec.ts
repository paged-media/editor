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

// File ▸ New from a brief… (ADR 221), with the proxy stubbed: the AI
// Assistant panel opens in its "New document" view, mints a blank page of
// the chosen size, Claude's scripts build the pages on it, and the steps
// and the summary show — a real two-page document at the end, with the
// page list refreshed although no mutationApplied announced the pages.

import { test, expect, type Route } from "@playwright/test";

import { openCanvas } from "./fidelity/canvas-driver";
import { textTurn, toolTurn } from "./ai-fixtures";

const BUILD = `
const first = JSON.parse(paged.pages())[0].selfId;
const second = paged.insertPage(first);
if (!second) throw new Error("insertPage");
for (const [page, text] of [[first, "Spring tea collection"], [second, "Opening hours"]]) {
  const ok = paged.batch([
    { op: "insertTextFrame", args: { pageId: page, bounds: [72, 72, 200, 523] } },
    { op: "bindCreated", args: { handle: "t" } },
    { op: "insertText", args: { storyId: "$h:t", offset: 0, text } },
  ]);
  if (!ok) throw new Error("page");
}
console.log(JSON.stringify(JSON.parse(paged.pages()).map((p) => p.sizePt)));`;

test("a brief becomes a document @feat:editor-shell.ai-new-from-brief @feat:editor-shell.menus @level:happy", async ({ page }) => {
  const sent: Array<{ mode: string | null; prompt: string }> = [];
  await page.route("**/api/ai/v1/messages", async (route: Route) => {
    const req = route.request();
    sent.push({ mode: req.headers()["x-paged-ai-mode"] ?? null, prompt: String((req.postDataJSON() as { messages: Array<{ content: unknown }> }).messages[0]!.content) });
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sent.length === 1 ? toolTurn(BUILD) : textTurn("Built a two-page spring tea catalogue.") });
  });
  await openCanvas(page);
  await page.evaluate(() =>
    (globalThis as unknown as { __canvas: { registries: { commands: { invoke(id: string): Promise<unknown> } } } }).__canvas.registries.commands.invoke("paged.file.newFromBrief"),
  );
  const panel = page.locator("[data-ai-assistant]");
  await expect(panel).toHaveAttribute("data-ai-assistant-view", "brief");
  await expect(panel.locator("[data-powered-by-claude]")).toBeVisible();
  const dialog = panel.locator("[data-new-from-brief]");
  await dialog.locator("[data-brief-input]").fill("A two-page spring catalogue for a tea shop");
  await dialog.locator("[data-brief-size]").selectOption("a4");
  await dialog.locator("[data-cockpit-action=brief-generate]").click();

  await expect(panel.locator("[data-brief-summary]")).toHaveText("Built a two-page spring tea catalogue.");
  await expect(panel.locator("[data-ai-step=ok]")).toHaveCount(1);
  expect(sent[0]!.mode).toBe("document");
  expect(sent[0]!.prompt).toContain("Page size: A4 (595 × 842 pt)");

  const meta = await page.evaluate(() =>
    (globalThis as unknown as { __canvas: { client: { documentMeta(): Promise<{ pageCount: number }> } } }).__canvas.client.documentMeta(),
  );
  expect(meta.pageCount).toBe(2);
  // The shell re-read the page list after Claude's scripts.
  await expect
    .poll(() => page.evaluate(() => (globalThis as unknown as { __canvas: { handle?: { pageCount: number } | null } }).__canvas.handle?.pageCount ?? null))
    .toBe(2);
  await panel.locator("[data-cockpit-action=ai-dismiss]").click();
  await expect(panel).toHaveAttribute("data-ai-assistant-state", "idle");
});
